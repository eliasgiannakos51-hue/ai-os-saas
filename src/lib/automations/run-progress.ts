import type { Box } from "@/lib/automations/boxes";
import type { ShownRun } from "@/lib/automations/flow-view";
import type { StepNote } from "@/lib/automations/run-steps";

/**
 * WHERE A RUN IS, BOX BY BOX, FOR THE PRO CANVAS (the owner, 2026-11-05,
 * after the automation videos: «οι γραμμές ανάμεσα στα κουτιά ανάβουν
 * όσο τρέχει»; behind "agents-automations-pro").
 *
 * READ FROM THE RUN'S OWN ROW, never guessed from a timer. The runner
 * writes `automation_runs.steps` before every box it starts
 * (lib/automations/runner.ts, reportProgress), so a run that is still
 * `running` has one step for every box it has finished and none for the
 * box it is in. That box is the ACTIVE one, and the line into it is the
 * one that moves. Nothing here invents a position: a run with no steps
 * yet is at its start box, because that is what `running` with no steps
 * means, and a run that is not live has no active box at all.
 *
 * A RUN THAT FAILED MARKS ITS BOX, with the step's own note, so the
 * screen can say why in the reader's words (the same `notes.*` the
 * history uses). Only the run's own failed step names a box: a run that
 * crashed before writing one names none, rather than blaming the last box
 * drawn.
 *
 * IDLE IS CALM: a run that is over lights nothing. Pure, so
 * scripts/tests/automations.test.mjs §11 holds every line of it.
 */
export type BoxState = "idle" | "done" | "active" | "failed";
export type LineState = "idle" | "done" | "active";

export type RunProgress = {
  /** Whether the run is still going: the only time anything moves. */
  live: boolean;
  /** Per box id. */
  boxes: Record<string, BoxState>;
  /** `lines[i]` joins box i to box i + 1. */
  lines: LineState[];
  /** The box a finished run failed at, and the note that says why. */
  failed: { box: string; note: StepNote } | null;
};

export function idleProgress(boxes: Box[]): RunProgress {
  return {
    live: false,
    boxes: Object.fromEntries(boxes.map((b) => [b.id, "idle" as BoxState])),
    lines: boxes.slice(1).map(() => "idle" as LineState),
    failed: null,
  };
}

export function isLive(run: Pick<ShownRun, "status"> | null | undefined): boolean {
  return run?.status === "running" || run?.status === "queued";
}

export function runProgress(boxes: Box[], run: Pick<ShownRun, "status" | "steps"> | null | undefined): RunProgress {
  const idle = idleProgress(boxes);
  if (!run || boxes.length === 0) return idle;

  if (run.status === "failed") {
    const step = [...run.steps].reverse().find((s) => s.status === "failed" && boxes.some((b) => b.id === s.box));
    if (!step) return idle;
    return { ...idle, boxes: { ...idle.boxes, [step.box]: "failed" }, failed: { box: step.box, note: step.note } };
  }
  if (!isLive(run)) return idle;

  const stepped = new Set(run.steps.map((s) => s.box));
  const state: Record<string, BoxState> = {};
  let activeAt = -1;
  boxes.forEach((box, i) => {
    if (stepped.has(box.id)) {
      state[box.id] = "done";
    } else if (activeAt < 0) {
      // The first box with no step yet is the one the run is in.
      activeAt = i;
      state[box.id] = "active";
    } else {
      state[box.id] = "idle";
    }
  });
  const lines: LineState[] = boxes.slice(1).map((box, i) => {
    const from = state[boxes[i].id];
    const to = state[box.id];
    if (from === "done" && to === "active") return "active";
    if (from === "done" && to === "done") return "done";
    return "idle";
  });
  return { live: true, boxes: state, lines, failed: null };
}

/**
 * THE RUN THE CANVAS FOLLOWS. While this screen has a run of its own in
 * flight («Δοκιμή», «Εκτέλεση τώρα», «Έγκριση»), it is that run: the one
 * approved by id, or the newest one that was not in the list when the
 * press was made — compared by id, not by clock, so a computer whose
 * clock is a minute out cannot pick last week's failure. Otherwise it is
 * the newest run of the automation, whoever started it (the cron, a
 * file), so a run that is going when the page opens is drawn going.
 */
export type Watch = { known: string[]; runId?: string | null };

export function followedRun<R extends Pick<ShownRun, "id" | "startedAt">>(runs: R[], watch: Watch | null): R | null {
  const newest = [...runs].sort((a, b) => (a.startedAt < b.startedAt ? 1 : a.startedAt > b.startedAt ? -1 : 0));
  if (watch) {
    if (watch.runId) return newest.find((r) => r.id === watch.runId) ?? null;
    const known = new Set(watch.known);
    return newest.find((r) => !known.has(r.id)) ?? null;
  }
  return newest[0] ?? null;
}

/** How often the screen asks how a live run is going: once a second, only while one is. */
export const PROGRESS_POLL_MS = 1000;
