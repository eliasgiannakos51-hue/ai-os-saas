import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { createAdminClient } from "@/lib/supabase/admin";
import { logApiError } from "@/lib/log-error";
import { diagLog } from "@/lib/diag";
import { getSiteUrl } from "@/lib/site-url";
import { CostAccumulator, type CostEntry } from "@/lib/billing/cost-accumulator";
import { recordAiCallForDailySpend } from "@/lib/ai-circuit-breaker";
import { settleReservation, releaseReservation } from "@/lib/billing/reservations";
import { resolveEffectivePlan } from "@/lib/billing/credits";
import { isAdminEmail } from "@/lib/auth/admin-emails";
import { checkBypassCeiling } from "@/lib/billing/bypass-ceiling";
import { hasActiveBetaBypass } from "@/lib/beta";
import { aiGeneratedNotice } from "@/lib/agents/ai-disclosure";
import { researchReportToDocumentHtml } from "@/lib/research/report-to-html";
import { checkCitations, annotateDanglingCitations } from "@/lib/verification/citations";
import { loadResearchContext } from "@/lib/research/research-context";
import { truncationNotice } from "@/lib/verification/truncation";
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
  type ResearchStatus,
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
/**
 * THE PLATFORM BREAKER'S COUNTER, which this path never touched.
 *
 * checkDailyPlatformCap() reads daily_ai_spend_tracking.total_calls, and
 * lib/research/research.ts makes real Anthropic calls without ever
 * incrementing it — a report plans, then answers up to six questions,
 * then synthesises. So the number the breaker gates the whole platform on
 * was low by everything Deep Research spends, and the heaviest feature in
 * the product was outside it in both directions: not counted, and not
 * blocked.
 *
 * A WRAPPER, not a line before each return. The chunk has eleven exits —
 * ceilings, hand-offs, failures, the ready path — and adding the record
 * to each is how one of them ends up without it. `finally` runs on all
 * eleven and on a throw.
 *
 * THE DELTA, not the total: the accumulator is RESTORED from the row, so
 * a chunk resumes with every earlier chunk's calls already in it.
 * Recording costs.callCount would re-count chunk one on every
 * continuation, twelve times over for a report that runs to its ceiling.
 *
 * COST 0, said plainly rather than left to be discovered: the euros are
 * written to ai_cost_log by settleReservation and that is the
 * authoritative money record. What this fixes is the CALL COUNT, which is
 * the column the breaker actually gates on.
 */
export async function runResearchChunk(params: {
  reportId: string;
  apiKey: string;
  startedAt: number;
}): Promise<ChunkOutcome> {
  const counted = { accumulator: null as CostAccumulator | null, before: 0 };
  try {
    return await runResearchChunkInner(params, counted);
  } finally {
    const made = (counted.accumulator?.callCount ?? 0) - counted.before;
    if (made > 0) void recordAiCallForDailySpend(0, made);
  }
}

async function runResearchChunkInner(
  params: {
    reportId: string;
    apiKey: string;
    startedAt: number;
  },
  counted: { accumulator: CostAccumulator | null; before: number }
): Promise<ChunkOutcome> {
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

  // THE BYPASS EUR CEILING, checked on EVERY chunk rather than only at
  // the start of a run. Deep research is chunked across up to
  // MAX_RESEARCH_CHUNKS invocations (api/research/route.ts starts one,
  // api/research/[id]/run and api/research/[id]/continue resume one) —
  // gating only the start route would leave every resumed chunk
  // unchecked, and a resumed chunk spends exactly as much Anthropic
  // budget as a fresh one. Checked here, once, is what covers all three
  // entry points without repeating the check in each.
  //
  // isAdmin and isBeta resolved SEPARATELY, not folded into one bypass
  // boolean — the two ceilings differ (€40 vs €5), and isBypass() below
  // only ever returns whether EITHER is true, not which. Getting this
  // wrong would apply the beta ceiling to an admin account.
  const { data: reportOwner } = await admin.auth.admin.getUserById(report.user_id);
  const reportOwnerIsAdmin = isAdminEmail(reportOwner?.user?.email);
  const reportOwnerIsBeta = !reportOwnerIsAdmin && reportOwner?.user
    ? await hasActiveBetaBypass(reportOwner.user)
    : false;
  if (reportOwnerIsAdmin || reportOwnerIsBeta) {
    const ceiling = await checkBypassCeiling(report.user_id, reportOwnerIsAdmin, reportOwnerIsBeta);
    if (!ceiling.allowed) {
      if (report.reservation_id) await releaseReservation(report.user_id, report.reservation_id);
      await admin
        .from("research_reports")
        .update({
          status: "failed" satisfies ResearchStatus,
          error: ceiling.reason,
          completed_at: new Date().toISOString(),
          chunk_running: false,
        })
        .eq("id", reportId);
      return { done: true, status: "failed", reason: "bypass_ceiling" };
    }
  }

  const questions = Array.isArray(report.questions) ? report.questions : [];
  const findings: ResearchFinding[] = Array.isArray(report.partial_findings)
    ? report.partial_findings
    : [];
  const costs = CostAccumulator.restore(report.usage_entries);
  // Handed to the wrapper so its `finally` can measure this chunk's own
  // calls against the restored total.
  counted.accumulator = costs;
  counted.before = costs.callCount;
  const language = String(report.language ?? "en");
  const anthropic = new Anthropic({ apiKey });

  // Where the previous chunks got to. Derived from the findings array
  // rather than from questions_done, so the two cannot disagree — the
  // findings ARE the record of what was answered.
  let answered = findings.length;

  // `status` is typed rather than left to Record<string, unknown>: a typo
  // here is rejected by the CHECK constraint at runtime, after the row has
  // already been charged, and the caller never sees it.
  async function persist(extra: { status?: ResearchStatus } & Record<string, unknown> = {}) {
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
        status: "failed" satisfies ResearchStatus,
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

  await admin
    .from("research_reports")
    .update({ status: "synthesising" satisfies ResearchStatus })
    .eq("id", reportId);

  const sources = collateSources(findings);

  // THE ACCOUNT, BEFORE THE SYNTHESIS — V4.6. Pattern (C): the flat
  // shape of every module (cheap, whatever the account size) plus ONE
  // module read deeply when the topic points at one. See
  // lib/research/research-context.ts for why neither "all of it" nor
  // "none of it" is the answer.
  //
  // ADMIN CLIENT, SCOPED BY user_id. Both halves take the userId and use
  // it as a filter — getUserFullContext and loadDeepDive each do —
  // which is what scripts/tests/user-scoped-queries.test.mjs is for. The
  // job runs without a session, so RLS is not available to lean on here
  // and the filter is the only scope there is.
  const context = await loadResearchContext(
    admin,
    report.user_id,
    String(report.topic),
    language === "el" ? "el" : "en"
  );

  const synthesis = await synthesiseReport({
    anthropic,
    topic: String(report.topic),
    findings,
    sources,
    entries: context.entries,
    accountSummary: context.accountSummary,
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
        status: "failed" satisfies ResearchStatus,
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

  // THE SECOND PASS. Costs no model call and no credit: it is arithmetic
  // on the text the synthesis already produced.
  //
  // The sources themselves are sound — they come from Anthropic's own
  // citation blocks, so they are pages that were really read. What was
  // never checked is whether the MARKERS point at any of them. A body
  // citing [7] against five sources renders a marker that looks exactly
  // like the working ones and leads nowhere, and a reader who does not
  // click it has counted an unbacked claim as a cited one.
  //
  // A dangling marker is MARKED, not deleted. Deleting it would leave the
  // sentence reading as the model's own assertion; renumbering would
  // point the claim at whatever source sits at that index and invent a
  // provenance. Keeping it visible is the only option that tells the
  // reader the truth about the document.
  // THE REPORT MAY BE SEVERED, and until now nothing said so. The
  // synthesiser allows 8,000 tokens and validated its output with a
  // length check, so a report that stopped at the ceiling mid-sentence
  // was written to a document and delivered as finished.
  //
  // Labelled rather than discarded: the partial report is real work the
  // user paid for, and a retry costs the same again with no reason to
  // end differently. What the reader must not be able to do is mistake
  // where it stopped for where the author meant it to.
  const reportMarkdown = synthesis.truncated
    ? `${synthesis.markdown}\n\n_${truncationNotice(language)}_`
    : synthesis.markdown;
  if (synthesis.truncated) {
    logApiError("research:runChunk", new Error("synthesis hit its token ceiling"), {
      stage: "truncation",
      reportId,
      chars: synthesis.markdown.length,
    });
  }

  const citations = checkCitations(reportMarkdown, sources.length, context.entries.length);
  if (!citations.ok) {
    logApiError(
      "research:runChunk",
      new Error(
        `report cites ${citations.issues.filter((i) => i.kind === "dangling").length} source(s) it does not have`
      ),
      {
        stage: "citation_check",
        reportId,
        markers: citations.markers.join(","),
        entryMarkers: citations.entryMarkers.join(","),
        sources: String(sources.length),
        entries: String(context.entries.length),
      }
    );
  }

  const documentHtml = researchReportToDocumentHtml({
    markdown: citations.ok
      ? reportMarkdown
      : annotateDanglingCitations(reportMarkdown, sources.length, context.entries.length),
    sources,
    entries: context.entries,
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
      status: "ready" satisfies ResearchStatus,
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
      status: "failed" satisfies ResearchStatus,
      error: "The report stopped before it finished. No credits were charged — please run it again.",
      completed_at: new Date().toISOString(),
      chunk_running: false,
    })
    .eq("id", reportId);
}
