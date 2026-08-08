import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { loadWeeklyReflectionStats } from "@/lib/reflection";
import { buildReflectionUserMessage, generateWeeklyReflection, REFLECTION_MODEL } from "@/lib/reflection-agent";
import { logApiError } from "@/lib/log-error";
import { isAdminEmail } from "@/lib/admin";
import { hasActiveBetaBypass } from "@/lib/beta";
import { checkAiCallAllowed, fingerprintRequest, recordAiCallForDailySpend } from "@/lib/ai-circuit-breaker";
import {
  CREDIT_COSTS,
  getPurchasedPackCreditPriceEur,
  hasEnoughCredits,
  insufficientCreditsMessage,
  resolveEffectivePlan,
} from "@/lib/billing/credits";
import { CostAccumulator } from "@/lib/billing/cost-accumulator";
import { estimateForAction } from "@/lib/billing/estimate";
import { resolvePricingConfig } from "@/lib/billing/pricing-config";
import { effectiveCreditPriceEurForAccount } from "@/lib/billing/credit-formula";
import { reserveCredits, settleReservation, releaseReservation } from "@/lib/billing/reservations";
import { buildUsageReceipt } from "@/lib/billing/usage-receipt";

export const dynamic = "force-dynamic";

// Same platform-timeout reasoning as api/create/route.ts. The reflection
// generation call (700 tokens) is this route's only AI call; 90s is
// ample headroom.
export const maxDuration = 90;

// Module tables scoped to Trading Workflow's "Trading Reflection" (see
// reflection-generator.tsx's `scope` prop) — trading itself plus the two
// modules most likely to be linked to a trade via the Knowledge Graph.
const TRADING_SCOPE_TABLES = ["trades", "finance_entries", "decisions"];
// Product Workflow's "Product Reflection" scope (see
// components/reflection/reflection-generator.tsx's `scope` prop) —
// products plus the two modules most likely to be linked to a product via
// the Knowledge Graph.
const PRODUCT_SCOPE_TABLES = ["products", "content", "leads"];

// On-demand Weekly Reflection: computes real this-week-vs-last-week stats
// (lib/reflection.ts) across every module and every mission, then hands
// them to the Reflection Agent (lib/reflection-agent.ts) for a short,
// honest synthesis. Request body is optional — an empty body (every
// caller except Trading Reflection) reflects the account's current data
// across every module, exactly as before; nothing is persisted either way.
export async function POST(request: Request) {
  try {
    let scope: string | null = null;
    try {
      const raw = await request.text();
      if (raw) {
        const body = JSON.parse(raw);
        scope = typeof body?.scope === "string" ? body.scope : null;
      }
    } catch {
      scope = null;
    }
    const tableFilter =
      scope === "trading" ? TRADING_SCOPE_TABLES : scope === "product" ? PRODUCT_SCOPE_TABLES : undefined;

    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      return NextResponse.json(
        { ok: false, error: "ANTHROPIC_API_KEY is not configured on the server." },
        { status: 500 }
      );
    }

    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ ok: false, error: "Not authenticated." }, { status: 401 });
    }

    // Circuit breaker: independent of credits (see lib/ai-circuit-breaker.ts).
    const breakerCheck = await checkAiCallAllowed(user.id, "reflection_generate", fingerprintRequest(scope));
    if (!breakerCheck.allowed) {
      return NextResponse.json({ ok: true, generated: false, rateLimited: true, message: breakerCheck.reason });
    }

    // Credits: read-only check first, actual deduct only after
    // generateWeeklyReflection() has confirmed-successfully returned —
    // nothing is persisted for this feature either way (see the comment
    // above), so a successful AI response IS the confirmed success here.
    const isAdmin = isAdminEmail(user.email);
    const bypassCredits = isAdmin || (await hasActiveBetaBypass(user));
    // Was a flat CREDIT_COSTS.weeklyReflection (2 credits) with NO usage
    // tracking whatsoever — the only AI call in the app whose tokens
    // reached no cost log at all. The input is a whole week of activity,
    // so it is also one of the larger ones. See CREDITS.md.
    // Always resolved, never null — even for a bypass account.
    //
    // A null plan reached the cost log as planSlug: null, and made
    // wouldHaveChargedCredits price against the LIST rate instead of the
    // account's own. The saving was one metadata read; the cost was that
    // admin and beta rows could not be checked against anything.
    const plan = await resolveEffectivePlan(user);

    // Stats are loaded first because they ARE the input being priced.
    const stats = await loadWeeklyReflectionStats(supabase, tableFilter);
    const userMessage = buildReflectionUserMessage(stats);

    const pricingConfig = resolvePricingConfig();
    const estimate = estimateForAction(
      "weeklyReflection",
      { model: REFLECTION_MODEL, inputChars: userMessage.length, planSlug: plan?.slug ?? null },
      pricingConfig,
      plan
        ? effectiveCreditPriceEurForAccount(plan, await getPurchasedPackCreditPriceEur(user.id), pricingConfig)
        : undefined
    );

    let reservationId = "";
    if (!bypassCredits && plan) {
      const check = await hasEnoughCredits(user.id, estimate.reserveCredits, plan);
      if (!check.ok) {
        return NextResponse.json({
          ok: true,
          generated: false,
          rateLimited: true,
          message: insufficientCreditsMessage(check.remaining, estimate.reserveCredits),
        });
      }
      const reservation = await reserveCredits(user.id, estimate.reserveCredits, "weekly_reflection", {});
      if (!reservation.ok) {
        return NextResponse.json({
          ok: true,
          generated: false,
          rateLimited: true,
          message:
            reservation.reason === "insufficient"
              ? insufficientCreditsMessage(reservation.available, estimate.reserveCredits)
              : "Could not reserve credits for this request. No credits were charged — please try again.",
        });
      }
      reservationId = reservation.reservationId;
    }

    const costs = new CostAccumulator();
    let reflection: string;
    try {
      void recordAiCallForDailySpend(CREDIT_COSTS.weeklyReflection);
      reflection = await generateWeeklyReflection(apiKey, userMessage, costs);
    } catch (err) {
      logApiError("/api/reflection/generate", err, { stage: "reflection_call" });
      await releaseReservation(user.id, reservationId);
      const errMessage = err instanceof Error ? err.message : "The reflection request failed.";
      return NextResponse.json(
        { ok: false, error: `${errMessage} No credits were charged — please try again.` },
        { status: 502 }
      );
    }

    const settlement = await settleReservation({
      userId: user.id,
      reservationId,
      feature: "weekly_reflection",
      costs,
      plan,
      bypassCharge: bypassCredits,
      metadata: {
        inputChars: userMessage.length,
        estimatedCredits: estimate.estimatedCredits,
        reservedCredits: bypassCredits ? 0 : estimate.reserveCredits,
      },
    });

    return NextResponse.json({
      ok: true,
      generated: true,
      reflection,
      stats,
      usage: buildUsageReceipt({
        creditsCharged: settlement.creditsCharged,
        bypass: bypassCredits,
        wouldHaveCharged: null,
      }),
    });
  } catch (err) {
    logApiError("/api/reflection/generate", err);
    return NextResponse.json(
      { ok: false, error: "Something went wrong. Please try again." },
      { status: 500 }
    );
  }
}
