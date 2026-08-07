// Turning a spreadsheet cell into a database value.
//
// This is where imports actually go wrong. Not in the parsing — in the
// two conversions below, both of which are ambiguous in ways that are
// invisible until the numbers are wrong.
//
// Client-safe: the preview shows the user the COERCED values, not the
// raw ones, because "1.234,56 → 1234.56" is something they can check and
// "1.234,56 → 1.23" is something they would only discover in a report
// three weeks later.

export type CoerceResult<T> =
  | { ok: true; value: T }
  | { ok: false; reason: string };

// ---------------------------------------------------------------------
// Numbers
// ---------------------------------------------------------------------

/**
 * Parse a number the way spreadsheets actually write them.
 *
 * THE AMBIGUITY. "1.234" is one thousand two hundred and thirty-four in
 * Germany and one-point-two-three-four in the UK. There is no way to
 * know from the cell alone, and guessing wrong is a factor of 1000 on
 * somebody's revenue.
 *
 * The rule used here resolves it from STRUCTURE rather than locale,
 * because structure is evidence and a locale header is not:
 *
 *   - Both separators present → the LAST one is the decimal point.
 *     "1.234,56" is German; "1,234.56" is English. Unambiguous.
 *   - Only one separator, and exactly three digits follow it, and the
 *     number has no other grouping → ambiguous, and resolved as a
 *     THOUSANDS separator ("1.234" → 1234). This is the case that has to
 *     pick one, and thousands is right far more often in financial
 *     exports, where three trailing digits after a dot is almost always
 *     a grouped thousand rather than a tenth of a cent.
 *   - Only one separator with any other digit count → decimal.
 *     "1.5" → 1.5, "12,75" → 12.75.
 *
 * Currency symbols, spaces and non-breaking spaces are stripped.
 * Parentheses mean negative — accounting exports write "(1,200.00)".
 */
export function coerceNumber(raw: string): CoerceResult<number> {
  let text = raw.trim();
  if (!text) return { ok: false, reason: "empty" };

  // Accounting negatives.
  let negative = false;
  if (/^\(.*\)$/.test(text)) {
    negative = true;
    text = text.slice(1, -1).trim();
  }

  // Currency symbols and codes, thin/non-breaking spaces, and a trailing
  // percent sign (a percentage column is still a number).
  text = text
    .replace(/[   \s]/g, "")
    .replace(/^[^\d(+.,-]+/, "")
    .replace(/[^\d).,%-]+$/, "")
    .replace(/%$/, "");

  if (text.startsWith("-")) {
    negative = !negative;
    text = text.slice(1);
  } else if (text.startsWith("+")) {
    text = text.slice(1);
  }

  if (!/^[\d.,']+$/.test(text) || !/\d/.test(text)) {
    return { ok: false, reason: "not a number" };
  }

  // The Swiss apostrophe grouping is unambiguous — always thousands.
  text = text.replace(/'/g, "");

  const lastDot = text.lastIndexOf(".");
  const lastComma = text.lastIndexOf(",");

  let normalised: string;
  if (lastDot !== -1 && lastComma !== -1) {
    // Both present: the later one is the decimal separator.
    const decimalAt = Math.max(lastDot, lastComma);
    const groupChar = decimalAt === lastDot ? "," : ".";
    normalised =
      text.slice(0, decimalAt).split(groupChar).join("") + "." + text.slice(decimalAt + 1);
  } else if (lastDot !== -1 || lastComma !== -1) {
    const at = lastDot !== -1 ? lastDot : lastComma;
    const sep = lastDot !== -1 ? "." : ",";
    const after = text.length - at - 1;
    const occurrences = text.split(sep).length - 1;

    if (occurrences > 1) {
      // "1.234.567" — repeated, so it must be grouping.
      normalised = text.split(sep).join("");
    } else if (after === 3) {
      // The ambiguous case. Resolved as thousands — see the comment.
      normalised = text.split(sep).join("");
    } else {
      normalised = text.slice(0, at) + "." + text.slice(at + 1);
    }
  } else {
    normalised = text;
  }

  const value = Number(normalised);
  if (!Number.isFinite(value)) return { ok: false, reason: "not a number" };
  return { ok: true, value: negative ? -value : value };
}

// ---------------------------------------------------------------------
// Dates
// ---------------------------------------------------------------------

const MONTHS: Record<string, number> = {
  jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6,
  jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12,
};

/**
 * Parse a date, and REFUSE the ones that cannot be known.
 *
 * THE AMBIGUITY. "03/04/2025" is 3 April in most of the world and 4
 * March in the United States. Unlike the number case there is no
 * structural tie-breaker — both readings are valid dates — so this
 * function does not guess in isolation. `detectDateOrder` looks at the
 * WHOLE COLUMN first and finds a day value above 12, which settles it
 * for every row; only if the entire column is ambiguous does it fall
 * back, and the caller surfaces that as a choice.
 *
 * Getting this wrong is the "your worst trades were all Monday morning"
 * insight being confidently, unfalsifiably wrong — which is worse than
 * having no insight, because the user cannot tell.
 *
 * `Date.parse` is deliberately NOT used as a general fallback: it is
 * implementation-defined for non-ISO strings and silently applies the
 * US reading in V8.
 */
export type DateOrder = "dmy" | "mdy" | "ymd";

export function coerceDate(raw: string, order: DateOrder = "dmy"): CoerceResult<string> {
  const text = raw.trim();
  if (!text) return { ok: false, reason: "empty" };

  // ISO first: unambiguous, and what a good export produces.
  const iso = /^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2})(?::(\d{2}))?)?/.exec(text);
  if (iso) {
    // The date half is ISO, but the TIME half may still carry an am/pm
    // suffix — "2025-03-04 09:30 pm" is a real shape, produced by
    // exporters that format the date and the time separately. Reading
    // the hour straight out of the ISO capture makes that 09:30, which
    // is twelve hours wrong and completely invisible: the value parses,
    // stores and displays fine. `timePart` is the only thing here that
    // knows about meridiems, so it decides whenever one is present.
    const meridiem = /\d{1,2}:\d{2}(?::\d{2})?\s*(am|pm)/i.test(text);
    const time = meridiem
      ? timePart(text)
      : { hour: Number(iso[4] ?? 0), minute: Number(iso[5] ?? 0), second: Number(iso[6] ?? 0) };
    return build(Number(iso[1]), Number(iso[2]), Number(iso[3]), time.hour, time.minute, time.second);
  }

  // "12 Mar 2025", "Mar 12, 2025", "12-March-2025" — the month is a word,
  // so nothing is ambiguous.
  const named = /^(\d{1,2})[\s.\-/]*([a-z]{3,})[\s.\-/,]*(\d{2,4})|^([a-z]{3,})[\s.\-/]*(\d{1,2})[\s.\-/,]*(\d{2,4})/i.exec(text);
  if (named) {
    const day = Number(named[1] ?? named[5]);
    const monthWord = (named[2] ?? named[4] ?? "").slice(0, 3).toLowerCase();
    const year = Number(named[3] ?? named[6]);
    const month = MONTHS[monthWord];
    if (month && day) {
      const { hour, minute, second } = timePart(text);
      return build(fullYear(year), month, day, hour, minute, second);
    }
  }

  const numeric = /^(\d{1,4})[./\-](\d{1,2})[./\-](\d{1,4})/.exec(text);
  if (!numeric) return { ok: false, reason: "not a date" };

  const a = Number(numeric[1]);
  const b = Number(numeric[2]);
  const c = Number(numeric[3]);
  const { hour, minute, second } = timePart(text);

  // A four-digit first component can only be a year, whatever the
  // configured order says.
  if (numeric[1].length === 4) return build(a, b, c, hour, minute, second);

  if (order === "ymd") return build(fullYear(a), b, c, hour, minute, second);
  if (order === "mdy") return build(fullYear(c), a, b, hour, minute, second);
  return build(fullYear(c), b, a, hour, minute, second);
}

function timePart(text: string): { hour: number; minute: number; second: number } {
  const m = /(\d{1,2}):(\d{2})(?::(\d{2}))?\s*(am|pm)?/i.exec(text);
  if (!m) return { hour: 0, minute: 0, second: 0 };
  let hour = Number(m[1]);
  const meridiem = m[4]?.toLowerCase();
  if (meridiem === "pm" && hour < 12) hour += 12;
  if (meridiem === "am" && hour === 12) hour = 0;
  return { hour, minute: Number(m[2]), second: Number(m[3] ?? 0) };
}

/** Two-digit years. The 70 cut-off is the POSIX convention and is right
 *  for business data: an "89" in a trade log is 1989, a "24" is 2024. */
function fullYear(year: number): number {
  if (year >= 1000) return year;
  return year >= 70 ? 1900 + year : 2000 + year;
}

function build(
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
  second: number
): CoerceResult<string> {
  if (!Number.isInteger(year) || year < 1900 || year > 2200) return { ok: false, reason: "not a date" };
  if (!Number.isInteger(month) || month < 1 || month > 12) return { ok: false, reason: "not a date" };
  if (!Number.isInteger(day) || day < 1 || day > 31) return { ok: false, reason: "not a date" };
  if (hour > 23 || minute > 59 || second > 59) return { ok: false, reason: "not a date" };

  const ms = Date.UTC(year, month - 1, day, hour, minute, second);
  const back = new Date(ms);
  // Rejects 31 February, which Date.UTC would happily roll into March.
  if (back.getUTCMonth() !== month - 1 || back.getUTCDate() !== day) {
    return { ok: false, reason: "not a real date" };
  }
  return { ok: true, value: back.toISOString() };
}

/**
 * Work out the day/month order from a whole column.
 *
 * One row cannot settle "03/04/2025", but a column usually can: as soon
 * as any row has a first component above 12, that component is the day
 * and the order is d/m/y. Both positions are counted, because a column
 * of US dates gives the opposite evidence.
 *
 * Returns `ambiguous` when the column genuinely cannot be decided —
 * every date falls on or before the 12th of its month. The caller must
 * then ASK rather than assume; a silently-wrong date order is invisible
 * and poisons every time-based insight built on it.
 */
export function detectDateOrder(values: string[]): { order: DateOrder; ambiguous: boolean } {
  let firstAbove12 = 0;
  let secondAbove12 = 0;
  let isoCount = 0;
  let considered = 0;

  for (const raw of values) {
    const text = raw.trim();
    if (!text) continue;
    if (/^\d{4}-\d{2}-\d{2}/.test(text)) {
      isoCount++;
      considered++;
      continue;
    }
    const m = /^(\d{1,4})[./\-](\d{1,2})[./\-](\d{1,4})/.exec(text);
    if (!m) continue;
    considered++;
    if (m[1].length === 4) {
      isoCount++;
      continue;
    }
    if (Number(m[1]) > 12) firstAbove12++;
    if (Number(m[2]) > 12) secondAbove12++;
  }

  if (considered === 0) return { order: "dmy", ambiguous: true };
  if (isoCount === considered) return { order: "ymd", ambiguous: false };
  if (firstAbove12 > 0 && secondAbove12 === 0) return { order: "dmy", ambiguous: false };
  if (secondAbove12 > 0 && firstAbove12 === 0) return { order: "mdy", ambiguous: false };
  // Both above 12, which cannot be one consistent order — the column is
  // dirty. Say so rather than picking.
  if (firstAbove12 > 0 && secondAbove12 > 0) return { order: "dmy", ambiguous: true };
  return { order: "dmy", ambiguous: true };
}

/** Map a free-text cell onto one of a fixed set of values. Returns null
 *  when nothing matches — an unrecognised value becomes NULL rather than
 *  being forced into the first option. */
export function coerceEnum(raw: string, options: string[], synonyms: Record<string, string[]>): string | null {
  const text = raw.trim().toLowerCase();
  if (!text) return null;
  for (const option of options) {
    if (text === option) return option;
    for (const synonym of synonyms[option] ?? []) {
      if (text === synonym) return option;
    }
  }
  return null;
}

/** The synonym tables, kept next to the enums they serve. */
export const ENUM_SYNONYMS: Record<string, Record<string, string[]>> = {
  direction: {
    long: ["buy", "b", "bought", "l", "call", "bull", "buy to open"],
    short: ["sell", "s", "sold", "sh", "put", "bear", "sell to open"],
  },
  result: {
    win: ["won", "w", "profit", "winner", "tp", "take profit", "+"],
    loss: ["lost", "l", "lose", "loser", "sl", "stop loss", "-"],
    breakeven: ["be", "break even", "break-even", "flat", "scratch"],
  },
  type: {
    income: ["in", "credit", "cr", "sale", "sales", "revenue", "receipt", "deposit", "invoice", "paid in"],
    expense: ["out", "debit", "dr", "purchase", "cost", "spend", "payment", "bill", "paid out"],
  },
  sentiment: {
    positive: ["good", "happy", "pos", "promoter", "5", "4"],
    neutral: ["ok", "neutral", "passive", "3"],
    negative: ["bad", "unhappy", "neg", "detractor", "1", "2"],
  },
};
