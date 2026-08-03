// Pure date math for user_automations' recurrence — no I/O, shared by
// api/automations/create/route.ts (computes the FIRST next_run_at) and
// api/cron/scheduled-runs/route.ts (recomputes it after every execution),
// same "one algorithm, both sides, unit-testable in isolation" reasoning
// as lib/mission-context.ts.

export type AutomationFrequency = "daily" | "weekly" | "monthly";

export function isAutomationFrequency(value: unknown): value is AutomationFrequency {
  return value === "daily" || value === "weekly" || value === "monthly";
}

// Given a frequency (+ day, where relevant) and a starting point (either
// "now", for a newly-created automation, or the automation's own previous
// next_run_at, so a delayed cron run doesn't compound drift), returns the
// next UTC midnight this automation should run at — the cron runs
// once/day, so a precise time-of-day beyond "which day" isn't
// actionable, same "no reliable per-user timezone" honesty as
// lib/trading-pattern.ts's hour-of-day pattern and
// api/mission/schedule-step's "tomorrow" calculation.
export function computeNextRunAt(
  frequency: AutomationFrequency,
  from: Date,
  dayOfWeek?: number | null,
  dayOfMonth?: number | null
): Date {
  const next = new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), from.getUTCDate()));

  if (frequency === "daily") {
    next.setUTCDate(next.getUTCDate() + 1);
    return next;
  }

  if (frequency === "weekly") {
    const targetDay = typeof dayOfWeek === "number" ? dayOfWeek : from.getUTCDay();
    next.setUTCDate(next.getUTCDate() + 1);
    while (next.getUTCDay() !== targetDay) {
      next.setUTCDate(next.getUTCDate() + 1);
    }
    return next;
  }

  // monthly — day_of_month is capped to 1-28 at the schema level so it
  // always exists regardless of which month it lands in (no "Jan 31 ->
  // Feb 31 doesn't exist" edge case to handle). setUTCDate(1) FIRST is
  // required: if `next` still holds a high day-of-month (e.g. 31) when
  // setUTCMonth advances into a shorter month (e.g. Feb), JS silently
  // overflows into the month after that (Feb 31 -> Mar 3) before the
  // target day ever gets applied, landing a full month late.
  const targetDayOfMonth = typeof dayOfMonth === "number" ? dayOfMonth : Math.min(from.getUTCDate(), 28);
  next.setUTCDate(1);
  next.setUTCMonth(next.getUTCMonth() + 1);
  next.setUTCDate(targetDayOfMonth);
  return next;
}
