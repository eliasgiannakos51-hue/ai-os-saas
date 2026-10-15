/**
 * THE DAYS A CALENDAR QUESTION COVERS (MASTER 16, package 31). Pure and
 * client-safe, so lib/integrations/read.ts uses it and
 * scripts/tests/google-calendar.test.mjs holds it without a network.
 */
import { instantForCivilTime, isValidTimeZone } from "@/lib/agents/cron-expression";

/** The longest period one read may cover: a year. */
const MAX_CALENDAR_SPAN_DAYS = 366;
const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * The period a calendar question covers. A question about a calendar is
 * mostly a question about WHEN ("τι έχω αύριο;"), which keywords cannot
 * express, so the model may name the days; without them it is the coming
 * month and yesterday. A period the wrong way round is turned the right
 * way; one longer than a year is cut to a year from its start.
 *
 * A DAY IS THE PERSON'S DAY. With their time zone, "2026-10-09" runs from
 * midnight to midnight where they are — in Athens 21:00 to 21:00 UTC in
 * summer — not in Greenwich, which put every event between midnight and
 * 02:00–03:00 Athens time on the wrong day, and with the date Chat was
 * told (lib/integrations/chat-tool.ts) answered «αύριο» with today in
 * those same hours every night (found 2026-10-08 by
 * scripts/tests/connections-automations-edges.prodtest.mjs). Without a
 * zone a day is Greenwich's, as it always was.
 */
export function calendarWindow(from: unknown, to: unknown, now: Date = new Date(), timeZone?: unknown): { timeMin: string; timeMax: string } {
  const zone = typeof timeZone === "string" && isValidTimeZone(timeZone) ? timeZone : null;
  const isDay = (value: unknown): value is string => typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value.trim());
  /** Midnight of a day where the person is. */
  const midnightOf = (day: string): number => {
    const [year, month, date] = day.trim().split("-").map(Number);
    return instantForCivilTime({ year, month, day: date, hour: 0, minute: 0 }, zone!);
  };
  const read = (value: unknown): number | null => {
    if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}(?:[T ][\d:.]+(?:Z|[+-]\d{2}:?\d{2})?)?$/.test(value.trim())) return null;
    const t = Date.parse(value.trim());
    if (!Number.isFinite(t)) return null;
    return zone && isDay(value) ? midnightOf(value) : t;
  };
  /** The end of a day named alone: the next midnight, where the person is. */
  const endOf = (day: string, at: number): number => {
    if (!zone) return at + DAY_MS;
    return midnightOf(new Date(Date.parse(day.trim()) + DAY_MS).toISOString().slice(0, 10));
  };
  let first = read(from);
  let last = read(to);
  let firstDay: unknown = from;
  let lastDay: unknown = to;
  // Turned round BEFORE the last day is widened, so the day that ends the
  // period is the one that is widened to its end.
  if (first !== null && last !== null && last < first) {
    [first, last] = [last, first];
    [firstDay, lastDay] = [lastDay, firstDay];
  }
  const start = first ?? now.getTime() - DAY_MS;
  // A day named alone ("2026-10-08") means that whole day.
  let end =
    last !== null
      ? isDay(lastDay) ? endOf(lastDay, last) : last
      : first !== null
        ? isDay(firstDay) ? endOf(firstDay, first) : start + DAY_MS
        : now.getTime() + 30 * DAY_MS;
  if (end - start > MAX_CALENDAR_SPAN_DAYS * DAY_MS) end = start + MAX_CALENDAR_SPAN_DAYS * DAY_MS;
  // An end before the start (an end named alone, in the past) is one day.
  if (end <= start) end = start + DAY_MS;
  return { timeMin: new Date(start).toISOString(), timeMax: new Date(end).toISOString() };
}

/** Today where the person is, as YYYY-MM-DD; Greenwich's without a zone. */
export function todayIn(timeZone: unknown, now: Date = new Date()): string {
  if (typeof timeZone !== "string" || !isValidTimeZone(timeZone)) return now.toISOString().slice(0, 10);
  return new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
}
