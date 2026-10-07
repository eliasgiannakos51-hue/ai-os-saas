/**
 * WHAT A RUN DID, BOX BY BOX (MASTER 16, package 30). Client-safe: the
 * runner writes it to automation_runs.steps, the screen reads it back as
 * the run's history. A step's note is a CODE plus a few values, never a
 * sentence — the screen says it in the reader's language.
 */
export const STEP_STATUSES = ["ok", "would", "waiting", "stopped", "failed", "skipped"] as const;
export type StepStatus = (typeof STEP_STATUSES)[number];

export const STEP_NOTES = [
  "started",
  "read_items",
  "read_nothing",
  "ai_done",
  "condition_empty",
  "condition_met",
  "approval_waiting",
  "approval_given",
  "would_wait",
  "sent",
  "would_send",
  "saved",
  "would_save",
  "not_connected",
  "no_file",
  "over_limit",
  "no_credits",
  "rate_limited",
  "provider",
  "unsafe",
  "delivery",
  "failed",
] as const;
export type StepNote = (typeof STEP_NOTES)[number];

export type RunStep = { box: string; status: StepStatus; note: StepNote; count?: number; credits?: number; via?: string };

export function readSteps(raw: unknown): RunStep[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((s): s is Record<string, unknown> => Boolean(s) && typeof s === "object")
    .map((s) => ({
      box: String(s.box ?? "").slice(0, 24),
      status: (STEP_STATUSES as readonly unknown[]).includes(s.status) ? (s.status as StepStatus) : "failed",
      note: (STEP_NOTES as readonly unknown[]).includes(s.note) ? (s.note as StepNote) : "failed",
      ...(typeof s.count === "number" && Number.isFinite(s.count) ? { count: s.count } : {}),
      ...(typeof s.credits === "number" && Number.isFinite(s.credits) ? { credits: s.credits } : {}),
      ...(typeof s.via === "string" ? { via: s.via.slice(0, 20) } : {}),
    }))
    .slice(0, 16);
}

export type RunStatus = "queued" | "running" | "waiting_approval" | "done" | "stopped" | "failed" | "cancelled";

/** How long a run waits for an approval before it is cancelled, charging nothing more. */
export const APPROVAL_WAIT_HOURS = 48;
