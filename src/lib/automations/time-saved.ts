/**
 * «ΣΟΥ ΓΛΊΤΩΣΕ ~X ΏΡΕΣ» — TIME SAVED, MEASURED (the owner, 2026-11-05,
 * after the automation videos; behind the switch "automation-time-saved").
 *
 * TWO NUMBERS, NEITHER OF THEM OURS. How many minutes the job used to
 * take is the PERSON's, typed by them on the automation
 * (automation_flows.minutes_saved, 20261114000000); how many times it
 * ran to the end is the database's, counted by the runs route
 * (api/automations/flows/[id]/runs, `doneRuns`). Their product is the
 * whole of the claim, and the screen prints both factors beside it so a
 * reader can redo it in their head.
 *
 * WHAT COUNTS AS A RUN THAT SAVED TIME: status `done`, started by the
 * schedule, a file, or «Εκτέλεση τώρα» — never a «Δοκιμή», which sends
 * nothing and saves nobody anything, and never one that stopped, failed
 * or waits for an approval. COUNTED_STARTS is that list, and the route
 * filters on it.
 *
 * NO MINUTES, NO NUMBER. An automation nobody gave minutes to shows
 * nothing at all: not zero, not an estimate, not a default — a default
 * would be a number we invented and printed as theirs.
 *
 * Pure, so scripts/tests/automations.test.mjs §13 holds the arithmetic.
 */
export const MIN_MINUTES = 1;
/** Eight hours: one working day is the most one run can honestly replace. */
export const MAX_MINUTES = 480;

/** The starts whose finished runs did the job for real. */
export const COUNTED_STARTS = ["time", "event", "manual"] as const;

/** A stored or typed value, as minutes, or null when it is not one. */
export function readMinutes(raw: unknown): number | null {
  if (raw === null || raw === undefined || raw === "") return null;
  const n = typeof raw === "number" ? raw : typeof raw === "string" && /^\s*\d+\s*$/.test(raw) ? Number(raw) : NaN;
  if (!Number.isInteger(n) || n < MIN_MINUTES || n > MAX_MINUTES) return null;
  return n;
}

export type TimeSaved =
  | { kind: "none" }
  | { kind: "not_yet"; minutesPerRun: number }
  | { kind: "minutes"; total: number; runs: number; minutesPerRun: number }
  | { kind: "hours"; total: number; hours: number; runs: number; minutesPerRun: number };

/**
 * Runs × minutes, said the way a person says it: under an hour in
 * minutes, under ten hours to the half hour, past that in whole hours.
 * The «~» on the screen is for that rounding and nothing else.
 */
export function timeSaved(doneRuns: number, minutesPerRun: number | null): TimeSaved {
  const minutes = readMinutes(minutesPerRun);
  if (minutes === null) return { kind: "none" };
  const runs = Number.isInteger(doneRuns) && doneRuns > 0 ? doneRuns : 0;
  if (runs === 0) return { kind: "not_yet", minutesPerRun: minutes };
  const total = runs * minutes;
  if (total < 60) return { kind: "minutes", total, runs, minutesPerRun: minutes };
  const hours = total < 600 ? Math.round(total / 30) / 2 : Math.round(total / 60);
  return { kind: "hours", total, hours, runs, minutesPerRun: minutes };
}
