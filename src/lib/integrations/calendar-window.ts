/**
 * THE DAYS A CALENDAR QUESTION COVERS (MASTER 16, package 31). Pure and
 * client-safe, so lib/integrations/read.ts uses it and
 * scripts/tests/google-calendar.test.mjs holds it without a network.
 */

/** The longest period one read may cover: a year. */
const MAX_CALENDAR_SPAN_DAYS = 366;
const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * The period a calendar question covers. A question about a calendar is
 * mostly a question about WHEN ("τι έχω αύριο;"), which keywords cannot
 * express, so the model may name the days; without them it is the coming
 * month and yesterday. A period the wrong way round is turned the right
 * way; one longer than a year is cut to a year from its start.
 */
export function calendarWindow(from: unknown, to: unknown, now: Date = new Date()): { timeMin: string; timeMax: string } {
  const read = (value: unknown): number | null => {
    if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}(?:[T ][\d:.]+(?:Z|[+-]\d{2}:?\d{2})?)?$/.test(value.trim())) return null;
    const t = Date.parse(value.trim());
    return Number.isFinite(t) ? t : null;
  };
  const isDay = (value: unknown) => typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value.trim());
  let first = read(from);
  let last = read(to);
  let lastIsDay = isDay(to);
  // Turned round BEFORE the last day is widened, so the day that ends the
  // period is the one that is widened to its end.
  if (first !== null && last !== null && last < first) {
    [first, last] = [last, first];
    lastIsDay = isDay(from);
  }
  const start = first ?? now.getTime() - DAY_MS;
  // A day named alone ("2026-10-08") means that whole day.
  let end = last !== null ? last + (lastIsDay ? DAY_MS : 0) : first !== null ? start + DAY_MS : now.getTime() + 30 * DAY_MS;
  if (end - start > MAX_CALENDAR_SPAN_DAYS * DAY_MS) end = start + MAX_CALENDAR_SPAN_DAYS * DAY_MS;
  // An end before the start (an end named alone, in the past) is one day.
  if (end <= start) end = start + DAY_MS;
  return { timeMin: new Date(start).toISOString(), timeMax: new Date(end).toISOString() };
}
