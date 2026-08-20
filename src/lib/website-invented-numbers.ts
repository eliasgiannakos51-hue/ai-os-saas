/**
 * Numbers on the page that the user never gave.
 *
 * THE RULE THIS ENFORCES, from the owner: never an invented number. Not a
 * price, not a phone number, not an opening time, not an address, not a
 * statistic. The prompt forbids them (website-builder.ts, "NEVER invent a
 * phone number, an email address, a street address, a price, an opening
 * time...") and a prompt is a request, not a guarantee — this is the check
 * that can SEE whether the request was honoured.
 *
 * HOW IT DECIDES. A number in the page's VISIBLE text is suspect when its
 * digits do not appear in what the user wrote. That is deliberately biased:
 * it must never flag a number the brief contains (a false accusation would
 * train the owner to ignore the list), and it should flag one the model
 * produced from nowhere. Years, CSS lengths, script constants and HTML
 * entities are excluded by construction, because the five kinds that matter
 * are the ones a reader ACTS on — they ring it, they turn up at it, they
 * expect to pay it, they arrive at that hour, they believe the claim.
 *
 * WHAT IT CANNOT SEE, stated rather than implied: an address written with
 * no street word at all ("Ερμού 25, Αθήνα") is indistinguishable from a
 * capitalised word next to a number, so it is not matched as an address —
 * though a 3+ digit postal code in the same line is caught as a `stat`.
 *
 * Pure and dependency-free: the API route uses it after generation, the
 * preview surfaces what it returns, and the tests call it directly.
 */

export type SuspectNumber = {
  kind: "phone" | "price" | "time" | "address" | "stat";
  /** Exactly as it appears on the page, so the owner can find it. */
  text: string;
};

/** Digits only and without leading zeros, so "+30 2310 555 123",
 *  "302310555123" and "09:00" / "9:00" all compare as the reader
 *  would read them. */
function normalizeDigits(value: string): string {
  const digits = value.replace(/\D+/g, "").replace(/^0+/, "");
  if (digits) return digits;
  return /\d/.test(value) ? "0" : "";
}

const STREET_WORDS =
  "street|st\\.|road|rd\\.|avenue|ave\\.|boulevard|blvd\\.|lane|drive|square|" +
  "str\\.|straße|strasse|weg|platz|" +
  "calle|avenida|plaza|" +
  "rue|boulevard|avenue|place|" +
  "via|viale|piazza|corso|" +
  "rua|avenida|praça|" +
  "οδός|οδού|οδ\\.|λεωφόρος|λεωφ\\.|πλατεία";

/** "15 years of experience" and its translations — a claim with only one
 *  or two digits, which no shape-based rule can see. */
const CLAIM_NOUNS =
  "years?|clients?|customers?|projects?|reviews?|" +
  "jahre|kunden|projekte|" +
  "años|clientes|proyectos|" +
  "ans|clients|projets|" +
  "anni|clienti|progetti|" +
  "anos|clientes|projetos|" +
  "χρόνια|πελάτες|έργα|κριτικές";

/**
 * Order matters, and not only for the label.
 *
 * Each pattern CLAIMS the span of text it matched — reported or excused —
 * and later patterns skip anything that overlaps a claimed span. Without
 * that, an excused phone number "+30 2310 555 123" was re-reported by the
 * plain-number rule as three inventions: "2310", "555", "123". The specific
 * kinds therefore run first, and the catch-all runs last over what is left.
 */
const PATTERNS: {
  kind: SuspectNumber["kind"];
  re: RegExp;
  /** Reject a match with fewer digits than this. */
  minDigits?: number;
  /** A claim marker means a year-shaped number is still a claim
   *  ("2000+ customers" is not the year 2000). */
  yearIsFine?: boolean;
}[] = [
  // A phone number: 8+ digits, optionally grouped, optionally with a
  // country prefix. The digit floor is what stops it swallowing two
  // adjacent prices ("4.50 12.00") as one long number.
  { kind: "phone", re: /\+?\d(?:[\d\s().-]{6,})\d/gu, minDigits: 8 },
  // A price: a currency symbol or code touching a number, either side.
  { kind: "price", re: /(?:[€$£¥]\s?\d[\d.,]*|\d[\d.,]*\s?(?:€|\$|£|¥|EUR|USD|GBP))/giu },
  // An opening time: 09:00, 9.30, or one end of a range of them.
  { kind: "time", re: /(?<![\d\p{L}])\d{1,2}[:.]\d{2}(?![\d\p{L}])/gu },
  // A street address, number-first (English, and anything that writes it
  // that way).
  {
    kind: "address",
    re: new RegExp(
      `(?<![\\d\\p{L}])\\d{1,4}[a-zA-Z]?\\s+(?:\\p{Lu}[\\p{Ll}]+\\s+){0,2}(?:${STREET_WORDS})(?![\\p{L}])`,
      "giu"
    ),
  },
  // ...and street-first (Greek, German, Italian, Spanish, Portuguese).
  {
    kind: "address",
    re: new RegExp(
      `(?<![\\p{L}])(?:${STREET_WORDS})\\s+(?:\\p{Lu}[\\p{Ll}ά-ώ]+\\s+){0,2}\\d{1,4}(?![\\d\\p{L}])`,
      "giu"
    ),
  },
  // A claim carrying its own marker: a percentage, a "500+", or a number
  // leaning on a claim noun. A year here is a claim, not a date.
  { kind: "stat", re: /\d[\d.,]*\s?%/gu, yearIsFine: true },
  { kind: "stat", re: /\d[\d.,]*\s?\+/gu, yearIsFine: true },
  {
    kind: "stat",
    re: new RegExp(`(?<![\\d\\p{L}])\\d{1,3}\\s?(?:${CLAIM_NOUNS})(?![\\p{L}])`, "giu"),
    yearIsFine: true,
  },
  // ...and a bare number big enough to be a figure rather than a count.
  { kind: "stat", re: /(?<![\d\p{L}])\d{1,3}(?:[.,]\d{3})+(?![\d\p{L}])/gu },
  { kind: "stat", re: /(?<![\d\p{L}])\d{3,}(?![\d\p{L}])/gu },
];

/** A four-digit number in this range is a year, not a claim. */
function isYear(digits: string): boolean {
  if (digits.length !== 4) return false;
  const n = Number(digits);
  return n >= 1900 && n <= 2100;
}

/** Strip everything a reader never sees, so a CSS length, a script
 *  constant, an SVG path or an HTML entity cannot be mistaken for a fact. */
function visibleTextOf(html: string): string {
  // A `tel:` link is a fact the reader ACTS on even when its label says
  // "Call us" — tapping it dials. It lives in an attribute, which the tag
  // strip below removes, so lift it out first.
  const dialable = Array.from(html.matchAll(/href\s*=\s*["']tel:([^"']+)["']/gi))
    .map((m) => m[1])
    .join(" ");
  return (dialable ? dialable + " " : "") + html
    .replace(/<(script|style|noscript|template|svg)\b[^>]*>[\s\S]*?<\/\1>/gi, " ")
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<[^>]*>/g, " ")
    .replace(/&#x?[0-9a-f]+;/gi, " ")
    .replace(/&[a-z]+;/gi, " ");
}

/**
 * Every number the brief contains — at every grouping the user might have
 * meant.
 *
 * "Open 10:00-18:00" has to satisfy a page that shows "18:00" on its own,
 * so each contiguous run of digit groups inside one token counts: 10, 1000,
 * 100018, 10001800, 00, 0018, ..., 1800, 00. Taking only the whole token
 * would flag the page's own opening hours as invented.
 */
function briefNumbers(brief: string): Set<string> {
  const set = new Set<string>();
  for (const token of brief.matchAll(/\d[\d\s.,:()+\-/]*\d|\d/gu)) {
    const groups = (token[0].match(/\d+/g) ?? []).slice(0, 40);
    for (let i = 0; i < groups.length; i++) {
      let acc = "";
      for (let j = i; j < groups.length; j++) {
        acc += groups[j];
        const normalized = normalizeDigits(acc);
        if (normalized) set.add(normalized);
      }
    }
  }
  return set;
}

/**
 * Did the user give this number?
 *
 * Exact match on the normalised digits, plus ONE deliberate loosening: a
 * phone the user wrote without its country prefix and the page wrote with
 * it (or the reverse). Containment is allowed only when BOTH sides are
 * phone-length, because a bare "5 rooms" in the brief must never be able to
 * excuse a fabricated "+30 2310 555 123".
 */
function givenByUser(digits: string, brief: Set<string>): boolean {
  if (brief.has(digits)) return true;
  if (digits.length < 7) return false;
  for (const known of brief) {
    if (known.length < 7) continue;
    if (known.includes(digits) || digits.includes(known)) return true;
  }
  return false;
}

/**
 * Is this position inside a `[placeholder]` or a `{{placeholder}}`?
 *
 * A page that writes `[your phone number]` is doing exactly the right
 * thing, and a sample written as `[+30 210 1234567]` is the same gesture
 * with digits in it. The brackets never appear inside a match — none of the
 * patterns can match one — so the surrounding text is where to look: walk
 * back to the nearest opener and forward to the nearest closer.
 */
function insideBrackets(text: string, index: number): boolean {
  const openers = "[{";
  const closers = "]}";
  let open = -1;
  for (let i = index; i >= 0 && index - i < 200; i--) {
    if (closers.includes(text[i]) && i < index) return false;
    if (openers.includes(text[i])) {
      open = i;
      break;
    }
  }
  if (open < 0) return false;
  for (let i = index; i < text.length && i - index < 200; i++) {
    if (openers.includes(text[i]) && i > index) return false;
    if (closers.includes(text[i])) return true;
  }
  return false;
}

/**
 * Every number on the page that is not in the brief.
 *
 * `brief` is the user's own words — the description they typed plus any
 * answers they gave to clarifying questions. Numbers are compared by their
 * DIGITS, so formatting differences ("40.000" vs "40000", "9:00" vs
 * "09:00") never produce a false accusation.
 */
export function findInventedNumbers(html: string, brief: string): SuspectNumber[] {
  const visible = visibleTextOf(html);
  const given = briefNumbers(brief);

  const found: SuspectNumber[] = [];
  const seen = new Set<string>();
  /** Spans already accounted for by an earlier, more specific pattern. */
  const claimed: [number, number][] = [];
  const overlapsClaimed = (start: number, end: number) =>
    claimed.some(([s2, e2]) => start < e2 && s2 < end);

  for (const { kind, re, minDigits, yearIsFine } of PATTERNS) {
    re.lastIndex = 0;
    for (const match of visible.matchAll(re)) {
      const raw = match[0];
      const start = match.index ?? 0;
      const end = start + raw.length;
      if (overlapsClaimed(start, end)) continue;
      const text = raw.trim();
      const digits = normalizeDigits(text);
      if (!digits) continue;
      if (minDigits !== undefined && text.replace(/\D+/g, "").length < minDigits) continue;
      // From here the span is this pattern's, whatever the verdict — an
      // EXCUSED number must claim its text too, or the catch-all re-reports
      // its pieces.
      claimed.push([start, end]);
      if (!yearIsFine && isYear(digits)) continue;
      if (givenByUser(digits, given)) continue;
      // A bracketed placeholder is the CORRECT behaviour, not a fake — and
      // the brackets are OUTSIDE the match, because no pattern here can
      // match a bracket. Checking the matched text for one would be a check
      // that never fires.
      if (insideBrackets(visible, start)) continue;
      if (seen.has(digits)) continue;
      seen.add(digits);
      found.push({ kind, text });
    }
  }
  return found;
}
