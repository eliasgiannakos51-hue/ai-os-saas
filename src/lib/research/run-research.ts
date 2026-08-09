import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { createAdminClient } from "@/lib/supabase/admin";
import { logApiError } from "@/lib/log-error";
import { diagLog } from "@/lib/diag";
import { getSiteUrl } from "@/lib/site-url";
import { CostAccumulator, type CostEntry } from "@/lib/billing/cost-accumulator";
import { settleReservation, releaseReservation } from "@/lib/billing/reservations";
import { resolveEffectivePlan } from "@/lib/billing/credits";
import { isAdminEmail } from "@/lib/admin";
import { hasActiveBetaBypass } from "@/lib/beta";
import { aiGeneratedNotice } from "@/lib/agents/ai-disclosure";
import { researchReportToDocumentHtml } from "@/lib/research/report-to-html";
import {
  functionBudgetMs,
  hasBudgetFor,
  internalHandoffToken,
  INTERNAL_HANDOFF_HEADER,
  isChunkedRuntime,
} from "@/lib/function-limits";
import {
  MAX_RESEARCH_CHUNKS,
  RESEARCH_DEADLINE_MS,
  RESEARCH_QUESTION_BUDGET_MS,
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

// Deep Research, as work that FITS THE PLATFORM instead of hoping to.
//
// THE PROBLEM. A report is up to six sequential, search-enabled model
// calls plus a synthesis. Each question call takes 60-90 seconds because
// Anthropic runs several real searches inside it. On Vercel Pro with an
// 800-second budget that fits in one invocation. On Hobby, where the
// ceiling is 60 seconds, it cannot fit — not "it is slower", it cannot
// start a second question at all.
//
// And a function killed by the platform runs NO catch block: no status
// written, no settlement, the credit hold stranded until the sweep. That
// is the exact failure already fixed once at the 300s ceiling. Dropping to
// 60 would bring it back in a worse form.
//
// THE SHAPE. One question (or a few) per invocation, state on the row,
// and a handoff to a fresh invocation when the budget runs out. Each
// invocation:
//
//   1. loads whatever the previous ones already did,
//   2. does as much as its own budget allows,
//   3. saves what it did,
//   4. either hands off to a fresh invocation, or finishes and settles.
//
// The user sees the same thing either way — the progress bar advances a
// little more slowly on a small budget. That is the entire visible
// difference, and it is the requirement.
//
// BILLING ACROSS INVOCATIONS. One reservation, taken by the first
// invocation and carried on the row; one settlement, by whichever
// invocation finishes. Usage measured in invocation 1 is persisted and
// restored, or the settlement would charge for a fraction of the work
// really done — an under-charge nothing could detect, because the stored
// margin would be computed from the same understated cost and read
// healthy.
//
// EXACTLY-ONCE. Every chunk re-claims the row with a conditional update on
// `chunk_running`, so a duplicated handoff (a retried fetch, a cron sweep
// racing the self-call) cannot run two chunks of the same report at once
// and spend two reports' worth of credits.

export type ChunkOutcome =
  | { done: true; status: "ready"; creditsCharged: number }
  | { done: true; status: "failed"; reason: string }
  | { done: false; handedOff: boolean; questionsDone: number; questionsTotal: number };

type ReportRow = {
  id: string;
  user_id: string;
  topic: string;
  language: string | null;
  status: string;
  questions: ResearchQuestion[] | null;
  questions_done: number | null;
  partial_findings: ResearchFinding[] | null;
  usage_entries: CostEntry[] | null;
  reservation_id: string | null;
  chunk_count: number | null;
};

/**
 * How long one question is assumed to take when deciding whether to start
 * it. Deliberately pessimistic: starting a question that does not finish
 * costs the tokens AND loses them, because the kill takes the write with
 * it. Refusing to start one that would have fitted costs one extra
 * handoff, which is a second of latency.
 */
function questionFits(elapsedMs: number, budgetMs: number): boolean {
  return hasBudgetFor(elapsedMs, RESEARCH_QUESTION_BUDGET_MS, budgetMs);
}

/** Fire a fresh invocation to carry on. Never awaited for its result —
 *  the point is to hand off, not to nest invocations inside each other. */
async function handOff(reportId: string): Promise<boolean> {
  const token = internalHandoffToken();
  if (!token) {
    // No CRON_SECRET means no authenticated way to call ourselves. The job
    // is NOT lost: the row keeps its progress and the client's poll can
    // resume it (see api/research/[id]/continue). Logged as an error
    // because on a constrained plan this silently doubles how long a
    // report takes to finish.
    logApiError("research:handOff", new Error("CRON_SECRET is not set — cannot hand off to a fresh invocation"), {
      reportId,
      hint: "set CRON_SECRET so a chunked report can continue itself without the page being open",
    });
    return false;
  }
  try {
    const url = `${getSiteUrl()}/api/research/${reportId}/continue`;
    // Fire and forget. Awaiting the response would hold THIS invocation
    // open for the whole of the next one, which is the opposite of the
    // point and would run us straight back into the ceiling.
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 2_000);
    void fetch(url, {
      method: "POST",
      headers: { [INTERNAL_HANDOFF_HEADER]: token, "Content-Type": "application/json" },
      body: JSON.stringify({ reportId }),
      signal: controller.signal,
    })
      .catch(() => undefined)
      .finally(() => clearTimeout(timer));
    return true;
  } catch (err) {
    logApiError("research:handOff", err, { reportId });
    return false;
  }
}

/**
 * Runs as much of a report as this invocation's budget allows.
 *
 * `claim` is what makes this exactly-once per chunk: the caller has
 * already flipped `chunk_running` from false to true with a conditional
 * update, so a concurrent handoff finds it true and returns without doing
 * anything.
 */
export async function runResearchChunk(params: {
  reportId: string;
  apiKey: string;
  startedAt: number;
}): Promise<ChunkOutcome> {
  const { reportId, apiKey, startedAt } = params;
  const admin = createAdminClient();
  const budgetMs = Math.min(functionBudgetMs(), RESEARCH_DEADLINE_MS);

  const { data: raw, error: loadError } = await admin
    .from("research_reports")
    .select("*")
    .eq("id", reportId)
    .maybeSingle();

  if (loadError || !raw) {
    logApiError("research:runChunk", loadError ?? new Error("report not found"), { reportId });
    return { done: true, status: "failed", reason: "not_found" };
  }
  const report = raw as ReportRow;

  const questions = Array.isArray(report.questions) ? report.questions : [];
  const findings: ResearchFinding[] = Array.isArray(report.partial_findings)
    ? report.partial_findings
    : [];
  const costs = CostAccumulator.restore(report.usage_entries);
  const language = String(report.language ?? "en");
  const anthropic = new Anthropic({ apiKey });

  // Where the previous chunks got to. Derived from the findings array
  // rather than from questions_done, so the two cannot disagree — the
  // findings ARE the record of what was answered.
  let answered = findings.length;

  async function persist(extra: Record<string, unknown> = {}) {
    await admin
      .from("research_reports")
      .update({
        questions_done: answered,
        questions_total: questions.length,
        current_question: questions[answered]?.question ?? null,
        partial_findings: findings,
        usage_entries: costs.snapshot(),
        ...extra,
      })
      .eq("id", reportId);
  }

  // ---- research phase, one question at a time -------------------------
  //
  // THE CHUNK CEILING. Handing off is a loop, and a loop that spends money
  // each pass needs a bound that does not rely on every hand-off working.
  // At the ceiling the remaining questions are marked unanswered and the
  // report is synthesised from what exists — the synthesis prompt already
  // has to list what could not be established, so this degrades into a
  // shorter report rather than into nothing. See MAX_RESEARCH_CHUNKS.
  const chunkNumber = (report.chunk_count ?? 0) + 1;
  const atChunkCeiling = chunkNumber >= MAX_RESEARCH_CHUNKS;
  if (atChunkCeiling && answered < questions.length) {
    logApiError("research:runChunk", "chunk ceiling reached, synthesising what exists", {
      reportId,
      chunk: chunkNumber,
      answered,
      asked: questions.length,
    });
    for (const remaining of questions.slice(answered)) {
      findings.push({ question: remaining.question, summary: "", sources: [] });
    }
    answered = findings.length;
    await persist();
  }

  while (answered < questions.length) {
    if (!questionFits(Date.now() - startedAt, budgetMs)) {
      // Out of room. Save, release the chunk lock, hand the rest on.
      await persist({ chunk_running: false });
      const handedOff = await handOff(reportId);
      diagLog(
        `[research] chunk paused: ${JSON.stringify({
          reportId,
          answered,
          total: questions.length,
          chunk: (report.chunk_count ?? 0) + 1,
          handedOff,
        })}`
      );
      return { done: false, handedOff, questionsDone: answered, questionsTotal: questions.length };
    }

    const result = await researchQuestion({
      anthropic,
      topic: String(report.topic),
      question: questions[answered],
      language,
      costs,
    });
    findings.push(result.finding);
    answered = findings.length;
    // Written after every question, not at the end of the chunk: a kill
    // between two questions must not lose the one that just finished and
    // was already paid for.
    await persist();
  }

  // ---- synthesis ------------------------------------------------------
  const usable = findings.filter((f) => f.summary.trim().length > 0);
  if (usable.length === 0) {
    const settlement = await settleReservation({
      userId: report.user_id,
      reservationId: report.reservation_id ?? "",
      feature: "deep_research",
      costs,
      plan: await planFor(report.user_id),
      bypassCharge: await isBypass(report.user_id),
      metadata: { reportId, outcome: "no_findings", chunks: (report.chunk_count ?? 0) + 1 },
    });
    await admin
      .from("research_reports")
      .update({
        status: "failed",
        error: "The searches did not return anything usable on this topic.",
        credits_charged: settlement.creditsCharged,
        completed_at: new Date().toISOString(),
        chunk_running: false,
      })
      .eq("id", reportId);
    return { done: true, status: "failed", reason: "no_findings" };
  }

  // Synthesis is one call and it is not splittable. If it will not fit in
  // what is left, hand it to a fresh invocation rather than starting it
  // and being killed mid-write — the questions are all answered and
  // persisted, so the next chunk starts straight here.
  if (!hasBudgetFor(Date.now() - startedAt, RESEARCH_SYNTHESIS_RESERVE_MS, budgetMs)) {
    await persist({ status: "synthesising", chunk_running: false });
    const handedOff = await handOff(reportId);
    return { done: false, handedOff, questionsDone: answered, questionsTotal: questions.length };
  }

  await admin.from("research_reports").update({ status: "synthesising" }).eq("id", reportId);

  const sources = collateSources(findings);
  const synthesis = await synthesiseReport({
    anthropic,
    topic: String(report.topic),
    findings,
    sources,
    language,
    costs,
  });

  const plan = await planFor(report.user_id);
  const bypass = await isBypass(report.user_id);
  const settlement = await settleReservation({
    userId: report.user_id,
    reservationId: report.reservation_id ?? "",
    feature: "deep_research",
    costs,
    plan,
    bypassCharge: bypass || !plan,
    metadata: {
      reportId,
      questions: questions.length,
      answered: usable.length,
      sources: sources.length,
      chunks: chunkNumber,
      chunkedRuntime: isChunkedRuntime(),
      hitChunkCeiling: atChunkCeiling,
    },
  });

  if (!synthesis.ok) {
    await admin
      .from("research_reports")
      .update({
        status: "failed",
        error: "The report could not be written from the findings.",
        credits_charged: settlement.creditsCharged,
        completed_at: new Date().toISOString(),
        chunk_running: false,
      })
      .eq("id", reportId);
    return { done: true, status: "failed", reason: "synthesis_failed" };
  }

  const sections = splitSections(synthesis.markdown);
  const disclosure = aiGeneratedNotice(language);
  const documentHtml = researchReportToDocumentHtml({
    markdown: synthesis.markdown,
    sources,
    disclosure,
    sourcesHeading: "Sources",
  });

  let documentId: string | null = null;
  const { data: document, error: documentError } = await admin
    .from("user_documents")
    .insert({
      user_id: report.user_id,
      title: String(report.topic).slice(0, 200),
      content: { html: documentHtml },
    })
    .select("id")
    .maybeSingle();
  if (documentError) {
    logApiError("research:runChunk", documentError, { stage: "save_document", reportId });
  } else if (document) {
    documentId = String(document.id);
  }

  const { error: finishError } = await admin
    .from("research_reports")
    .update({
      status: "ready",
      sections,
      sources,
      document_id: documentId,
      credits_charged: settlement.creditsCharged,
      questions_done: questions.length,
      current_question: null,
      completed_at: new Date().toISOString(),
      chunk_running: false,
    })
    .eq("id", reportId);
  if (finishError) {
    logApiError("research:runChunk", finishError, { stage: "finish", reportId });
  }

  diagLog(
    `[research] finished: ${JSON.stringify({
      reportId,
      chunks: (report.chunk_count ?? 0) + 1,
      aiCalls: costs.callCount,
      creditsCharged: settlement.creditsCharged,
      achievedMargin: settlement.achievedMargin,
    })}`
  );

  return { done: true, status: "ready", creditsCharged: settlement.creditsCharged };
}

// Plan and bypass are read from the OWNER of the report, not from a
// session — a continuation invocation has no user cookie at all, which is
// the whole reason this file uses the admin client.
async function planFor(userId: string) {
  try {
    const admin = createAdminClient();
    const { data } = await admin.auth.admin.getUserById(userId);
    return data?.user ? await resolveEffectivePlan(data.user) : null;
  } catch {
    return null;
  }
}

async function isBypass(userId: string): Promise<boolean> {
  try {
    const admin = createAdminClient();
    const { data } = await admin.auth.admin.getUserById(userId);
    if (!data?.user) return false;
    return isAdminEmail(data.user.email) || (await hasActiveBetaBypass(data.user));
  } catch {
    return false;
  }
}

/**
 * Takes the per-chunk lock. Returns false when another invocation already
 * holds it, which is what makes a duplicated handoff a no-op instead of a
 * second billed run.
 */
export async function claimChunk(reportId: string): Promise<boolean> {
  const admin = createAdminClient();
  const { data } = await admin
    .from("research_reports")
    .update({ chunk_running: true, chunk_started_at: new Date().toISOString() })
    .eq("id", reportId)
    .eq("chunk_running", false)
    .in("status", ["researching", "synthesising"])
    .select("id")
    .maybeSingle();
  return Boolean(data);
}

/** Releases the lock and fails the report — used when a chunk throws. */
export async function failChunk(reportId: string, userId: string, reservationId: string | null) {
  const admin = createAdminClient();
  if (reservationId) await releaseReservation(userId, reservationId);
  await admin
    .from("research_reports")
    .update({
      status: "failed",
      error: "The report stopped before it finished. No credits were charged — please run it again.",
      completed_at: new Date().toISOString(),
      chunk_running: false,
    })
    .eq("id", reportId);
}
