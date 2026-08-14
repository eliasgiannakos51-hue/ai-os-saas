// Cron parsing and timezone-correct next-run computation for Autonomous
// Agents.
//
// Deliberately dependency-free and deliberately NOT `server-only`: the
// create-an-agent preview shows the user the next three run times before
// they commit, and that has to be computed from the SAME code the cron
// will later schedule with. A second implementation in the browser is
// exactly how a preview starts lying.
//
// WHY THIS EXISTS AT ALL, given api/cron/scheduled-runs already schedules
// things: that route is documented as UTC-only, and says so honestly —
// every user's automation fires at 09:00 UTC wherever they live. That is
// survivable for "run this step tomorrow". It is not survivable for an
// agent whose entire value proposition is "every morning": 09:00 UTC is
// 01:00 for a user in Los Angeles, so their "morning briefing" arrives in
// the middle of the night, every night, forever. So agents carry a real
// IANA timezone and this file resolves cron fields against it.

export type CronFields = {
  minute: number[];
  hour: number[];
  dayOfMonth: number[];
  month: number[];
  dayOfWeek: number[];
  /** True when the field was a bare "*" — needed for the dom/dow OR rule. */
  dayOfMonthRestricted: boolean;
  dayOfWeekRestricted: boolean;
};

export type CronParseResult =
  | { ok: true; fields: CronFields }
  | { ok: false; error: string };

const RANGES = {
  minute: [0, 59],
  hour: [0, 23],
  dayOfMonth: [1, 31],
  month: [1, 12],
  dayOfWeek: [0, 6],
} as const;

type FieldName = keyof typeof RANGES;

const FIELD_ORDER: FieldName[] = ["minute", "hour", "dayOfMonth", "month", "dayOfWeek"];

/**
 * Parses ONE field into the sorted, de-duplicated set of values it matches.
 *
 * Supports the four forms that actually appear in schedules a person would
 * describe out loud: `*`, `5`, `1-5`, `1,3,5`, and either of the last two
 * with a `/step`. Anything else is rejected rather than approximated —
 * this string decides when we spend the user's money, so "close enough"
 * is not an acceptable failure mode.
 */
function parseField(raw: string, name: FieldName): number[] | { error: string } {
  const [min, max] = RANGES[name];
  const values = new Set<number>();

  for (const part of raw.split(",")) {
    const piece = part.trim();
    if (piece === "") return { error: `empty value in the ${name} field` };

    const [rangePart, stepPart, ...rest] = piece.split("/");
    if (rest.length > 0) return { error: `too many "/" in the ${name} field` };

    let step = 1;
    if (stepPart !== undefined) {
      if (!/^\d+$/.test(stepPart)) return { error: `invalid step in the ${name} field` };
      step = Number(stepPart);
      if (step < 1) return { error: `step must be at least 1 in the ${name} field` };
    }

    let from: number;
    let to: number;
    if (rangePart === "*") {
      from = min;
      to = max;
    } else if (/^\d+$/.test(rangePart)) {
      from = Number(rangePart);
      // "5/15" means "every 15 starting at 5", not "exactly 5" — matching
      // Vixie cron. Without a step it is the single value.
      to = stepPart === undefined ? from : max;
    } else {
      const m = rangePart.match(/^(\d+)-(\d+)$/);
      if (!m) return { error: `unrecognised value "${piece}" in the ${name} field` };
      from = Number(m[1]);
      to = Number(m[2]);
    }

    // Sunday is both 0 and 7 in every cron dialect. Normalise before the
    // range check so "7" is accepted rather than reported as out of range.
    if (name === "dayOfWeek") {
      if (from === 7) from = 0;
      if (to === 7) to = 0;
    }

    if (from < min || from > max || to < min || to > max) {
      return { error: `${name} value out of range (${min}-${max})` };
    }
    if (to < from) return { error: `reversed range in the ${name} field` };

    for (let v = from; v <= to; v += step) values.add(v);
  }

  if (values.size === 0) return { error: `the ${name} field matches nothing` };
  return [...values].sort((a, b) => a - b);
}

export function parseCronExpression(expression: string): CronParseResult {
  if (typeof expression !== "string") return { ok: false, error: "Schedule must be a string." };
  const parts = expression.trim().split(/\s+/).filter(Boolean);
  if (parts.length !== 5) {
    return {
      ok: false,
      error: "Schedule must have exactly 5 fields: minute hour day-of-month month day-of-week.",
    };
  }

  const parsed: Partial<Record<FieldName, number[]>> = {};
  for (let i = 0; i < FIELD_ORDER.length; i++) {
    const name = FIELD_ORDER[i];
    const result = parseField(parts[i], name);
    if (!Array.isArray(result)) return { ok: false, error: result.error };
    parsed[name] = result;
  }

  return {
    ok: true,
    fields: {
      minute: parsed.minute!,
      hour: parsed.hour!,
      dayOfMonth: parsed.dayOfMonth!,
      month: parsed.month!,
      dayOfWeek: parsed.dayOfWeek!,
      dayOfMonthRestricted: parts[2] !== "*",
      dayOfWeekRestricted: parts[4] !== "*",
    },
  };
}

// ---------------------------------------------------------------------
// The fair-use rule that lives in the schedule itself.
// ---------------------------------------------------------------------
//
// Every run costs real money (an Anthropic call, sometimes a web search,
// an email). The per-user hourly cap in lib/agents/agent-limits.ts is the
// backstop, but a backstop that silently drops runs produces an agent
// that "sometimes doesn't work" — far worse than one that was never
// allowed to be created. So the minute field must resolve to exactly ONE
// value: "0 * * * *" (hourly) is fine, "*/5 * * * *" is not.
export const MAX_RUNS_PER_HOUR_PER_AGENT = 1;

/**
 * The last day each month can have. February is 29 because a leap year is
 * a real year — "29 2" is a rare schedule, not an impossible one.
 */
const LAST_DAY_OF_MONTH = [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

/** Month names for the error message, indexed 1-12. */
const MONTH_KEYS = [
  "",
  "january", "february", "march", "april", "may", "june",
  "july", "august", "september", "october", "november", "december",
] as const;

export type ImpossibleCronDate = { day: number; month: number; monthKey: string };

/**
 * The day/month pairs in this expression that do not exist on a calendar.
 *
 * THE BUG THIS EXISTS FOR, which cost real money.
 *
 * "0 8 31 2 *" parsed cleanly (31 is inside dayOfMonth's 1-31 range, 2 is
 * inside month's 1-12), passed validateAgentCron, and produced an agent
 * that was created, charged for, and displayed as "day 31 of every month" —
 * and never ran once, because the 31st of February is not a date.
 *
 * Seven combinations do this: 30 and 31 February, and 31 in each of the
 * four thirty-day months. They are COMPUTED from the calendar below rather
 * than listed, because a hand-written list of seven is a list that will
 * miss the eighth if anyone ever edits the ranges.
 *
 * A pair is only impossible when the day is impossible in EVERY month the
 * expression allows: "0 8 31 1,2 *" is fine, because January has a 31st.
 * And the whole check is skipped when the day-of-week field is restricted,
 * since cron ORs the two — "0 8 31 2 1" fires on Mondays regardless.
 */
export function impossibleCronDates(fields: CronFields): ImpossibleCronDate[] {
  if (!fields.dayOfMonthRestricted) return [];
  // dom and dow are OR-ed by cron when both are restricted, so a
  // never-occurring dom is harmless if the dow can still fire.
  if (fields.dayOfWeekRestricted) return [];

  const reachable = fields.dayOfMonth.some((day) =>
    fields.month.some((month) => day <= LAST_DAY_OF_MONTH[month - 1])
  );
  if (reachable) return [];

  // Nothing is reachable: report every pair, so the message can name the
  // one the user actually typed rather than a generic complaint.
  const out: ImpossibleCronDate[] = [];
  for (const day of fields.dayOfMonth) {
    for (const month of fields.month) {
      if (day > LAST_DAY_OF_MONTH[month - 1]) {
        out.push({ day, month, monthKey: MONTH_KEYS[month] });
      }
    }
  }
  return out;
}

/**
 * Why a schedule was refused, as an i18n KEY plus values.
 *
 * `error` is kept because logs, tests and server-side callers want one
 * string. It is NOT what the user reads: a Greek user was being handed
 * "minute value out of range" verbatim (agent-build.ts:135), which is the
 * defect this shape exists to close. describeSchedule() in this same file
 * already returns keys rather than sentences, for the same reason.
 */
export type AgentCronRejection = {
  ok: false;
  /** English, for logs and server-side callers. Never rendered as-is. */
  error: string;
  /** Key under dashboard.agents.cronError.<key>. */
  key: "parse" | "tooFrequent" | "impossibleDate";
  /** ICU values for that key. */
  values?: Record<string, string | number>;
};

export function validateAgentCron(expression: string): { ok: true } | AgentCronRejection {
  const parsed = parseCronExpression(expression);
  if (!parsed.ok) {
    // The parser's own message is English and technical ("minute value out
    // of range"). It is carried for the log and replaced for the reader.
    return { ok: false, error: parsed.error, key: "parse", values: { detail: parsed.error } };
  }
  if (parsed.fields.minute.length > MAX_RUNS_PER_HOUR_PER_AGENT) {
    return {
      ok: false,
      error: "An agent can run at most once per hour — pick a single minute (e.g. \"0 9 * * *\").",
      key: "tooFrequent",
    };
  }
  const impossible = impossibleCronDates(parsed.fields);
  if (impossible.length > 0) {
    const { day, month, monthKey } = impossible[0];
    return {
      ok: false,
      error: `Day ${day} of month ${month} does not exist, so this agent would never run. Pick a day the month actually has (28 is safe in every month).`,
      key: "impossibleDate",
      values: { day, month, monthKey },
    };
  }
  return { ok: true };
}

// ---------------------------------------------------------------------
// Timezone arithmetic, built only on Intl — no dependency, no tz table.
// ---------------------------------------------------------------------

export function isValidTimeZone(timeZone: string): boolean {
  if (typeof timeZone !== "string" || timeZone.trim() === "") return false;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone });
    return true;
  } catch {
    return false;
  }
}

type CivilTime = { year: number; month: number; day: number; hour: number; minute: number };

const partsCache = new Map<string, Intl.DateTimeFormat>();
function formatterFor(timeZone: string): Intl.DateTimeFormat {
  let f = partsCache.get(timeZone);
  if (!f) {
    f = new Intl.DateTimeFormat("en-US", {
      timeZone,
      hourCycle: "h23",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
    partsCache.set(timeZone, f);
  }
  return f;
}

/** The wall-clock reading in `timeZone` at the given absolute instant. */
export function civilTimeIn(utcMs: number, timeZone: string): CivilTime & { second: number } {
  const parts = formatterFor(timeZone).formatToParts(new Date(utcMs));
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value ?? "0");
  return {
    year: get("year"),
    month: get("month"),
    day: get("day"),
    hour: get("hour"),
    minute: get("minute"),
    second: get("second"),
  };
}

/** Zone offset in ms at an instant: (local wall clock read as UTC) - instant. */
function offsetMsAt(utcMs: number, timeZone: string): number {
  const c = civilTimeIn(utcMs, timeZone);
  return Date.UTC(c.year, c.month - 1, c.day, c.hour, c.minute, c.second) - utcMs;
}

/**
 * The absolute instant at which `timeZone`'s wall clock reads the given
 * civil time.
 *
 * Two candidates, not one guess: the first uses the offset in effect at
 * the naive instant, which is on the wrong side of a DST boundary for
 * exactly the times near one; the second re-reads the offset at the first
 * candidate. Whichever of the two actually READS BACK as the requested
 * civil time is the answer — checked rather than assumed, because which of
 * the two is correct depends on the sign of the zone's offset. (Taking the
 * second unconditionally, which is the common shortcut, lands an hour EARLY
 * in a spring-forward gap for negative-offset zones: 02:30 on the US
 * spring-forward date resolves to 01:30 local. An agent running an hour
 * before it was scheduled to is worse than one that skips.)
 *
 * A nonexistent local time — the hour a spring-forward skips — has no
 * exact answer by definition. This returns the earliest candidate that
 * reads LATER than requested, so the agent still runs that day, shortly
 * after the gap, rather than early or not at all. Verified for both
 * offset signs (Europe/Athens and America/New_York) in
 * scripts/tests/agents.test.mjs.
 *
 * An AMBIGUOUS local time — the hour a fall-back repeats — has two
 * answers, and both candidates read back correctly. The first is returned,
 * which is the earlier of the two occurrences: the agent runs once, at the
 * first time its clock reads what it was set to.
 */
export function instantForCivilTime(civil: CivilTime, timeZone: string): number {
  const naive = Date.UTC(civil.year, civil.month - 1, civil.day, civil.hour, civil.minute, 0);
  const first = naive - offsetMsAt(naive, timeZone);
  const second = naive - offsetMsAt(first, timeZone);

  // The wall-clock reading at an instant, expressed on the same scale as
  // `naive`, so the two are directly comparable.
  const readsAs = (utcMs: number): number => {
    const c = civilTimeIn(utcMs, timeZone);
    return Date.UTC(c.year, c.month - 1, c.day, c.hour, c.minute, 0);
  };

  if (readsAs(second) === naive) return second;
  if (readsAs(first) === naive) return first;

  const later = [first, second].filter((t) => readsAs(t) > naive).sort((a, b) => a - b);
  if (later.length > 0) return later[0];
  return Math.max(first, second);
}

function matchesDay(fields: CronFields, year: number, month: number, day: number): boolean {
  if (!fields.month.includes(month)) return false;

  const dow = new Date(Date.UTC(year, month - 1, day)).getUTCDay();
  const domMatch = fields.dayOfMonth.includes(day);
  const dowMatch = fields.dayOfWeek.includes(dow);

  // Vixie cron's OR rule: when BOTH day fields are restricted, a day
  // matching either one fires. When only one is restricted, only that one
  // decides. ("0 9 1 * 1" is the 1st of the month AND every Monday — this
  // surprises people, but matching the de-facto standard is safer than
  // inventing our own semantics for a string the AI builder writes.)
  if (fields.dayOfMonthRestricted && fields.dayOfWeekRestricted) return domMatch || dowMatch;
  if (fields.dayOfMonthRestricted) return domMatch;
  if (fields.dayOfWeekRestricted) return dowMatch;
  return true;
}

/** Days scanned before giving up. A month field of a single month plus a
 *  day-of-month of 29-31 can legitimately need ~11 months. */
// Far enough ahead to reach the next 29 February from any starting point.
//
// It was 400 days, which clears "once a year" but not "once every four
// years" — so "0 8 29 2 *" resolved to null, the agent was stored with
// next_run_at = null, and nothing ever recomputes that column. A perfectly
// legal schedule became an agent that could never run, and the user was
// charged for it. 1500 days clears any gap between consecutive 29ths of
// February (the longest is eight years across a skipped century leap year,
// but 2100 is the next of those and 1500 days covers every case before it;
// see the exhaustive check in scripts/tests/agent-cron.test.mjs).
const MAX_DAYS_AHEAD = 3000;

/**
 * The first instant strictly after `from` at which `expression` fires,
 * interpreted in `timeZone`. Null when the expression is invalid or can
 * never fire (e.g. "0 0 30 2 *" — the 30th of February).
 */
export function nextRunAt(
  expression: string,
  from: Date,
  timeZone: string
): Date | null {
  const parsed = parseCronExpression(expression);
  if (!parsed.ok) return null;
  if (!isValidTimeZone(timeZone)) return null;
  const fromMs = from.getTime();
  if (!Number.isFinite(fromMs)) return null;

  const fields = parsed.fields;
  const startCivil = civilTimeIn(fromMs, timeZone);

  for (let dayOffset = 0; dayOffset <= MAX_DAYS_AHEAD; dayOffset++) {
    // Civil-date arithmetic. Date.UTC handles month/year rollover and leap
    // years; it is used purely as a calendar here, never as an instant.
    const dayCursor = new Date(
      Date.UTC(startCivil.year, startCivil.month - 1, startCivil.day + dayOffset)
    );
    const year = dayCursor.getUTCFullYear();
    const month = dayCursor.getUTCMonth() + 1;
    const day = dayCursor.getUTCDate();

    if (!matchesDay(fields, year, month, day)) continue;

    for (const hour of fields.hour) {
      for (const minute of fields.minute) {
        // Same civil day as `from`: skip the times that already passed.
        // Compared as a single number so the hour and minute can't be
        // compared independently (09:59 is not "after" 10:00).
        if (dayOffset === 0 && hour * 60 + minute <= startCivil.hour * 60 + startCivil.minute) {
          continue;
        }
        const candidate = instantForCivilTime({ year, month, day, hour, minute }, timeZone);
        // Strictly after `from`. A fall-back DST repeat can produce an
        // instant at or before it; skipping those is what stops an agent
        // running twice for the repeated hour.
        if (candidate > fromMs) return new Date(candidate);
      }
    }
  }

  return null;
}

/**
 * The next `count` run instants. The preview shows three, which is the
 * cheapest possible way for a user to catch "I meant every Monday, not
 * every day" before the agent exists.
 */
export function nextRuns(
  expression: string,
  from: Date,
  timeZone: string,
  count = 3
): Date[] {
  const out: Date[] = [];
  let cursor = from;
  for (let i = 0; i < count; i++) {
    const next = nextRunAt(expression, cursor, timeZone);
    if (!next) break;
    out.push(next);
    cursor = next;
  }
  return out;
}

// ---------------------------------------------------------------------
// Human-readable description.
// ---------------------------------------------------------------------
//
// Returns an i18n KEY plus values rather than a sentence: this renders in
// ten languages, and a formatted English string would be exactly the kind
// of hardcoded prose scripts/tests/i18n-coverage.test.mjs exists to catch.

export type ScheduleDescription = {
  /** Key under dashboard.agents.schedule.<key>. */
  key: "hourly" | "daily" | "weekly" | "monthly" | "custom";
  /** "09:00" — already zero-padded, locale-independent. */
  time?: string;
  /** 0-6, Sunday-first. Only for `weekly`. */
  weekday?: number;
  /** 1-31. Only for `monthly`. */
  dayOfMonth?: number;
  /** The raw expression — always present, shown for `custom`. */
  expression: string;
};

export function describeSchedule(expression: string): ScheduleDescription {
  const parsed = parseCronExpression(expression);
  if (!parsed.ok) return { key: "custom", expression };
  const f = parsed.fields;

  const single = (arr: number[]) => (arr.length === 1 ? arr[0] : null);
  const minute = single(f.minute);
  const hour = single(f.hour);
  const everyHour = f.hour.length === 24;
  const everyMonth = f.month.length === 12;

  if (minute === null || !everyMonth) return { key: "custom", expression };

  const pad = (n: number) => String(n).padStart(2, "0");

  if (everyHour && !f.dayOfMonthRestricted && !f.dayOfWeekRestricted) {
    return { key: "hourly", expression };
  }
  if (hour === null) return { key: "custom", expression };
  const time = `${pad(hour)}:${pad(minute)}`;

  if (!f.dayOfMonthRestricted && !f.dayOfWeekRestricted) {
    return { key: "daily", time, expression };
  }
  if (f.dayOfWeekRestricted && !f.dayOfMonthRestricted && f.dayOfWeek.length === 1) {
    return { key: "weekly", time, weekday: f.dayOfWeek[0], expression };
  }
  if (f.dayOfMonthRestricted && !f.dayOfWeekRestricted && f.dayOfMonth.length === 1) {
    return { key: "monthly", time, dayOfMonth: f.dayOfMonth[0], expression };
  }
  return { key: "custom", expression };
}

/**
 * The viewer's own IANA timezone, for pre-filling a new agent's schedule.
 *
 * The explicit "en-US" is not decoration: a bare `new Intl.DateTimeFormat()`
 * is banned across this codebase (scripts/tests/locale-formatting.test.mjs)
 * because it makes output depend on whichever locale the runtime defaults
 * to. Zone RESOLUTION does not depend on the locale, so any fixed one
 * gives the same answer — passing one keeps the rule intact with no
 * exception carved out for this call.
 *
 * Falls back to UTC on a runtime that cannot resolve a zone, which is the
 * same default the database column has.
 */
export function resolveBrowserTimeZone(): string {
  try {
    return new Intl.DateTimeFormat("en-US").resolvedOptions().timeZone || "UTC";
  } catch {
    return "UTC";
  }
}
