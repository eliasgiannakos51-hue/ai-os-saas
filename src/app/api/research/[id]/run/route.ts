import { NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
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
import { checkAiCallAllowed, fingerprintRequest, recordAiCallForDailySpend } from "@/lib/ai-circuit-breaker";
import { logApiError } from "@/lib/log-error";
import { RESEARCH_MODEL } from "@/lib/files/file-models";
import { aiGeneratedNotice } from "@/lib/agents/ai-disclosure";
import { RESEARCH_MAX_SEARCHES } from "@/lib/research/research-limits";
import {
  collateSources,
  researchQuestion,
  splitSections,
  synthesiseReport,
  type ResearchFinding,
  type ResearchQuestion,
} from "@/lib/research/research";

export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";
// Six searched questions plus a synthesis over all of them. This is the
// longest-running route in the app by design; the client does not wait
// for it (it polls GET /api/research/[id]), so the only thing this number
// governs is how much work can complete before the platform kills it.
export const maxDuration = 300;

/**
 * Run a planned research job.
 *
 * Two things here are worth being explicit about.
 *
 * THE CLAIM. `processing_started_at` is set by a conditional update that
 * only matches a row where it is still null. Two requests for the same
 * report — a double-click, a retried fetch, a browser restoring a tab —
 * therefore produce exactly one run. Without it the second request would
 * reserve a second hold and spend a second report's worth of credits on
 * work the user asked for once.
 *
 * THE SETTLEMENT. It happens on every exit path, including the failures.
 * Every phase that ran spent real tokens; a failed report that charges
 * zero is a report whose cost lands entirely on us and never appears in
 * the margin report.
 */
export async function POST(_request: Request, { params }: { params: { id: string } }) {
  const costs = new CostAccumulator();
  let reservationId = "";
  let userId = "";
  const admin = createAdminClient();

  try {
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ ok: false, error: "Not authenticated." }, { status: 401 });
    }
    userId = user.id;

    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ ok: false, error: "The AI service is not configured." }, { status: 503 });
    }

    const { data: report, error: loadError } = await supabase
      .from("research_reports")
      .select("id, topic, language, status, questions, processing_started_at")
      .eq("id", params.id)
      .eq("user_id", user.id)
      .maybeSingle();

    if (loadError) {
      logApiError("/api/research/[id]/run", loadError, { stage: "load" });
      return NextResponse.json({ ok: false, error: "Could not load that report." }, { status: 500 });
    }
    if (!report) {
      return NextResponse.json({ ok: false, error: "Report not found." }, { status: 404 });
    }
    if (report.status !== "pending") {
      return NextResponse.json(
        { ok: false, error: "That report has already been started." },
        { status: 409 }
      );
    }

    const questions = (Array.isArray(report.questions) ? report.questions : []) as ResearchQuestion[];
    if (questions.length === 0) {
      return NextResponse.json({ ok: false, error: "That report has no research plan." }, { status: 409 });
    }

    const breaker = await checkAiCallAllowed(
      user.id,
      "research_run",
      fingerprintRequest(String(report.id), String(report.topic))
    );
    if (!breaker.allowed) {
      return NextResponse.json({ ok: false, error: breaker.reason }, { status: 429 });
    }

    const isAdmin = isAdminEmail(user.email);
    const bypassCredits = isAdmin || (await hasActiveBetaBypass(user));
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
      "deepResearch",
      {
        model: RESEARCH_MODEL,
        inputChars: String(report.topic).length,
        expectedWebSearches: RESEARCH_MAX_SEARCHES,
      },
      pricingConfig,
      accountCreditPriceEur
    );

    if (!bypassCredits && plan) {
      const affordable = await hasEnoughCredits(user.id, estimate.reserveCredits, plan);
      if (!affordable.ok) {
        return NextResponse.json(
          { ok: false, insufficientCredits: true, error: "Not enough credits to run this report." },
          { status: 402 }
        );
      }
    }

    // THE CLAIM — see the file comment. `is("processing_started_at", null)`
    // is what makes this exactly-once rather than best-effort.
    const claimedAt = new Date().toISOString();
    const { data: claimed, error: claimError } = await supabase
      .from("research_reports")
      .update({ status: "researching", processing_started_at: claimedAt })
      .eq("id", report.id)
      .eq("user_id", user.id)
      .eq("status", "pending")
      .is("processing_started_at", null)
      .select("id")
      .maybeSingle();

    if (claimError) {
      logApiError("/api/research/[id]/run", claimError, { stage: "claim" });
      return NextResponse.json({ ok: false, error: "Could not start the report." }, { status: 500 });
    }
    if (!claimed) {
      return NextResponse.json({ ok: false, error: "That report has already been started." }, { status: 409 });
    }

    if (!bypassCredits && plan) {
      const reservation = await reserveCredits(user.id, estimate.reserveCredits, "deep_research", {
        reportId: String(report.id),
        questions: questions.length,
        estimatedCredits: estimate.estimatedCredits,
      });
      if (!reservation.ok) {
        await supabase
          .from("research_reports")
          .update({ status: "failed", error: "Not enough credits.", processing_started_at: null })
          .eq("id", report.id)
          .eq("user_id", user.id);
        return NextResponse.json(
          { ok: false, insufficientCredits: true, error: "Not enough credits to run this report." },
          { status: 402 }
        );
      }
      reservationId = reservation.reservationId;
    }
    void recordAiCallForDailySpend(estimate.estimatedCredits);

    const language = String(report.language ?? "en");
    const anthropic = new Anthropic({ apiKey });
    const findings: ResearchFinding[] = [];

    // Sequential, not parallel. Six concurrent search-enabled calls is a
    // burst that trips Anthropic's own rate limits on a busy account, and
    // the failure mode of that is a report missing a third of its
    // research for no reason the user can see.
    for (const question of questions) {
      const result = await researchQuestion({
        anthropic,
        topic: String(report.topic),
        question,
        language,
        costs,
      });
      findings.push(result.finding);
    }

    const usable = findings.filter((f) => f.summary.trim().length > 0);
    if (usable.length === 0) {
      const settlement = await settleReservation({
        userId: user.id,
        reservationId,
        feature: "deep_research",
        costs,
        plan,
        bypassCharge: bypassCredits || !plan,
        metadata: { reportId: String(report.id), outcome: "no_findings" },
      });
      await supabase
        .from("research_reports")
        .update({
          status: "failed",
          error: "The searches did not return anything usable on this topic.",
          credits_charged: settlement.creditsCharged,
          completed_at: new Date().toISOString(),
        })
        .eq("id", report.id)
        .eq("user_id", user.id);
      return NextResponse.json(
        { ok: false, error: "The searches did not return anything usable on this topic." },
        { status: 502 }
      );
    }

    await supabase
      .from("research_reports")
      .update({ status: "synthesising" })
      .eq("id", report.id)
      .eq("user_id", user.id);

    const sources = collateSources(findings);
    const synthesis = await synthesiseReport({
      anthropic,
      topic: String(report.topic),
      findings,
      sources,
      language,
      costs,
    });

    const settlement = await settleReservation({
      userId: user.id,
      reservationId,
      feature: "deep_research",
      costs,
      plan,
      bypassCharge: bypassCredits || !plan,
      metadata: {
        reportId: String(report.id),
        questions: questions.length,
        answered: usable.length,
        sources: sources.length,
      },
    });

    if (!synthesis.ok) {
      await supabase
        .from("research_reports")
        .update({
          status: "failed",
          error: "The report could not be written from the findings.",
          credits_charged: settlement.creditsCharged,
          completed_at: new Date().toISOString(),
        })
        .eq("id", report.id)
        .eq("user_id", user.id);
      return NextResponse.json({ ok: false, error: "The report could not be written." }, { status: 502 });
    }

    const sections = splitSections(synthesis.markdown);

    // Saved as a Document too, so the report lives where the rest of the
    // user's writing does rather than only inside this feature. Written
    // with the admin client because `ai_documents` is the module table and
    // this is a server-side write on the user's behalf; failure here is
    // logged and does NOT fail the report, which already exists.
    let documentId: string | null = null;
    const disclosure = aiGeneratedNotice(language);
    const documentBody = [
      synthesis.markdown,
      "",
      "## Sources",
      ...sources.map((s, i) => `${i + 1}. [${s.title}](${s.url})`),
      "",
      `_${disclosure}_`,
    ].join("\n");

    const { data: document, error: documentError } = await admin
      .from("ai_documents")
      .insert({
        user_id: user.id,
        title: String(report.topic).slice(0, 200),
        content: documentBody,
        status: "completed",
      })
      .select("id")
      .maybeSingle();

    if (documentError) {
      logApiError("/api/research/[id]/run", documentError, { stage: "save_document" });
    } else if (document) {
      documentId = String(document.id);
    }

    const { error: finishError } = await supabase
      .from("research_reports")
      .update({
        status: "ready",
        sections,
        sources,
        document_id: documentId,
        credits_charged: settlement.creditsCharged,
        completed_at: new Date().toISOString(),
      })
      .eq("id", report.id)
      .eq("user_id", user.id);

    if (finishError) {
      logApiError("/api/research/[id]/run", finishError, { stage: "finish" });
      return NextResponse.json({ ok: false, error: "The report was written but could not be saved." }, { status: 500 });
    }

    return NextResponse.json({
      ok: true,
      reportId: String(report.id),
      sections,
      sources,
      documentId,
      creditsCharged: settlement.creditsCharged,
      questionsAnswered: usable.length,
      questionsAsked: questions.length,
      disclosure,
    });
  } catch (err) {
    // Whatever went wrong, the tokens spent so far were spent. Settle,
    // and leave the row in a state the user can see and retry from.
    if (userId) {
      await settleReservation({
        userId,
        reservationId,
        feature: "deep_research",
        costs,
        plan: null,
        bypassCharge: true,
        metadata: { reportId: params.id, outcome: "exception" },
      }).catch(() => undefined);
      await admin
        .from("research_reports")
        .update({ status: "failed", error: "The report failed to complete.", completed_at: new Date().toISOString() })
        .eq("id", params.id)
        .eq("user_id", userId);
    }
    logApiError("/api/research/[id]/run", err, {});
    return NextResponse.json({ ok: false, error: "Something went wrong." }, { status: 500 });
  }
}
