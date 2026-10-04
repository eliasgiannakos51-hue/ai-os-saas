/**
 * THE ACTIVITY TIMELINE OF A DEEP RESEARCH REPORT — V6.2 2.1, slice 4.
 *
 * Deep Research is not a background job (lib/jobs), so it never wrote the
 * ai_jobs timeline. It did not need to: the worker already writes one
 * finding per question to research_reports.partial_findings, in order, the
 * moment that question is paid for (lib/research/run-research.ts). This
 * file reads that record back as steps, with no new column and no
 * migration:
 *
 *   one step per answered question — label: the question itself, the
 *   evidence: how many sources it found;
 *   the question in flight, while the report runs (no end yet);
 *   one "writing" step, from the last answer to the finished report.
 *
 * WHAT A FINDING HAS TO CARRY. `finishedAt` (when it was answered) and
 * `usageCount` (how many cost entries the report had by then). A count,
 * not money: partial_findings is returned to the browser, and no figure in
 * USD may reach it. The cost of each step is derived HERE, on the server,
 * from usage_entries sliced at those counts, and only the credits split
 * from it leave this file (splitCredits in lib/jobs/job-timeline.ts).
 *
 * Reports written before findings carried those two fields get no
 * timeline at all rather than a guessed one.
 */
import { CostAccumulator, type CostEntry } from "@/lib/billing/cost-accumulator";
import { timelineForClient, type ClientStep, type TimelineEntry } from "@/lib/jobs/job-timeline";
import { RESEARCH_WRITING_LABEL } from "@/lib/research/research-limits";

// The label of the last step. Translated by the screen, never shown raw.
export { RESEARCH_WRITING_LABEL };

type FindingRecord = {
  question?: unknown;
  sources?: unknown;
  finishedAt?: unknown;
  usageCount?: unknown;
};

export type ResearchTimelineRow = {
  status: string;
  processing_started_at?: string | null;
  completed_at?: string | null;
  current_question?: string | null;
  questions_total?: number | null;
  partial_findings?: unknown;
  usage_entries?: unknown;
  credits_charged?: number | null;
};

function costOf(entries: CostEntry[], count: number): number {
  return CostAccumulator.restore(entries.slice(0, Math.max(0, count))).totalUsdCost;
}

export function researchTimeline(row: ResearchTimelineRow): ClientStep[] {
  const started = row.processing_started_at;
  if (!started || Number.isNaN(Date.parse(started))) return [];
  const findings: FindingRecord[] = Array.isArray(row.partial_findings) ? (row.partial_findings as FindingRecord[]) : [];
  // Every finding must carry both, or none is trusted: a half-stamped
  // record would put a guessed duration next to a measured one.
  const stamped = findings.every(
    (f) =>
      typeof f.finishedAt === "string" &&
      !Number.isNaN(Date.parse(f.finishedAt)) &&
      typeof f.usageCount === "number" &&
      Number.isFinite(f.usageCount)
  );
  if (!stamped) return [];
  const usage: CostEntry[] = Array.isArray(row.usage_entries) ? (row.usage_entries as CostEntry[]) : [];

  const entries: TimelineEntry[] = [];
  let at = started;
  // From zero, not from the run's start: the plan was paid for before the
  // run and has no step of its own, so its cost weighs on the first
  // question rather than vanishing from the split.
  let usedBefore = 0;
  findings.forEach((f, i) => {
    const sources = Array.isArray(f.sources) ? f.sources.length : 0;
    entries.push({
      at,
      step: i + 1,
      label: typeof f.question === "string" ? f.question : null,
      costUsd: costOf(usage, usedBefore),
      evidence: { key: "sources", count: sources },
    });
    at = f.finishedAt as string;
    usedBefore = f.usageCount as number;
  });

  const total = typeof row.questions_total === "number" ? row.questions_total : null;
  const allAnswered = total !== null && findings.length >= total;
  if (row.status === "researching" && !allAnswered && row.current_question) {
    entries.push({
      at,
      step: findings.length + 1,
      label: row.current_question,
      costUsd: costOf(usage, usedBefore),
      evidence: null,
    });
  } else if (findings.length > 0 && (row.status === "synthesising" || row.status === "ready")) {
    entries.push({
      at,
      step: findings.length + 1,
      label: RESEARCH_WRITING_LABEL,
      costUsd: costOf(usage, usedBefore),
      evidence: null,
    });
  }
  if (entries.length === 0) return [];

  return timelineForClient(entries, {
    status: row.status === "ready" ? "done" : row.status === "failed" ? "failed" : "running",
    creditsCharged: typeof row.credits_charged === "number" ? row.credits_charged : null,
    finishedAt: row.completed_at ?? null,
    finalCostUsd: costOf(usage, usage.length),
  });
}

/**
 * What GET /api/research/[id] returns: the row, minus what is ours.
 *
 * The route selects `*` (see its comment: a column list would 500 on a
 * database missing a later column), and until 2026-10-04 it returned that
 * row as is — usage_entries included, i.e. every model id and token count
 * the report spent, in the browser. Removed by name here, so a column
 * added later still reaches the screen and only these never do.
 */
export const SERVER_ONLY_RESEARCH_COLUMNS = ["usage_entries", "reservation_id"] as const;

export function researchReportForClient(row: Record<string, unknown>): Record<string, unknown> & { timeline: ClientStep[] } {
  const out: Record<string, unknown> = { ...row };
  for (const column of SERVER_ONLY_RESEARCH_COLUMNS) delete out[column];
  return { ...out, timeline: researchTimeline(row as ResearchTimelineRow) };
}
