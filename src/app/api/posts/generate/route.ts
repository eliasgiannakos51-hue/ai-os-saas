import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { logApiError } from "@/lib/log-error";
import { isAdminEmail } from "@/lib/auth/admin-emails";
import { hasActiveBetaBypass } from "@/lib/beta";
import { checkBypassCeiling } from "@/lib/billing/bypass-ceiling";
import { checkAiCallAllowed, fingerprintRequest, recordAiCallForDailySpend } from "@/lib/ai-circuit-breaker";
import {
  getPurchasedPackCreditPriceEur,
  hasEnoughCredits,
  insufficientCreditsMessage,
  resolveEffectivePlan,
} from "@/lib/billing/credits";
import { CostAccumulator } from "@/lib/billing/cost-accumulator";
import { estimateForAction } from "@/lib/billing/estimate";
import { resolvePricingConfig } from "@/lib/billing/pricing-config";
import { effectiveCreditPriceEurForAccount } from "@/lib/billing/credit-formula";
import { releaseReservation, reserveCredits, settleReservation } from "@/lib/billing/reservations";
import { resolveLanguage } from "@/lib/text/resolve-language";
import { SUPPORTED_LOCALES } from "@/i18n/constants";
import { checkDescription, normalisePlatforms, postsEstimateInputChars, type PostPlatform } from "@/lib/posts/platforms";
import { POSTS_MODEL } from "@/lib/posts/prompt";
import { generatePosts } from "@/lib/posts/generate";

export const dynamic = "force-dynamic";
// One forced-tool call returning at most five short posts; measured well
// under a minute, and the same ceiling as the other single-call routes.
export const maxDuration = 60;

/**
 * BRIEF IN, ONE POST PER PLATFORM OUT — AND NOTHING PUBLISHED.
 *
 * The same pipeline every paid route runs, in the same order the
 * route-refusals gate holds: body before user, breaker before plan, hold
 * before model, nothing spent before the last refusal. There is no
 * social API in this file or anywhere this file reaches: the result is
 * text the person copies, and the page says so.
 *
 * THE ROW IS WRITTEN THROUGH THE SERVICE ROLE, with user_id stamped from
 * the session, because generated_posts revokes insert from authenticated
 * (20260930000000_generated_posts.sql) for the same reason code_sessions
 * does. Reads go through the person's own client, so RLS decides them.
 */
export async function POST(request: Request) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return NextResponse.json({ error: "not_configured" }, { status: 503 });

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  }
  const description = typeof body.description === "string" ? body.description.trim() : "";
  const verdict = checkDescription(description);
  if (!verdict.ok) return NextResponse.json({ error: verdict.reason, limit: verdict.limit }, { status: 400 });
  const platforms: PostPlatform[] = normalisePlatforms(body.platforms);
  const uiLocale =
    typeof body.locale === "string" && (SUPPORTED_LOCALES as readonly string[]).includes(body.locale)
      ? body.locale
      : "en";

  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "not_signed_in" }, { status: 401 });

  try {
    const breaker = await checkAiCallAllowed(
      user.id,
      "posts_generate",
      fingerprintRequest(description, platforms.join(","))
    );
    if (!breaker.allowed) return NextResponse.json({ error: "rate_limited", detail: breaker.reason }, { status: 429 });

    const isAdmin = isAdminEmail(user.email);
    const isBeta = await hasActiveBetaBypass(user);
    const bypass = isAdmin || isBeta;
    if (bypass) {
      const ceiling = await checkBypassCeiling(user.id, isAdmin, isBeta);
      if (!ceiling.allowed) return NextResponse.json({ error: "bypass_ceiling", detail: ceiling.reason }, { status: 429 });
    }

    const plan = await resolveEffectivePlan(user);
    const pricingConfig = resolvePricingConfig();
    const estimate = estimateForAction(
      "postsGenerate",
      {
        model: POSTS_MODEL,
        inputChars: postsEstimateInputChars(description.length, platforms),
        planSlug: plan?.slug ?? null,
      },
      pricingConfig,
      plan
        ? effectiveCreditPriceEurForAccount(plan, await getPurchasedPackCreditPriceEur(user.id), pricingConfig)
        : undefined
    );

    let reservationId = "";
    if (!bypass && plan) {
      const enough = await hasEnoughCredits(user.id, estimate.reserveCredits, plan);
      if (!enough.ok) {
        return NextResponse.json(
          { error: "insufficient_credits", detail: insufficientCreditsMessage(enough.remaining, estimate.reserveCredits) },
          { status: 402 }
        );
      }
      const reservation = await reserveCredits(user.id, estimate.reserveCredits, "posts_generate", {
        platforms,
        descriptionChars: description.length,
      });
      if (!reservation.ok) return NextResponse.json({ error: "reserve_failed", detail: reservation.reason }, { status: 402 });
      reservationId = reservation.reservationId;
    }

    const locale = resolveLanguage(description, uiLocale);
    const costs = new CostAccumulator();
    void recordAiCallForDailySpend(estimate.estimatedCredits);
    const outcome = await generatePosts({
      apiKey,
      description,
      platforms,
      locale,
      costs,
      // THE STOP BUTTON: the request's own abort signal.
      signal: request.signal,
    });

    const admin = createAdminClient();

    if (!outcome.ok && outcome.kind === "aborted") {
      // Nothing produced, nothing charged, no history row: the person
      // did this, and "failed" would be the wrong word for it.
      await releaseReservation(user.id, reservationId);
      return NextResponse.json({ error: "stopped" }, { status: 499 });
    }

    if (!outcome.ok && outcome.kind === "provider") {
      await releaseReservation(user.id, reservationId);
      logApiError("/api/posts/generate", new Error(outcome.detail), { kind: outcome.kind });
      const { error: failError } = await admin.from("generated_posts").insert({
        user_id: user.id,
        description,
        platforms,
        locale,
        status: "failed",
        error: "ai_unavailable",
      });
      if (failError) logApiError("/api/posts/generate", failError, { stage: "record_failure" });
      return NextResponse.json({ error: "ai_unavailable" }, { status: 503 });
    }

    if (!outcome.ok) {
      // The model answered and the answer was not a set of posts. The
      // tokens were spent, so the call SETTLES rather than pretending it
      // never happened.
      logApiError("/api/posts/generate", new Error(outcome.detail), { kind: outcome.kind });
      const settlement = await settleReservation({
        userId: user.id,
        reservationId,
        feature: "posts_generate",
        costs,
        plan,
        bypassCharge: bypass,
        metadata: { platforms, outcome: outcome.kind },
      });
      const { error: failError } = await admin.from("generated_posts").insert({
        user_id: user.id,
        description,
        platforms,
        locale,
        status: "failed",
        error: "unusable",
        credits_charged: settlement.creditsCharged,
      });
      if (failError) logApiError("/api/posts/generate", failError, { stage: "record_failure" });
      return NextResponse.json({ error: "unusable", creditsCharged: settlement.creditsCharged }, { status: 502 });
    }

    const settlement = await settleReservation({
      userId: user.id,
      reservationId,
      feature: "posts_generate",
      costs,
      plan,
      bypassCharge: bypass,
      metadata: { platforms, returned: outcome.set.posts.length, locale },
    });

    const { data: row, error: saveError } = await admin
      .from("generated_posts")
      .insert({
        user_id: user.id,
        description,
        platforms,
        posts: outcome.set,
        locale,
        status: "done",
        credits_charged: settlement.creditsCharged,
      })
      .select("id")
      .single();
    if (saveError) logApiError("/api/posts/generate", saveError, { stage: "save" });

    return NextResponse.json({
      ok: true,
      id: row?.id ?? null,
      set: outcome.set,
      creditsCharged: settlement.creditsCharged,
    });
  } catch (err) {
    logApiError("/api/posts/generate", err);
    return NextResponse.json({ error: "generate_failed" }, { status: 500 });
  }
}
