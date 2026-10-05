/**
 * THE ACTIVITY TIMELINE OF A WEBSITE GENERATION — V6.2 2.1, slice 5.
 *
 * The worker (app/api/websites/generate/process/route.ts) records the five
 * phases it really goes through, in order, in user_websites.timeline
 * (supabase/migrations/20261008000000_website_timeline.sql). The builder
 * used to show rotating sentences tied to no phase at all; this is what
 * it can show instead.
 *
 * NO MONEY IN THE ROW. Every route that returns a user_websites row
 * selects `*`, so whatever this column holds reaches a browser. The cost
 * accumulator lives in the worker's memory only, so when the generation
 * finishes it writes each step's SHARE of the cost as a per-mille weight —
 * relative, never dollars — and the credits per step are split from the
 * generation's real charge here (splitCredits, lib/jobs/job-timeline.ts).
 *
 * Pure: no SDK, no env, no clock, so the gate runs every branch.
 */
import { cleanEvidence, splitCredits, type ClientStep, type Evidence } from "@/lib/jobs/job-timeline";

export const WEBSITE_STEPS = ["preparing", "writing", "photos", "checking", "saving"] as const;
export type WebsiteStep = (typeof WEBSITE_STEPS)[number];

/** Marks the end of a finished generation; never shown as a step. */
const DONE = "done";

export type WebsiteTimelineEntry = {
  at: string;
  step: WebsiteStep | typeof DONE;
  evidence: Evidence | null;
  /** Per-mille share of the generation's AI cost. Written only at the end. */
  weight?: number;
};

export function isWebsiteStep(value: unknown): value is WebsiteStep {
  return typeof value === "string" && (WEBSITE_STEPS as readonly string[]).includes(value);
}

/** Whatever the column holds, the entries that are well-formed. */
export function restoreWebsiteTimeline(raw: unknown): WebsiteTimelineEntry[] {
  if (!Array.isArray(raw)) return [];
  const out: WebsiteTimelineEntry[] = [];
  for (const value of raw) {
    if (!value || typeof value !== "object") continue;
    const v = value as Record<string, unknown>;
    if (typeof v.at !== "string" || Number.isNaN(Date.parse(v.at))) continue;
    if (!isWebsiteStep(v.step) && v.step !== DONE) continue;
    const entry: WebsiteTimelineEntry = { at: v.at, step: v.step as WebsiteTimelineEntry["step"], evidence: cleanEvidence(v.evidence) };
    if (typeof v.weight === "number" && Number.isFinite(v.weight) && v.weight >= 0) entry.weight = Math.round(v.weight);
    out.push(entry);
  }
  return out;
}

/** A new phase begins. The same phase twice keeps the first. */
export function startWebsiteStep(entries: WebsiteTimelineEntry[], step: WebsiteStep, at: string): WebsiteTimelineEntry[] {
  if (entries.some((e) => e.step === step)) return entries;
  return [...entries, { at, step, evidence: null }];
}

/** What the current phase found, as a key and a number. */
export function attachWebsiteEvidence(entries: WebsiteTimelineEntry[], step: WebsiteStep, evidence: Evidence): WebsiteTimelineEntry[] {
  const clean = cleanEvidence(evidence);
  if (!clean) return entries;
  return entries.map((e) => (e.step === step ? { ...e, evidence: clean } : e));
}

/**
 * The generation finished: each step gets its share of the cost, and the
 * end is marked so the last step has a duration.
 *
 * `costAtStart[i]` is the accumulated USD cost when entries[i] began, and
 * `finalCostUsd` the total. Only the shares are kept.
 */
export function finishWebsiteTimeline(
  entries: WebsiteTimelineEntry[],
  costAtStart: number[],
  finalCostUsd: number,
  at: string
): WebsiteTimelineEntry[] {
  const steps = entries.filter((e) => e.step !== DONE);
  const spans = steps.map((_, i) => {
    const start = costAtStart[i] ?? 0;
    const end = i + 1 < steps.length ? costAtStart[i + 1] ?? start : finalCostUsd;
    return Math.max(0, end - start);
  });
  const total = spans.reduce((a, b) => a + b, 0);
  const weighted = steps.map((e, i) => ({ ...e, weight: total > 0 ? Math.round((spans[i] / total) * 1000) : 0 }));
  return [...weighted, { at, step: DONE, evidence: null }];
}

/**
 * What the status poll returns. Credits appear only once the generation
 * is finished, charged and weighed; while it runs, the open step has no
 * end. Rows written before the column existed, and failed generations,
 * come back as [].
 */
export function websiteTimelineForClient(
  raw: unknown,
  website: { status: string; creditsCharged: number | null }
): ClientStep[] {
  const entries = restoreWebsiteTimeline(raw);
  const done = entries.find((e) => e.step === DONE) ?? null;
  const steps = entries.filter((e): e is WebsiteTimelineEntry & { step: WebsiteStep } => e.step !== DONE);
  if (steps.length === 0) return [];
  // A failed generation has no end to measure its last step against, and
  // "running" under a failure would be a lie: it shows nothing instead.
  if (website.status === "failed") return [];
  const finished = website.status === "completed" || website.status === "flagged";
  const weights = steps.map((e) => e.weight ?? 0);
  const weighable = steps.every((e) => typeof e.weight === "number") && (weights.some((w) => w > 0) || website.creditsCharged === 0);
  const credits =
    finished && done && typeof website.creditsCharged === "number" && website.creditsCharged >= 0 && weighable
      ? splitCredits(website.creditsCharged, weights)
      : null;
  return steps.map((e, i) => {
    const end = i + 1 < steps.length ? steps[i + 1].at : done?.at ?? null;
    const seconds = end ? Math.max(0, Math.round((Date.parse(end) - Date.parse(e.at)) / 1000)) : null;
    return {
      step: i + 1,
      label: e.step,
      startedAt: e.at,
      seconds,
      credits: credits ? credits[i] : null,
      evidence: e.evidence,
    };
  });
}

/**
 * The builder's side of the same column. Every route but the status poll
 * returns the row with `select("*")`, so `timeline` can reach the client
 * as the STORED entries ({at, step: "writing"}) rather than steps
 * ({startedAt, step: 1}). Only the poll's shape is shown; anything else is
 * [] until the poll has answered for that site.
 */
export function clientWebsiteTimeline(raw: unknown): ClientStep[] {
  if (!Array.isArray(raw)) return [];
  const ok = raw.every(
    (s) =>
      !!s &&
      typeof s === "object" &&
      typeof (s as ClientStep).step === "number" &&
      typeof (s as ClientStep).startedAt === "string" &&
      isWebsiteStep((s as ClientStep).label)
  );
  return ok ? (raw as ClientStep[]) : [];
}
