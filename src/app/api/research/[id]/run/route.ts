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
import { researchReportToDocumentHtml } from "@/lib/research/report-to-html";
import {
  RESEARCH_DEADLINE_MS,
  RESEARCH_MAX_SEARCHES,
  RESEARCH_SYNTHESIS_RESERVE_MS,
} from "@/lib/research/research-limits";
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
//
// It was 300s, and that is the whole reason a report could run for half an
// hour and return nothing. One search-enabled question call takes 60-90
// seconds — Anthropic runs several real searches inside it — so six of
// them plus a synthesis never fitted in five minutes. The platform killed
// the function around question four, and a kill runs no catch block: no
// status was written, no settlement happened, the row stayed 'researching'
// forever and the client polled it forever.
//
// 800s matches the website worker's ceiling. It is necessary but not
// sufficient on its own, which is why RESEARCH_DEADLINE_MS below stops the
// route BEFORE the platform does, and isResearchJobStale reaps whatever
// still slips through. See lib/research/research-limits.ts.
export const maxDuration = 800;

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
        planSlug: plan?.slug ?? null,
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
    const startedAt = Date.now();

    // Progress, written after every question.
    //
    // Best-effort by construction: the columns are added by the migration
    // in supabase/migrations/20260809_research_progress.sql, and an
    // instance running new code against an un-migrated database must keep
    // producing reports rather than failing on a progress write. A
    // PostgREST unknown-column error comes back as `error`, not as a
    // throw, so ignoring it is genuinely safe here — and the GET endpoint
    // selects `*`, so it never asks for a column that might not exist.
    async function writeProgress(done: number, current: string | null) {
      await supabase
        .from("research_reports")
        .update({
          questions_done: done,
          questions_total: questions.length,
          current_question: current,
        })
        .eq("id", report!.id)
        .eq("user_id", user!.id);
    }
    await writeProgress(0, questions[0]?.question ?? null);

    // Sequential, not parallel. Six concurrent search-enabled calls is a
    // burst that trips Anthropic's own rate limits on a busy account, and
    // the failure mode of that is a report missing a third of its
    // research for no reason the user can see.
    //
    // THE DEADLINE. Every question is checked against the wall clock
    // BEFORE it starts. The old loop ran all six unconditionally, so on a
    // slow run the platform killed the function somewhere in the middle
    // and the user got nothing at all — not a partial report, nothing,
    // and no terminal status either. Stopping early and synthesising what
    // we have is strictly better: the synthesis prompt is already required
    // to list what could not be established, so an unanswered question
    // becomes a line in the report rather than a silent omission.
    let stoppedEarly = false;
    for (const [index, question] of questions.entries()) {
      if (index > 0 && Date.now() - startedAt > RESEARCH_DEADLINE_MS - RESEARCH_SYNTHESIS_RESERVE_MS) {
        stoppedEarly = true;
        logApiError("/api/research/[id]/run", "research deadline reached, synthesising early", {
          reportId: String(report.id),
          answered: index,
          asked: questions.length,
          elapsedMs: Date.now() - startedAt,
        });
        // The remaining questions still belong in the report, marked
        // unanswered, so the synthesis names them under "could not be
        // established" instead of quietly dropping a third of the plan.
        for (const remaining of questions.slice(index)) {
          findings.push({ question: remaining.question, summary: "", sources: [] });
        }
        break;
      }

      const result = await researchQuestion({
        anthropic,
        topic: String(report.topic),
        question,
        language,
        costs,
      });
      findings.push(result.finding);
      await writeProgress(index + 1, questions[index + 1]?.question ?? null);
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
        stoppedEarly,
        elapsedMs: Date.now() - startedAt,
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
    // user's writing does rather than only inside this feature.
    //
    // DEFECT this fixes: it used to insert into `ai_documents` — the
    // LEGACY Build-module tracker — while the UI linked to
    // /dashboard/documents/<id>, which has rendered `user_documents` since
    // the Documents module replaced it. Every "Open as a document" link on
    // every report ever produced was therefore a guaranteed 404: the row
    // existed, in a table no screen shows. It was invisible because the
    // insert succeeded and the id came back, so nothing logged an error.
    //
    // user_documents.content is jsonb { html }, and the editor assigns it
    // straight to innerHTML — so the report is converted by
    // researchReportToDocumentHtml, which escapes everything before
    // re-introducing a fixed set of tags. A research report is assembled
    // from web pages strangers wrote; passing that through unescaped would
    // be stored XSS with an obvious delivery path.
    let documentId: string | null = null;
    const disclosure = aiGeneratedNotice(language);
    const documentHtml = researchReportToDocumentHtml({
      markdown: synthesis.markdown,
      sources,
      disclosure,
      sourcesHeading: "Sources",
    });

    const { data: document, error: documentError } = await admin
      .from("user_documents")
      .insert({
        user_id: user.id,
        title: String(report.topic).slice(0, 200),
        content: { html: documentHtml },
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
