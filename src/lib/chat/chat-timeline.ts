/**
 * THE ACTIVITY TIMELINE OF ONE CHAT ANSWER — V6.2 2.1, slice 6, the last.
 *
 * A chat answer that searches the web or the person's connected data is
 * the "big task" the design asks to show step by step, inside the
 * conversation (docs/CONTEXT.md, ΣΥΝΟΜΙΛΙΑ). The route
 * (app/api/chat/route.ts) reports each phase as it really begins — the
 * model starting, a web search block opening, the data tool running, the
 * first word of text — and this file turns those marks into the same
 * ClientStep shape every other timeline uses (lib/jobs/job-timeline.ts),
 * so components/ui/ai-job-timeline.tsx renders it unchanged.
 *
 * NO CREDITS PER STEP, ON PURPOSE. The other timelines split the charge
 * by each step's provider cost. Here one model call searches AND writes,
 * and its usage arrives once, at the end of the call: any split between
 * "searching" and "writing" inside it would be invented. The turn's real
 * charge is already on screen (the usage receipt of the `done` frame), so
 * every step carries credits: null rather than a guess.
 *
 * Not stored: the timeline lives in the stream and in the open page. A
 * conversation reloaded from the database shows its answers without it.
 *
 * Pure: no SDK, no env, no clock, so the gate runs every branch.
 */
import { cleanEvidence, type ClientStep, type Evidence } from "@/lib/jobs/job-timeline";

export const CHAT_STEPS = ["thinking", "searching_web", "searching_data", "writing"] as const;
export type ChatStep = (typeof CHAT_STEPS)[number];

/** A runaway search-and-write loop must not grow the frame without bound. */
export const MAX_CHAT_STEPS = 12;

export type ChatTimelineEntry = { at: string; label: ChatStep; evidence: Evidence | null };

export function isChatStep(value: unknown): value is ChatStep {
  return typeof value === "string" && (CHAT_STEPS as readonly string[]).includes(value);
}

/**
 * A phase begins. The same phase as the one running is not a new step —
 * the model streams text in many deltas, and each is not a step. Past the
 * cap the last step simply continues.
 */
export function markChatStep(entries: ChatTimelineEntry[], label: ChatStep, at: string): ChatTimelineEntry[] {
  const last = entries[entries.length - 1];
  if (last?.label === label) return entries;
  if (entries.length >= MAX_CHAT_STEPS) return entries;
  return [...entries, { at, label, evidence: null }];
}

/** What the running step found. Adds to a count already there: two searches in a row are one step. */
export function addChatEvidence(entries: ChatTimelineEntry[], evidence: Evidence): ChatTimelineEntry[] {
  const clean = cleanEvidence(evidence);
  const last = entries[entries.length - 1];
  if (!clean || !last) return entries;
  const count = last.evidence?.key === clean.key ? last.evidence.count + clean.count : clean.count;
  return [...entries.slice(0, -1), { ...last, evidence: { key: clean.key, count } }];
}

/**
 * Worth showing only when the answer did more than think and write: a
 * plain answer already has the thinking indicator and the text itself,
 * and a two-line "Thinking · Writing" under every reply is noise.
 */
export function chatTimelineWorthShowing(entries: { label: string | null }[]): boolean {
  return entries.some((e) => e.label === "searching_web" || e.label === "searching_data");
}

/**
 * The steps a person sees. `endedAt` closes the last step; while the
 * answer still streams it is null and the open step has no duration.
 */
export function chatTimelineForClient(entries: ChatTimelineEntry[], endedAt: string | null): ClientStep[] {
  return entries.map((e, i) => {
    const end = i + 1 < entries.length ? entries[i + 1].at : endedAt;
    const seconds = end ? Math.max(0, Math.round((Date.parse(end) - Date.parse(e.at)) / 1000)) : null;
    return {
      step: i + 1,
      label: e.label,
      startedAt: e.at,
      seconds: Number.isFinite(seconds as number) ? seconds : null,
      credits: null,
      evidence: e.evidence,
    };
  });
}

/** What a `step` frame from the stream may carry, checked before it is kept. */
export function readChatStepFrame(frame: unknown): ChatTimelineEntry | null {
  if (!frame || typeof frame !== "object") return null;
  const f = frame as Record<string, unknown>;
  if (!isChatStep(f.label) || typeof f.at !== "string" || Number.isNaN(Date.parse(f.at))) return null;
  return { at: f.at, label: f.label, evidence: cleanEvidence(f.evidence) };
}
