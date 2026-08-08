import { NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { createClient } from "@/lib/supabase/server";
import { isAdminEmail } from "@/lib/admin";
import { hasActiveBetaBypass } from "@/lib/beta";
import {
  hasEnoughCredits,
  resolveEffectivePlan,
  getPurchasedPackCreditPriceEur,
} from "@/lib/billing/credits";
import { effectiveCreditPriceEurForAccount } from "@/lib/billing/credit-formula";
import { CostAccumulator } from "@/lib/billing/cost-accumulator";
import { estimateForAction } from "@/lib/billing/estimate";
import { resolvePricingConfig } from "@/lib/billing/pricing-config";
import { reserveCredits, settleReservation } from "@/lib/billing/reservations";
import {
  checkAiCallAllowed,
  fingerprintRequest,
  recordAiCallForDailySpend,
} from "@/lib/ai-circuit-breaker";
import { checkRateLimit } from "@/lib/rate-limit";
import { logApiError } from "@/lib/log-error";
import { INSIGHT_MODEL } from "@/lib/insights/insight-models";
import { MAX_INSIGHTS, runDetectors } from "@/lib/insights/detectors";
import { narrateFindings } from "@/lib/insights/narrate";
import { claimFreeActivationRun } from "@/lib/import/activation";

export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";
export const maxDuration = 60;

/** Rows per table pulled into the analysis. Bounded because the
 *  detectors run in memory; well above what any detector needs to be
 *  confident. */
const ANALYSIS_ROW_LIMIT = 5000;

/**
 * Find real patterns in the user's own data and say them.
 *
 * The order here is the whole point, and it is the opposite of what an
 * "AI insights" feature usually does:
 *
 *   1. CODE finds the patterns (lib/insights/detectors.ts), each with a
 *      sample size and the numbers it rests on.
 *   2. The MODEL phrases them, and is checked against those numbers.
 *
 * A model handed a spreadsheet and asked to find patterns will always
 * find some, because that is what it was asked for — and it cannot
 * distinguish a fact from a story that fits. Doing the finding in code
 * is what makes "only real patterns, never generic advice, and say so
 * when there is not enough data" something the product does rather than
 * something a prompt requests.
 *
 * When the detectors find nothing, this route returns nothing and says
 * why. There is no path here that produces a hedged sentence about an
 * empty account.
 */
export async function POST(request: Request) {
  const costs = new CostAccumulator();

  try {
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ ok: false, error: "Not authenticated." }, { status: 401 });
    }

    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ ok: false, error: "The AI service is not configured." }, { status: 503 });
    }

    const limited = await checkRateLimit({
      scope: "insights_generate",
      identifier: user.id,
      maxAttempts: 20,
      windowMinutes: 60,
    });
    if (!limited.allowed) {
      return NextResponse.json(
        { ok: false, error: "Too many analyses in the last hour. Try again shortly." },
        { status: 429 }
      );
    }

    const body = await request.json().catch(() => null);
    const language = typeof body?.language === "string" ? body.language.slice(0, 12) : "en";
    const importId = typeof body?.importId === "string" ? body.importId : null;

    // Every read is scoped to the user by the query itself, not checked
    // afterwards — the same rule as everywhere else in this codebase.
    const [{ data: trades }, { data: finance }, { data: ideas }, { count: missionCount }] = await Promise.all([
      supabase
        .from("trades")
        .select("symbol, direction, result, pnl, occurred_at")
        .eq("user_id", user.id)
        .limit(ANALYSIS_ROW_LIMIT),
      supabase
        .from("finance_entries")
        .select("description, type, amount, counterparty, occurred_at")
        .eq("user_id", user.id)
        .limit(ANALYSIS_ROW_LIMIT),
      supabase.from("ideas").select("created_at").eq("user_id", user.id).limit(ANALYSIS_ROW_LIMIT),
      supabase
        .from("ai_missions")
        .select("id", { count: "exact", head: true })
        .eq("user_id", user.id),
    ]);

    const findings = runDetectors({
      trades: trades ?? [],
      finance: finance ?? [],
      ideas: ideas ?? [],
      missionCount: missionCount ?? 0,
    }).slice(0, MAX_INSIGHTS);

    // NOTHING FOUND. No AI call, no charge, and an honest reason — which
    // is the behaviour the spec asks for by name. Inventing something
    // here is the one thing this feature must never do.
    if (findings.length === 0) {
      const rows = (trades?.length ?? 0) + (finance?.length ?? 0) + (ideas?.length ?? 0);
      return NextResponse.json({
        ok: true,
        insights: [],
        needMoreData: true,
        rowsSeen: rows,
        creditsCharged: 0,
      });
    }

    const breaker = await checkAiCallAllowed(
      user.id,
      "insight_narrate",
      fingerprintRequest(user.id, findings.map((f) => f.detector).join("|"))
    );
    if (!breaker.allowed) {
      return NextResponse.json({ ok: false, error: breaker.reason }, { status: 429 });
    }

    const isAdmin = isAdminEmail(user.email);
    const freeRun = await claimFreeActivationRun(user.id);
    const bypassCredits = isAdmin || freeRun || (await hasActiveBetaBypass(user));

    const plan = await resolveEffectivePlan(user);
    const pricingConfig = resolvePricingConfig();
    const accountCreditPriceEur = bypassCredits
      ? pricingConfig.creditPriceEur
      : effectiveCreditPriceEurForAccount(
          plan,
          await getPurchasedPackCreditPriceEur(user.id),
          pricingConfig
        );

    const estimate = estimateForAction(
      "insightNarrate",
      { model: INSIGHT_MODEL, inputChars: findings.reduce((sum, f) => sum + f.statement.length + JSON.stringify(f.evidence).length, 0), planSlug: plan?.slug ?? null },
      pricingConfig,
      accountCreditPriceEur
    );

    let reservationId = "";
    if (!bypassCredits && plan) {
      const affordable = await hasEnoughCredits(user.id, estimate.reserveCredits, plan);
      if (!affordable.ok) {
        return NextResponse.json(
          { ok: false, insufficientCredits: true, error: "Not enough credits to write these up." },
          { status: 402 }
        );
      }
      const reservation = await reserveCredits(user.id, estimate.reserveCredits, "insight_narrate", {
        findings: findings.length,
      });
      if (!reservation.ok) {
        return NextResponse.json(
          { ok: false, insufficientCredits: true, error: "Not enough credits to write these up." },
          { status: 402 }
        );
      }
      reservationId = reservation.reservationId;
    }
    void recordAiCallForDailySpend(estimate.estimatedCredits);

    const anthropic = new Anthropic({ apiKey });
    const narrated = await narrateFindings({ anthropic, findings, language, costs });

    const settlement = await settleReservation({
      userId: user.id,
      reservationId,
      feature: "insight_narrate",
      costs,
      plan,
      bypassCharge: bypassCredits || !plan,
      metadata: {
        findings: findings.length,
        // How many the model's wording was REJECTED for. A systematic
        // rejection rate is a signal the prompt has drifted, and it is
        // only visible if it is recorded.
        rejected: narrated.filter((n) => !n.narrated).length,
        freeRun,
      },
    });

    const { data: saved, error: saveError } = await supabase
      .from("user_insights")
      .insert(
        narrated.map((n) => ({
          user_id: user.id,
          import_id: importId,
          detector: n.finding.detector,
          module_slug: n.finding.moduleSlug,
          headline: n.headline,
          detail: n.detail,
          // Stored WITH the sentence: an insight whose numbers are not
          // kept can never be checked, by the user or by us.
          evidence: n.finding.evidence,
          sample_size: n.finding.sampleSize,
        }))
      )
      .select("id, detector, module_slug, headline, detail, evidence, sample_size, created_at");

    if (saveError) {
      logApiError("/api/insights/generate", saveError, { stage: "save" });
      // The findings are still returned — they were computed and paid
      // for, and losing them because a write failed would be the worst
      // of both.
      return NextResponse.json({
        ok: true,
        insights: narrated.map((n) => ({
          id: null,
          detector: n.finding.detector,
          module_slug: n.finding.moduleSlug,
          headline: n.headline,
          detail: n.detail,
          evidence: n.finding.evidence,
          sample_size: n.finding.sampleSize,
        })),
        notSaved: true,
        creditsCharged: settlement.creditsCharged,
      });
    }

    return NextResponse.json({
      ok: true,
      insights: saved ?? [],
      creditsCharged: settlement.creditsCharged,
      freeRun,
    });
  } catch (err) {
    logApiError("/api/insights/generate", err, {});
    return NextResponse.json({ ok: false, error: "Something went wrong." }, { status: 500 });
  }
}
