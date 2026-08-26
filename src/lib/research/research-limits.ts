// Deep Research's shape, in a client-safe module.
//
// Same reason as lib/files/file-models.ts and lib/ai-models.ts: the topic
// box enforces the length limit before the request travels, and the plan
// panel names how many questions and searches the run may make so the
// estimate next to it is legible. lib/research/research.ts is
// `server-only` and cannot be imported from a component, and a second
// copy of these numbers in the component is exactly how a limit and its
// UI drift apart.

export const RESEARCH_MIN_QUESTIONS = 3;
export const RESEARCH_MAX_QUESTIONS = 6;

/** Web searches the model may run per research question. */
export const RESEARCH_SEARCHES_PER_QUESTION = 4;

export const RESEARCH_MAX_SEARCHES = RESEARCH_MAX_QUESTIONS * RESEARCH_SEARCHES_PER_QUESTION;

export const MAX_TOPIC_CHARS = 500;
export const MIN_TOPIC_CHARS = 8;

// ---------------------------------------------------------------------
// Wall clock — the reason a report could run for thirty minutes and
// produce nothing at all.
// ---------------------------------------------------------------------
//
// WHAT HAPPENED. api/research/[id]/run declared maxDuration = 300 and then
// did six sequential search-enabled calls plus a synthesis. A single
// search-enabled question call routinely takes 60-90 seconds, because
// Anthropic's server-side search loop runs several real searches inside
// it. Six of those is 6-9 minutes before synthesis has even started.
//
// So the platform killed the function around the fourth question. A kill
// is not an exception: no catch block runs, no status is written, no
// settlement happens. The row stayed at 'researching' forever, the client
// polled a row that would never change, and the hold sat on the user's
// balance until the hourly reservation sweep. From the user's side that is
// "it ran for thirty minutes and nothing came back", which is exactly the
// report.
//
// Three separate things fix it, and all three are needed:
//
//   1. maxDuration goes to 800s, the same practical ceiling the website
//      worker already uses.
//   2. RESEARCH_DEADLINE_MS makes the route stop researching BEFORE the
//      platform stops it, and synthesise what it has. A report built from
//      four of six questions, that says so, is worth infinitely more than
//      a killed function.
//   3. isResearchJobStale lets the poll endpoint force-fail a job whose
//      worker died anyway — the same backstop the Website Builder has had
//      since its own version of this bug, and which Deep Research never
//      got.

/** Stop starting new questions after this much wall clock, so there is
 *  always room to synthesise inside the function's own budget.
 *
 *  On a platform whose ceiling is smaller than this (Vercel Hobby's 60s),
 *  lib/function-limits.ts's functionBudgetMs() is the smaller number and
 *  wins — runResearchChunk takes the MINIMUM of the two. This constant is
 *  the ceiling for a generous budget, not an assumption that one exists. */
export const RESEARCH_DEADLINE_MS = 640_000;

/** Reserved for the synthesis call plus the writes after it. */
export const RESEARCH_SYNTHESIS_RESERVE_MS = 120_000;

/**
 * What ONE question is assumed to cost, when deciding whether to start it
 * inside the remaining budget.
 *
 * Deliberately pessimistic and deliberately not the same number as
 * RESEARCH_QUESTION_TIMEOUT_MS. Starting a question that does not finish
 * loses BOTH the tokens and the record of them, because a platform kill
 * takes the write with it. Refusing to start one that would have fitted
 * costs one extra handoff — about a second. The asymmetry is the whole
 * reason this is a separate, larger number.
 *
 * At 45s a 60-second Hobby budget (48s of usable work after the safety
 * margin) runs exactly one question per invocation, which is the intended
 * behaviour there: a five-question report becomes six short invocations
 * instead of one that gets killed.
 */
export const RESEARCH_QUESTION_BUDGET_MS = 45_000;

/** Hard ceiling on one question's model call. Without it, a single hung
 *  request consumes the entire budget and every later question is skipped
 *  for a reason nobody can see. */
export const RESEARCH_QUESTION_TIMEOUT_MS = 150_000;

/** And on the synthesis call. */
export const RESEARCH_SYNTHESIS_TIMEOUT_MS = 180_000;

/**
 * A claimed report whose worker is this far past its claim is dead.
 *
 * Comfortably above maxDuration (800s) so the platform's own timeout is
 * always what ends a genuinely long run first — this is the backstop for
 * when even that leaves no trace.
 */
export const RESEARCH_STALE_MS = 20 * 60 * 1000;

/**
 * The six values `research_reports.status` may hold.
 *
 * WHY THIS EXISTS. Until now these six lived only inside the CHECK
 * constraint in the baseline schema and as bare string literals scattered
 * across run-research.ts and four API routes. Nothing connected the two,
 * so `status: "sythesising"` would have typechecked, been rejected by
 * Postgres at runtime, and left the row on whatever status it already had
 * — the exact shape of the `flagged` bug that
 * scripts/tests/enum-schema-drift.test.mjs was written for. That gate
 * MAPPED `ResearchStatus` to the constraint, but no such type existed, so
 * the entry resolved to nothing and the constraint went unchecked.
 *
 * Declaring the union here, in the client-safe module the routes already
 * import, gives TypeScript the ability to reject a typo and gives the gate
 * something real to compare against the constraint.
 *
 *   pending      — created, not claimed
 *   planning     — breaking the topic into research questions
 *   researching  — running the searches
 *   synthesising — writing the report
 *   ready        — `sections` is populated
 *   failed       — see `error`
 */
export type ResearchStatus =
  | "pending"
  | "planning"
  | "researching"
  | "synthesising"
  | "ready"
  | "failed";

/** Pure predicate, no clock baked in, so it is directly unit-testable —
 *  same shape as isGenerationJobStale in lib/website-generation-limits.ts. */
export function isResearchJobStale(
  status: string,
  processingStartedAt: string | null,
  createdAt: string,
  now: Date
): boolean {
  if (status !== "planning" && status !== "researching" && status !== "synthesising") return false;
  // processing_started_at is set by the atomic claim. Falling back to
  // created_at covers a row that somehow reached a running status without
  // one, which would otherwise be un-reapable forever.
  const since = processingStartedAt ?? createdAt;
  const startedAt = new Date(since).getTime();
  if (!Number.isFinite(startedAt)) return false;
  return now.getTime() - startedAt > RESEARCH_STALE_MS;
}

/**
 * The most invocations one report may consume.
 *
 * TWO THINGS THIS BOUNDS, and the second is the one that matters.
 *
 * COST. A chunk that hands off to a chunk that hands off is a loop, and a
 * loop that spends money on every pass needs a ceiling that does not
 * depend on every hand-off being correct.
 *
 * COMPLETION. The pre-chunking code had a "deadline reached, synthesise
 * what we have" path, so a slow report still produced something. Chunking
 * replaced that with "hand the rest on", which is better — until the
 * hand-off cannot land (no CRON_SECRET, a dropped request, a closed tab
 * and no nudge). Without a ceiling the report would then sit unfinished
 * until the staleness reaper failed it, and the user would get NOTHING
 * after paying for the questions that did run.
 *
 * At this many chunks the worker stops researching and synthesises
 * whatever it has, marking the rest unanswered — the synthesis prompt is
 * already required to list what could not be established, so an
 * unanswered question becomes a line in the report rather than a silent
 * omission. A partial report the user can read beats a perfect one they
 * never receive.
 *
 * 12 is generous: on a 60-second Hobby budget a six-question report needs
 * seven chunks (one per question plus the synthesis), so this only bites
 * when something is genuinely wrong.
 */
export const MAX_RESEARCH_CHUNKS = 12;
