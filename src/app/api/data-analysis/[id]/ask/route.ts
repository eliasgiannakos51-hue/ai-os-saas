import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { logApiError } from "@/lib/log-error";
import { isAdminEmail } from "@/lib/admin";
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
import { buildProfileBrief, extractJson } from "@/lib/data-analysis/analyse";
import { QUESTION_SYSTEM, numbersNotInEvidence, runQuery, validateQuery } from "@/lib/data-analysis/query";
import type { TableProfile } from "@/lib/data-analysis/profile";

export const dynamic = "force-dynamic";
export const maxDuration = 60; // @function-limit 60

const MODEL = "claude-sonnet-4-6";
const MAX_QUESTION_CHARS = 400;

/**
 * A QUESTION ABOUT THE DATA, ANSWERED FROM THE DATA.
 *
 * Two steps, and the split is the whole point (lib/data-analysis/query.ts):
 *
 *   1. The model turns the sentence into a QUERY. It is good at that.
 *   2. THIS SERVER runs the query over the real rows and computes the
 *      numbers. The model does no arithmetic and sees no row.
 *
 * Then one more guard: the model's framing sentence is scanned for any
 * figure that is not in the computed result, and a sentence containing
 * one is DROPPED rather than shown. A fluent invented number is the
 * failure mode of every "chat with your spreadsheet" feature, and it is
 * indistinguishable from a real one on the screen.
 */
export async function POST(request: Request, { params }: { params: { id: string } }) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "not_signed_in" }, { status: 401 });

  try {
    const body = (await request.json()) as { question?: unknown };
    const question = typeof body.question === "string" ? body.question.trim().slice(0, MAX_QUESTION_CHARS) : "";
    if (!question) return NextResponse.json({ error: "no_question" }, { status: 400 });

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
      fileName: String(analysis.file_name ?? "dataset"),
      profile,
      headers,
      // The sample is not needed to build a query and is the part of the
      // brief that carries actual records, so it is left out here.
      rows: [],
    });

    const breaker = await checkAiCallAllowed(user.id, "data_question", fingerprintRequest(params.id, question));
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
      "dataQuestion",
      { model: MODEL, inputChars: QUESTION_SYSTEM.length + brief.length + question.length, planSlug: plan?.slug ?? null },
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
        kind: "question",
      });
      if (!reservation.ok) return NextResponse.json({ error: "reserve_failed", detail: reservation.reason }, { status: 402 });
      reservationId = reservation.reservationId;
    }

    const costs = new CostAccumulator();
    const outcome = await runCompletion(
      {
        purpose: "classification",
        model: MODEL,
        maxTokens: 800,
        system: [{ type: "text", text: QUESTION_SYSTEM }],
        messages: [{ role: "user", content: `${brief}\n\nQUESTION: ${question}` }],
      },
      { userId: user.id }
    );

    if (!outcome.ok) {
      await releaseReservation(user.id, reservationId);
      logApiError("/api/data-analysis/ask", new Error(outcome.detail), { kind: outcome.kind });
      return NextResponse.json({ error: "ai_unavailable" }, { status: 503 });
    }
    costs.record("generation", outcome.usage, outcome.reportedModel || outcome.model);

    const settlement = await settleReservation({
      userId: user.id,
      reservationId,
      feature: "data_analysis",
      costs,
      plan,
      bypassCharge: bypass,
      metadata: { analysisId: params.id, kind: "question" },
    });

    const admin = createAdminClient();
    const record = async (answer: string | null, evidence: unknown) => {
      const { error: writeError } = await admin.from("data_analysis_questions").insert({
        analysis_id: params.id,
        user_id: user.id,
        question,
        answer,
        evidence,
        credits_charged: settlement.creditsCharged,
      });
      if (writeError) logApiError("/api/data-analysis/ask", writeError, { stage: "record" });
    };

    const parsed = extractJson(outcome.text);
    if (!parsed) {
      await record(null, null);
      return NextResponse.json({ error: "unreadable_reply", creditsCharged: settlement.creditsCharged }, { status: 502 });
    }
    if (typeof parsed.error === "string") {
      // THE MODEL SAYING IT CANNOT IS A RESULT, not a failure. "There is
      // no date column, so I cannot answer that by month" is more use
      // than a query over a column that does not exist.
      await record(null, { refused: parsed.error });
      return NextResponse.json({
        ok: true,
        cannotAnswer: String(parsed.error).slice(0, 300),
        creditsCharged: settlement.creditsCharged,
      });
    }

    const verdict = validateQuery(parsed.query, profile);
    if (!verdict.ok) {
      await record(null, { rejectedQuery: verdict.reason });
      return NextResponse.json({
        ok: true,
        cannotAnswer: verdict.reason,
        creditsCharged: settlement.creditsCharged,
      });
    }

    const result = runQuery(verdict.query, profile, headers, rows);

    // THE LAST GUARD. Any figure in the framing that is not in the
    // computed result is an invention, and the sentence goes rather than
    // the numbers — the table below it is true whatever the sentence says.
    const framing = typeof parsed.framing === "string" ? parsed.framing.trim().slice(0, 400) : "";
    const invented = framing ? numbersNotInEvidence(framing, result) : [];
    const safeFraming = invented.length === 0 ? framing : "";

    await record(safeFraming || null, result);

    return NextResponse.json({
      ok: true,
      framing: safeFraming,
      /** Reported rather than hidden: a user is entitled to know their
       *  answer had a sentence removed from it, and it is the signal that
       *  the prompt needs work. */
      inventedNumbersRemoved: invented,
      result,
      creditsCharged: settlement.creditsCharged,
    });
  } catch (err) {
    logApiError("/api/data-analysis/ask", err);
    return NextResponse.json({ error: "ask_failed" }, { status: 500 });
  }
}
