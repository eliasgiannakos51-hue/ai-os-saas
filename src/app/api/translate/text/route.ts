import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { logApiError } from "@/lib/log-error";
import { isAdminEmail } from "@/lib/auth/admin-emails";
import { hasActiveBetaBypass } from "@/lib/beta";
import { isFeatureOn } from "@/lib/flags/flags";
import { checkBypassCeiling } from "@/lib/billing/bypass-ceiling";
import { checkAiCallAllowed, fingerprintRequest, recordAiCallForDailySpend } from "@/lib/ai-circuit-breaker";
import { getPurchasedPackCreditPriceEur, hasEnoughCredits, insufficientCreditsMessage, resolveEffectivePlan } from "@/lib/billing/credits";
import { CostAccumulator } from "@/lib/billing/cost-accumulator";
import { estimateForAction } from "@/lib/billing/estimate";
import { resolvePricingConfig } from "@/lib/billing/pricing-config";
import { effectiveCreditPriceEurForAccount } from "@/lib/billing/credit-formula";
import { releaseReservation, reserveCredits, settleReservation } from "@/lib/billing/reservations";
import { isSupportedTargetLocale } from "@/lib/documents/translation";
import { isTranslateStyle, translateTextInputChars, type TranslateStyle } from "@/lib/translate/translate-prompt";
import { MAX_TRANSLATE_TARGETS, MAX_TRANSLATE_TEXT_CHARS, planText, rebuildText } from "@/lib/translate/text-source";
import { anyProviderConfigured } from "@/lib/ai/providers/registry";
import { translateTextPieces } from "@/lib/translate/translate-call";

export const dynamic = "force-dynamic";
export const maxDuration = 300; // @function-limit 300

/**
 * PASTED TEXT, INTO UP TO FIVE LANGUAGES AT ONCE (the standalone Translate
 * tool, package 1-2, behind the switch "translate-tool"). The same order
 * as api/translate/route.ts: a price without a hold, a translation with
 * one. The difference is the input (typed text, not a stored site or
 * document) and the output (up to five results, not one copy): one
 * estimate, one reservation and one settlement cover every target
 * together, so the price shown before pressing send is the price held and
 * the price charged, the same property api/translate/route.ts has for one
 * target.
 *
 * A TARGET ALREADY IN THE DETECTED SOURCE LANGUAGE COSTS NOTHING AND ASKS
 * THE MODEL NOTHING: its "translation" is the text unchanged, same as a
 * site whose language already matches would refuse outright — except here
 * refusing the WHOLE request over one same-language target among several
 * would throw away the other, different ones, so it is a per-target
 * no-op instead.
 */
const MIN_PARAGRAPH_CHARS = 1;
type Mode = "price" | "run";
const isMode = (v: unknown): v is Mode => v === "price" || v === "run";

type Body = { text: unknown; targets: unknown; style: unknown; mode: unknown };

function parseBody(body: Body): { ok: true; text: string; targets: string[]; style: TranslateStyle; mode: Mode } | { ok: false; code: string } {
  if (!isMode(body.mode)) return { ok: false, code: "invalid_request" };
  if (typeof body.text !== "string" || body.text.trim().length < MIN_PARAGRAPH_CHARS) return { ok: false, code: "nothing_to_translate" };
  if (!isTranslateStyle(body.style)) return { ok: false, code: "invalid_request" };
  if (!Array.isArray(body.targets) || body.targets.length === 0 || body.targets.length > MAX_TRANSLATE_TARGETS) return { ok: false, code: "invalid_request" };
  const targets = [...new Set(body.targets)];
  if (targets.length > MAX_TRANSLATE_TARGETS || !targets.every(isSupportedTargetLocale)) return { ok: false, code: "invalid_request" };
  return { ok: true, text: body.text, targets: targets as string[], style: body.style, mode: body.mode };
}

async function priceOneTarget(plan: Awaited<ReturnType<typeof resolveEffectivePlan>>, packPriceEur: number | null, pricingConfig: ReturnType<typeof resolvePricingConfig>, inputChars: number) {
  return estimateForAction(
    "documentTranslate",
    { model: "claude-sonnet-4-6", inputChars, planSlug: plan?.slug ?? null },
    pricingConfig,
    plan ? effectiveCreditPriceEurForAccount(plan, packPriceEur, pricingConfig) : undefined
  );
}

export async function POST(request: Request) {
  let body: Body;
  try {
    body = (await request.json()) as Body;
  } catch {
    return NextResponse.json({ ok: false, code: "invalid_body" }, { status: 400 });
  }
  const parsed = parseBody(body);

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ ok: false, code: "not_signed_in" }, { status: 401 });
  if (!(await isFeatureOn("translate-tool", user))) return NextResponse.json({ ok: false, code: "not_enabled" }, { status: 403 });
  if (!parsed.ok) return NextResponse.json({ ok: false, code: parsed.code }, { status: 400 });
  const { text, targets, style, mode } = parsed;

  const plan = planText(text);
  if (plan.pieces.length === 0) return NextResponse.json({ ok: false, code: "nothing_to_translate" }, { status: 400 });
  const chars = text.length;
  if (chars > MAX_TRANSLATE_TEXT_CHARS) return NextResponse.json({ ok: false, code: "too_long", chars, limit: MAX_TRANSLATE_TEXT_CHARS }, { status: 413 });

  const liveTargets = targets.filter((t) => t !== plan.from);
  const sameLanguageTargets = targets.filter((t) => t === plan.from);
  if (liveTargets.length === 0) return NextResponse.json({ ok: false, code: "same_language", from: plan.from }, { status: 400 });

  try {
    if (mode === "price") {
      const resolvedPlan = await resolveEffectivePlan(user);
      const pricingConfig = resolvePricingConfig();
      const packPriceEur = await getPurchasedPackCreditPriceEur(user.id);
      const bypass = isAdminEmail(user.email) || (await hasActiveBetaBypass(user));
      let estimatedCredits = 0;
      let reserveCredits = 0;
      const perTarget: { target: string; estimatedCredits: number; sameLanguage: boolean }[] = [];
      for (const target of liveTargets) {
        const estimate = await priceOneTarget(resolvedPlan, packPriceEur, pricingConfig, translateTextInputChars(plan.pieces, target, style));
        estimatedCredits += estimate.estimatedCredits;
        reserveCredits += estimate.reserveCredits;
        perTarget.push({ target, estimatedCredits: estimate.estimatedCredits, sameLanguage: false });
      }
      for (const target of sameLanguageTargets) perTarget.push({ target, estimatedCredits: 0, sameLanguage: true });
      return NextResponse.json({ ok: true, from: plan.from, paragraphs: plan.pieces.length, chars, perTarget, estimatedCredits, reserveCredits, bypass });
    }

    if (!anyProviderConfigured(process.env)) return NextResponse.json({ ok: false, code: "not_configured" }, { status: 503 });

    const breaker = await checkAiCallAllowed(user.id, "text_translate", fingerprintRequest(text, targets.join(",")));
    if (!breaker.allowed) return NextResponse.json({ ok: false, code: "rate_limited" }, { status: 429 });
    const isAdmin = isAdminEmail(user.email);
    const isBeta = await hasActiveBetaBypass(user);
    const bypass = isAdmin || isBeta;
    if (bypass) {
      const ceiling = await checkBypassCeiling(user.id, isAdmin, isBeta);
      if (!ceiling.allowed) return NextResponse.json({ ok: false, code: "rate_limited" }, { status: 429 });
    }

    const resolvedPlan = await resolveEffectivePlan(user);
    const pricingConfig = resolvePricingConfig();
    const packPriceEur = await getPurchasedPackCreditPriceEur(user.id);
    let estimatedCredits = 0;
    let reserveCreditsTotal = 0;
    for (const target of liveTargets) {
      const estimate = await priceOneTarget(resolvedPlan, packPriceEur, pricingConfig, translateTextInputChars(plan.pieces, target, style));
      estimatedCredits += estimate.estimatedCredits;
      reserveCreditsTotal += estimate.reserveCredits;
    }

    let reservationId = "";
    if (!bypass && resolvedPlan) {
      const enough = await hasEnoughCredits(user.id, reserveCreditsTotal, resolvedPlan);
      if (!enough.ok) {
        return NextResponse.json({ ok: false, code: "insufficient_credits", detail: insufficientCreditsMessage(enough.remaining, reserveCreditsTotal) }, { status: 402 });
      }
      const reservation = await reserveCredits(user.id, reserveCreditsTotal, "text_translate", { targets: liveTargets, paragraphs: plan.pieces.length });
      if (!reservation.ok) return NextResponse.json({ ok: false, code: "insufficient_credits" }, { status: 402 });
      reservationId = reservation.reservationId;
    }

    const costs = new CostAccumulator();
    void recordAiCallForDailySpend(estimatedCredits);
    const results: { target: string; paragraphs: string[]; kept: number; sameLanguage: boolean }[] = [];
    let failure: { code: string } | null = null;
    for (const target of liveTargets) {
      const outcome = await translateTextPieces({ pieces: plan.pieces, target, style, costs, userId: user.id, signal: request.signal });
      if (!outcome.ok) {
        failure = { code: outcome.kind === "aborted" ? "stopped" : "ai_unavailable" };
        break;
      }
      if (outcome.unanswered >= plan.pieces.length) {
        failure = { code: "unusable" };
        break;
      }
      const rebuilt = rebuildText(plan.paragraphs, outcome.value);
      results.push({ target, paragraphs: rebuilt.paragraphs, kept: rebuilt.kept, sameLanguage: false });
    }

    if (failure) {
      await releaseReservation(user.id, reservationId);
      const status = failure.code === "stopped" ? 499 : failure.code === "unusable" ? 502 : 503;
      if (failure.code === "ai_unavailable") logApiError("/api/translate/text", new Error("translation failed"), { stage: "translate" });
      return NextResponse.json({ ok: false, code: failure.code }, { status });
    }

    for (const target of sameLanguageTargets) results.push({ target, paragraphs: plan.paragraphs, kept: 0, sameLanguage: true });

    const settlement = await settleReservation({
      userId: user.id,
      reservationId,
      feature: "text_translate",
      costs,
      plan: resolvedPlan,
      bypassCharge: bypass,
      metadata: { from: plan.from, targets: liveTargets, paragraphs: plan.pieces.length, style },
    });

    return NextResponse.json({ ok: true, from: plan.from, results, creditsCharged: settlement.creditsCharged });
  } catch (err) {
    logApiError("/api/translate/text", err);
    return NextResponse.json({ ok: false, code: "failed" }, { status: 500 });
  }
}
