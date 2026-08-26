import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { logApiError } from "@/lib/log-error";
import { isAdminEmail } from "@/lib/auth/admin-emails";
import { hasActiveBetaBypass } from "@/lib/beta";
import { checkBypassCeiling } from "@/lib/billing/bypass-ceiling";
import { checkAiCallAllowed, fingerprintRequest } from "@/lib/ai-circuit-breaker";
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
import { runCompletion } from "@/lib/ai/providers/complete";
import { ANALYSIS_SYSTEM, buildProfileBrief, parseAnalysis } from "@/lib/data-analysis/analyse";
import type { TableProfile } from "@/lib/data-analysis/profile";

export const dynamic = "force-dynamic";
export const maxDuration = 120; // @function-limit 120

const MODEL = "claude-sonnet-4-6";

/**
 * WHAT THE NUMBERS MEAN.
 *
 * The statistics were computed at upload time, in TypeScript, over the
 * whole file. This call hands the model that SUMMARY and asks what it
 * means — it never sees the rows, never produces a figure that is
 * displayed as fact, and every chart it proposes is validated against the
 * real column list before it is stored (lib/data-analysis/analyse.ts).
 *
 * The reservation is sized from the brief, which is set by the number of
 * COLUMNS rather than the number of rows: a 50,000-row file and a 200-row
 * file with the same columns genuinely cost the same to analyse, and
 * pricing by upload size would be charging for storage.
 */
export async function POST(_request: Request, { params }: { params: { id: string } }) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "not_signed_in" }, { status: 401 });

  try {
    // RLS scopes this: another user's id simply comes back null.
    const { data: analysis, error } = await supabase
      .from("data_analyses")
      .select("id, title, file_name, headers, rows, profile")
      .eq("id", params.id)
      .maybeSingle();
    if (error) throw error;
    if (!analysis) return NextResponse.json({ error: "not_found" }, { status: 404 });

    const profile = analysis.profile as TableProfile;
    const headers = (analysis.headers ?? []) as string[];
    const rows = (analysis.rows ?? []) as string[][];

    const brief = buildProfileBrief({
      fileName: String(analysis.file_name ?? analysis.title ?? "dataset"),
      profile,
      headers,
      rows,
    });

    const breaker = await checkAiCallAllowed(user.id, "data_analyse", fingerprintRequest(params.id, brief));
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
      "dataAnalyse",
      { model: MODEL, inputChars: ANALYSIS_SYSTEM.length + brief.length, planSlug: plan?.slug ?? null },
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
      const reservation = await reserveCredits(user.id, estimate.reserveCredits, "data_analysis", {
        analysisId: params.id,
      });
      if (!reservation.ok) {
        return NextResponse.json({ error: "reserve_failed", detail: reservation.reason }, { status: 402 });
      }
      reservationId = reservation.reservationId;
    }

    const costs = new CostAccumulator();
    const outcome = await runCompletion(
      {
        purpose: "summarisation",
        model: MODEL,
        maxTokens: 3_000,
        system: [{ type: "text", text: ANALYSIS_SYSTEM }],
        messages: [{ role: "user", content: brief }],
      },
      { userId: user.id }
    );

    if (!outcome.ok) {
      // NOTHING WAS PRODUCED, SO NOTHING IS CHARGED. The hold goes back
      // whole rather than settling a zero, which would leave a cost-log
      // row claiming an action happened.
      await releaseReservation(user.id, reservationId);
      logApiError("/api/data-analysis/analyse", new Error(outcome.detail), { kind: outcome.kind });
      return NextResponse.json({ error: "ai_unavailable" }, { status: 503 });
    }

    costs.record("generation", outcome.usage, outcome.reportedModel || outcome.model);
    const parsed = parseAnalysis(outcome.text, profile);

    const settlement = await settleReservation({
      userId: user.id,
      reservationId,
      feature: "data_analysis",
      costs,
      plan,
      bypassCharge: bypass,
      metadata: { analysisId: params.id, rejected: parsed.rejected.length },
    });

    const admin = createAdminClient();
    const { error: saveError } = await admin
      .from("data_analyses")
      .update({ findings: parsed.findings, analysed_at: new Date().toISOString() })
      .eq("id", params.id)
      .eq("user_id", user.id);
    if (saveError) logApiError("/api/data-analysis/analyse", saveError, { stage: "save_findings" });

    if (parsed.findings.charts.length > 0) {
      // Appended after whatever is already there, so the charts the
      // column types suggested are not silently replaced by the model's.
      const { count } = await admin
        .from("data_analysis_charts")
        .select("id", { count: "exact", head: true })
        .eq("analysis_id", params.id);
      const base = count ?? 0;
      const { error: chartError } = await admin.from("data_analysis_charts").insert(
        parsed.findings.charts.map((spec, index) => ({
          analysis_id: params.id,
          user_id: user.id,
          kind: spec.kind,
          title: spec.title,
          x_column: spec.x,
          y_column: spec.y ?? null,
          aggregation: spec.aggregation,
          reason: spec.reason ?? null,
          origin: "ai",
          position: base + index,
        }))
      );
      if (chartError) logApiError("/api/data-analysis/analyse", chartError, { stage: "save_charts" });
    }

    return NextResponse.json({
      ok: true,
      findings: parsed.findings,
      // SURFACED, NOT SWALLOWED. A model that keeps naming columns the
      // file does not have is a prompt problem, and a silent filter hides
      // it from the only person who would notice.
      rejected: parsed.rejected,
      creditsCharged: settlement.creditsCharged,
    });
  } catch (err) {
    logApiError("/api/data-analysis/analyse", err);
    return NextResponse.json({ error: "analyse_failed" }, { status: 500 });
  }
}
