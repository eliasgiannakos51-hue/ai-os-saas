import { NOTIFICATION_SPECS, type NotificationType } from "@/lib/notify/types";

/**
 * RULE 3: QUIET HOURS — AND THEY DEFER, THEY DO NOT DROP.
 *
 * ============================================================
 * WHY DEFERRING RATHER THAN DISCARDING
 * ============================================================
 *
 * The obvious implementation is "if it is quiet hours, do not send". That
 * silently DELETES notifications: an agent that found something at 03:00
 * produces nothing at all, and the user learns about it never. Quiet
 * hours are a request about WHEN somebody is disturbed, not about what
 * they are allowed to know.
 *
 * So a notification raised inside the window is stamped with the moment
 * the window ends, and delivered then. The in-app record is written
 * immediately either way — a bell that fills up overnight is exactly what
 * a bell is for, and it interrupts nobody.
 *
 * ============================================================
 * THE WINDOW WRAPS MIDNIGHT, WHICH IS THE POINT
 * ============================================================
 *
 * Nearly every real quiet-hours setting is 22:00 to 08:00: the start is
 * LATER than the end. A containment test written as `t >= start && t <
 * end` is false for every minute of it, so the feature is off for exactly
 * the people who configured it — and on for anybody who set 09:00 to
 * 17:00, which nobody does.
 *
 * Same trap as lib/trading/journal.ts's Sydney session, and it is here
 * for the same reason: it looks right.
 *
 * Pure. Minutes-since-midnight and an offset, never a Date library.
 */

/** Minutes since local midnight, 0..1439. */
export type MinuteOfDay = number;

export type QuietHours = {
  /** Null when the user has not set any. */
  startMinute: MinuteOfDay | null;
  endMinute: MinuteOfDay | null;
  /** Minutes to add to UTC to get the user's local time. Stored as an
   *  offset rather than an IANA name because the alternative is shipping
   *  a timezone database into a pure module the build gate loads — and
   *  the offset is what the browser can report without one. */
  utcOffsetMinutes: number;
};

export const NO_QUIET_HOURS: QuietHours = {
  startMinute: null,
  endMinute: null,
  utcOffsetMinutes: 0,
};

export function parseMinuteOfDay(value: unknown): MinuteOfDay | null {
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isInteger(n) || n < 0 || n > 1439) return null;
  return n;
}

/** "22:00" -> 1320. Rejects anything else rather than guessing. */
export function parseClock(value: unknown): MinuteOfDay | null {
  if (typeof value !== "string") return null;
  const match = value.trim().match(/^([01]\d|2[0-3]):([0-5]\d)$/);
  if (!match) return null;
  return Number(match[1]) * 60 + Number(match[2]);
}

export function formatClock(minute: MinuteOfDay): string {
  const h = Math.floor(minute / 60);
  const m = minute % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

/** Local minute-of-day for an instant, under this user's offset. */
export function localMinuteOfDay(at: Date, utcOffsetMinutes: number): MinuteOfDay {
  const total = at.getUTCHours() * 60 + at.getUTCMinutes() + utcOffsetMinutes;
  // Two mods, because JavaScript's % keeps the sign of the dividend and a
  // negative offset past midnight would otherwise produce a negative
  // minute-of-day.
  return ((total % 1440) + 1440) % 1440;
}

/**
 * Is this local minute inside the window?
 *
 * Handles the wrapping case, and treats start === end as "no window"
 * rather than "the whole day" — a user who set both to 22:00 meant
 * nothing, and silencing them forever is the worse reading.
 */
export function isQuietAt(minute: MinuteOfDay, quiet: QuietHours): boolean {
  const { startMinute: start, endMinute: end } = quiet;
  if (start === null || end === null || start === end) return false;
  if (start < end) return minute >= start && minute < end;
  return minute >= start || minute < end;
}

export function isQuietNow(at: Date, quiet: QuietHours): boolean {
  return isQuietAt(localMinuteOfDay(at, quiet.utcOffsetMinutes), quiet);
}

/**
 * When this notification may actually be delivered.
 *
 * Returns `at` unchanged when it is not quiet, or when the type is
 * critical — a failed payment at 03:00 is a thing somebody wants to know
 * at 03:00, because the alternative is finding out at 09:00 that the
 * card was declined at 03:00 and the subscription lapsed at 04:00.
 *
 * Otherwise it returns the exact end of the window, so the whole night's
 * notifications arrive together at 08:00 — which, combined with the
 * grouping in grouping.ts, is one message rather than nine.
 */
export function deliverAt(params: {
  at: Date;
  type: NotificationType;
  quiet: QuietHours;
}): Date {
  const { at, type, quiet } = params;
  if (NOTIFICATION_SPECS[type].critical) return at;
  if (!isQuietNow(at, quiet)) return at;

  const end = quiet.endMinute;
  if (end === null) return at;

  const current = localMinuteOfDay(at, quiet.utcOffsetMinutes);
  // Minutes until the window ends, wrapping past midnight when it has to.
  const untilEnd = end > current ? end - current : 1440 - current + end;
  return new Date(at.getTime() + untilEnd * 60_000);
}

/** True when this delivery was pushed back. Reported so the UI can say
 *  "held until 08:00" rather than leaving a gap somebody reads as a bug. */
export function wasDeferred(at: Date, deliverAtValue: Date): boolean {
  return deliverAtValue.getTime() > at.getTime();
}
