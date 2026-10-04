/**
 * THE ACTIVITY TIMELINE OF ONE BACKGROUND JOB — V6.2 2.1, the first slice.
 *
 * docs/intelligence-os.md puts it first in Phase 1: "one timeline per task
 * the person sees: each step, its cost, its evidence, live". ai_jobs kept
 * only the CURRENT step (step_label is overwritten), so a finished job
 * could not say what it had done, how long each part took, or where the
 * credits went. The worker now appends one entry per step to
 * ai_jobs.timeline (migration 20261004200000_ai_jobs_timeline.sql), and
 * the poll turns it into what a person can read.
 *
 * TWO SHAPES, ON PURPOSE.
 *   TimelineEntry  — what is stored. Carries the provider cost so far in
 *                    USD, which is OUR cost and never leaves the server.
 *   ClientStep     — what the poll returns: label, time, and credits. The
 *                    credits are the job's real charge split across its
 *                    steps, so they always add up to what was charged.
 *
 * WHY THE CHARGE IS SPLIT RATHER THAN EACH STEP PRICED. A job is charged
 * once, rounded up once, at settlement. Pricing each step on its own and
 * rounding each up would add up to more than the person paid — a timeline
 * that disagrees with the bill. So the split happens after the charge
 * exists, in proportion to each step's provider cost, by largest
 * remainder, and while the job runs no step shows credits at all.
 */

/**
 * WHAT A STEP FOUND, as a key and a number — never as a sentence. A
 * sentence written by the worker would be in one language; the key is
 * rendered through messages (aiSteps.timeline.evidence.<key>) in the
 * reader's, with the plural rules of that language.
 */
export const EVIDENCE_KEYS = ["files", "parts", "planSteps", "sources", "pages", "photos"] as const;
export type EvidenceKey = (typeof EVIDENCE_KEYS)[number];
export type Evidence = { key: EvidenceKey; count: number };

export function cleanEvidence(value: unknown): Evidence | null {
  if (!value || typeof value !== "object") return null;
  const v = value as Record<string, unknown>;
  if (typeof v.key !== "string" || !(EVIDENCE_KEYS as readonly string[]).includes(v.key)) return null;
  if (typeof v.count !== "number" || !Number.isFinite(v.count) || v.count < 0) return null;
  return { key: v.key as EvidenceKey, count: Math.floor(v.count) };
}

export type TimelineEntry = {
  /** When the step began (ISO). */
  at: string;
  step: number;
  /** The raw label token the handler reported (see lib/jobs/step-labels.ts). */
  label: string | null;
  /** Provider cost of the whole job so far, in USD, when the step began. */
  costUsd: number;
  /** Optional, from the handler: what this step found. */
  evidence: Evidence | null;
};

export type ClientStep = {
  step: number;
  label: string | null;
  startedAt: string;
  /** Null while the step is still running. */
  seconds: number | null;
  /** Null until the job has a charge to split. */
  credits: number | null;
  evidence: Evidence | null;
};

/** A runaway loop must not grow a row without bound. */
export const MAX_TIMELINE_ENTRIES = 60;

function isEntry(value: unknown): value is TimelineEntry {
  if (!value || typeof value !== "object") return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.at === "string" &&
    !Number.isNaN(Date.parse(v.at)) &&
    typeof v.step === "number" &&
    Number.isFinite(v.step) &&
    typeof v.costUsd === "number" &&
    Number.isFinite(v.costUsd)
  );
}

/** Whatever is in the column, as entries — anything malformed is dropped. */
export function restoreTimeline(raw: unknown): TimelineEntry[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter(isEntry).map((e) => ({
    at: e.at,
    step: e.step,
    label: typeof e.label === "string" ? e.label : null,
    costUsd: Math.max(0, e.costUsd),
    evidence: cleanEvidence(e.evidence),
  }));
}

/**
 * One more step. A repeated report of the SAME step updates the label and
 * evidence in place and keeps the original start time — the step did not
 * start twice. That is how a handler attaches what a step FOUND: it
 * reports the step again, after the work, with the count.
 */
export function appendStep(timeline: TimelineEntry[], entry: TimelineEntry): TimelineEntry[] {
  const clean: TimelineEntry = {
    ...entry,
    costUsd: Math.max(0, Number.isFinite(entry.costUsd) ? entry.costUsd : 0),
    evidence: cleanEvidence(entry.evidence),
  };
  const last = timeline[timeline.length - 1];
  if (last && last.step === clean.step) {
    return [...timeline.slice(0, -1), { ...last, label: clean.label ?? last.label, evidence: clean.evidence ?? last.evidence }];
  }
  const next = [...timeline, clean];
  return next.length > MAX_TIMELINE_ENTRIES ? next.slice(next.length - MAX_TIMELINE_ENTRIES) : next;
}

/**
 * What the CURRENT step found. Attached to the last entry and nothing else:
 * there is no step to attach it to before the first one has begun.
 */
export function attachEvidence(timeline: TimelineEntry[], evidence: Evidence): TimelineEntry[] {
  const clean = cleanEvidence(evidence);
  if (!clean || timeline.length === 0) return timeline;
  return [...timeline.slice(0, -1), { ...timeline[timeline.length - 1], evidence: clean }];
}

/** Split `total` whole credits by `weights`, largest remainder first. */
export function splitCredits(total: number, weights: number[]): number[] {
  const sum = weights.reduce((a, b) => a + b, 0);
  if (!(total > 0) || !(sum > 0)) return weights.map(() => 0);
  const exact = weights.map((w) => (total * w) / sum);
  const floors = exact.map(Math.floor);
  let left = total - floors.reduce((a, b) => a + b, 0);
  const order = exact
    .map((x, i) => ({ i, frac: x - Math.floor(x) }))
    .sort((a, b) => b.frac - a.frac || a.i - b.i);
  for (const { i } of order) {
    if (left <= 0) break;
    floors[i] += 1;
    left -= 1;
  }
  return floors;
}

/**
 * The timeline a person sees. `finalCostUsd` is the job's total provider
 * cost (from its usage entries), used ONLY to weigh the last step; no USD
 * figure is in the output.
 */
export function timelineForClient(
  entries: TimelineEntry[],
  job: { status: string; creditsCharged: number | null; finishedAt: string | null; finalCostUsd: number }
): ClientStep[] {
  const done = job.status === "done" || job.status === "failed";
  const ends = entries.map((_, i) => (i + 1 < entries.length ? entries[i + 1].at : done ? job.finishedAt : null));
  const nextCost = entries.map((e, i) => (i + 1 < entries.length ? entries[i + 1].costUsd : Math.max(job.finalCostUsd, e.costUsd)));
  const weights = entries.map((e, i) => Math.max(0, nextCost[i] - e.costUsd));
  // A charge with no recorded cost to weigh it by cannot be split honestly:
  // zeros would not add up to what was paid, so no step shows credits.
  const weighable = weights.some((w) => w > 0) || job.creditsCharged === 0;
  const credits =
    done && typeof job.creditsCharged === "number" && job.creditsCharged >= 0 && weighable
      ? splitCredits(job.creditsCharged, weights)
      : null;
  return entries.map((e, i) => {
    const end = ends[i];
    const seconds = end ? Math.max(0, Math.round((Date.parse(end) - Date.parse(e.at)) / 1000)) : null;
    return {
      step: e.step,
      label: e.label,
      startedAt: e.at,
      seconds: Number.isFinite(seconds as number) ? seconds : null,
      credits: credits ? credits[i] : null,
      evidence: e.evidence,
    };
  });
}
