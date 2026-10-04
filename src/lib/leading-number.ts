/**
 * THE NUMBER INSIDE A FORMATTED STAT — read back so it can be counted up
 * (src/hooks/use-count-up.ts) and end on exactly what formatNumber wrote.
 * Pure, so scripts/tests/count-up.test.mjs runs it in all ten locales.
 */
// Stat values in the UI are already-formatted strings ("12", "1.2k",
// "€48", "3 days"). Rather than forcing every caller to thread a raw
// number through, this splits off a leading integer so the numeric part
// can animate while any prefix/suffix stays put. Returns null when there
// is no leading integer to animate (e.g. "Ideas", "—"), which callers
// use as the "just render the string as-is" signal.
export function splitLeadingNumber(
  formatted: string
): { prefix: string; number: number; suffix: string } | null {
  // [\s\S] rather than the `s` (dotAll) flag — the tsconfig target
  // predates es2018, where that flag was introduced.
  // THE SEPARATOR IS THE LOCALE'S, NOT ENGLISH'S. This stripped commas
  // only, so Greek "10.000" (ten thousand, from formatNumber) became
  // Number("10.000") = 10 and the Activity page counted up to 10 under
  // a header that said 10.000 — in every locale that groups with a dot
  // (el, de, es, it, pt). Seen in the D.11 audit's screenshots.
  //
  // So: digits in groups of three with ONE kind of separator are a
  // grouped integer, whichever separator it is. Anything else with a
  // separator in it — a decimal, an ambiguous "1.5" — is not counted up
  // at all and renders exactly as written, which is always correct.
  const match = /^(\D*?)(\d[\d,.\u00a0\u202f' ]*\d|\d)([\s\S]*)$/.exec(formatted);
  if (!match) return null;
  const digits = match[2];
  let numeric: number;
  if (/^\d+$/.test(digits)) {
    numeric = Number(digits);
  } else {
    const grouped = /^\d{1,3}([,.\u00a0\u202f' ])\d{3}(?:\1\d{3})*$/.exec(digits);
    if (!grouped) return null;
    numeric = Number(digits.split(grouped[1]).join(""));
  }
  if (!Number.isFinite(numeric) || !Number.isInteger(numeric)) return null;
  return { prefix: match[1], number: numeric, suffix: match[3] };
}
