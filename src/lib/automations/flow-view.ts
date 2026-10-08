import { readFlow, type Box } from "@/lib/automations/boxes";
import { readSteps, type RunStatus, type RunStep } from "@/lib/automations/run-steps";

/**
 * WHAT THE SCREEN DRAWS, READ FROM WHAT THE ROUTES SEND (MASTER 16,
 * package 30). Client-safe and pure: the page reads the rows server-side
 * and the routes answer with the same columns (lib/automations/
 * flow-access.ts FLOW_COLUMNS, RUN_COLUMNS), and both go through these.
 *
 * A row whose boxes are not a row any more — an old shape, a hand edit
 * in the database — is shown with no boxes rather than not at all, so it
 * can still be deleted.
 */
export type ShownFlow = {
  id: string;
  name: string;
  said: string;
  boxes: Box[];
  version: number;
  isActive: boolean;
  timeZone: string;
  nextRunAt: string | null;
  lastRunAt: string | null;
  costLimit: number;
};

export type ShownRun = {
  id: string;
  flowId: string;
  startedBy: "time" | "event" | "manual" | "dry";
  status: RunStatus;
  steps: RunStep[];
  /** What the run sent or saved — or, waiting, what it will send once approved. */
  output: string | null;
  credits: number;
  error: string | null;
  approvalExpiresAt: string | null;
  startedAt: string;
  finishedAt: string | null;
};

const STARTED_BY = ["time", "event", "manual", "dry"] as const;
const STATUSES: RunStatus[] = ["queued", "running", "waiting_approval", "done", "stopped", "failed", "cancelled"];

const str = (v: unknown): string | null => (typeof v === "string" ? v : null);

export function readShownFlow(row: Record<string, unknown>): ShownFlow {
  const flow = readFlow(row.boxes);
  return {
    id: String(row.id ?? ""),
    name: String(row.name ?? ""),
    said: String(row.said ?? ""),
    boxes: flow.ok ? flow.boxes : [],
    version: Number(row.version) || 1,
    isActive: row.is_active === true,
    timeZone: str(row.time_zone) ?? "Europe/Athens",
    nextRunAt: str(row.next_run_at),
    lastRunAt: str(row.last_run_at),
    costLimit: Number(row.cost_limit) || 100,
  };
}

export function readShownRun(row: Record<string, unknown>): ShownRun {
  const state = row.state && typeof row.state === "object" ? (row.state as Record<string, unknown>) : {};
  const status = (STATUSES as unknown[]).includes(row.status) ? (row.status as RunStatus) : "failed";
  return {
    id: String(row.id ?? ""),
    flowId: String(row.flow_id ?? ""),
    startedBy: (STARTED_BY as readonly unknown[]).includes(row.started_by) ? (row.started_by as ShownRun["startedBy"]) : "manual",
    status,
    steps: readSteps(row.steps),
    // A waiting run keeps its text as `text`, a finished one as `output`.
    output: status === "waiting_approval" ? str(state.text) : str(state.output),
    credits: Number(row.credits_charged) || 0,
    error: str(row.error),
    approvalExpiresAt: str(row.approval_expires_at),
    startedAt: String(row.started_at ?? ""),
    finishedAt: str(row.finished_at),
  };
}

/** The error a run ended with, as the code the screen says in words: the part after "box:". */
export function errorCode(error: string | null): string | null {
  if (!error) return null;
  const at = error.indexOf(":");
  return at >= 0 ? error.slice(at + 1) : error;
}
