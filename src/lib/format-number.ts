import { DEFAULT_LOCALE } from "@/i18n/constants";

/**
 * Locale-aware number and date formatting, with the locale REQUIRED in
 * practice rather than inferred from the environment.
 *
 * DEFECT this fixes (found in the V1+V2 audit): 27 call sites across the
 * app formatted with a bare `value.toLocaleString()`. With no locale
 * argument, `toLocaleString` uses whatever locale the JavaScript runtime
 * is running under — and this app renders every one of those call sites
 * TWICE, in two different runtimes:
 *
 *     server (Node)      1000 -> "1,000"
 *     browser (el/de)    1000 -> "1.000"
 *     browser (fr)       1000 -> "1 000"
 *
 * React compares the two, finds the text does not match, and — because
 * the mismatch is outside any Suspense boundary — throws away the entire
 * server-rendered tree and re-renders the whole page on the client:
 *
 *     Text content does not match server-rendered HTML.
 *     There was an error while hydrating. Because the error happened
 *     outside of a Suspense boundary, the entire root will switch to
 *     client rendering.
 *
 * Reproduced on /signup in Greek: the plan cards render "1.000 credits/mo"
 * on the client against "1,000" from the server. English never triggers it,
 * because English is what Node happens to default to — which is exactly
 * why it survived every check until someone loaded the app in Greek.
 *
 * lib/format-time.ts already took this position for relative time, for the
 * same reason. This is its counterpart for numbers and absolute dates.
 */

/**
 * A number, formatted the way the user's language writes numbers.
 *
 * `useGrouping: "always"` is NOT cosmetic — it is the second half of this
 * fix, and it was found only by running the same code in both runtimes.
 *
 * Passing the correct locale is necessary but NOT sufficient, because Node
 * and Chromium ship different CLDR vintages and genuinely disagree:
 *
 *     Intl.NumberFormat("it").format(1000)
 *       Node 22   -> "1000"      (CLDR minimumGroupingDigits = 2)
 *       Chromium  -> "1.000"     (newer CLDR, = 1)
 *
 * So an Italian page could pass the right locale on both sides and STILL
 * hydrate-mismatch on any four-digit number — which is exactly what
 * /signup did, in Italian only, after the locale itself was already fixed.
 * The plan tiers are 1,000 and 3,000 credits: squarely in the window.
 *
 * "always" overrides minimumGroupingDigits entirely, so the output becomes
 * a pure function of (locale, value) rather than of whichever CLDR the
 * runtime happens to embed. Verified byte-identical between Node 22 and
 * Chromium across all ten supported locales for 100 / 1,000 / 3,000 /
 * 10,000 / 25,000 / 1,234,567 — see scripts/tests/locale-formatting.test.mjs.
 *
 * The trade-off, taken deliberately: Spanish and Italian CLDR would write
 * a bare "1000". Every other locale groups it, and a consistent "1.000"
 * across the pricing table is worth more here than matching a CLDR rule
 * that the two runtimes cannot even agree on.
 */
export function formatNumber(value: number, locale: string = DEFAULT_LOCALE): string {
  if (!Number.isFinite(value)) return "0";
  return new Intl.NumberFormat(locale, { useGrouping: "always" }).format(value);
}

/**
 * An absolute date+time, for tooltips on relative timestamps.
 *
 * Still locale-dependent, and still rendered on both sides, so it takes
 * the locale for the same reason formatNumber does. Callers should ALSO
 * pass suppressHydrationWarning where the underlying value depends on the
 * current clock — see format-time.ts.
 */
export function formatDateTime(value: string | Date, locale: string = DEFAULT_LOCALE): string {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "short" }).format(date);
}

/** A date with no time component ("next run", "unlocked on"). */
export function formatDate(value: string | Date, locale: string = DEFAULT_LOCALE): string {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat(locale, { dateStyle: "medium" }).format(date);
}

/**
 * An absolute date+time rendered in a SPECIFIC timezone.
 *
 * Autonomous Agents carry their own IANA zone (an agent set to "every
 * morning" runs at the user's 08:00, not the browser's), so "next run"
 * has to be shown in that zone or the number on screen contradicts the
 * schedule the user chose. Everywhere else in the app the viewer's own
 * zone is the right one, which is why this is a separate function rather
 * than an optional argument on formatDateTime — a timezone parameter that
 * is usually omitted is a timezone parameter that will be omitted where
 * it mattered.
 *
 * Falls back to the viewer's zone for an unrecognised id rather than
 * throwing: a bad zone must not blank out the whole card.
 */
export function formatDateTimeInZone(
  value: string | Date,
  locale: string = DEFAULT_LOCALE,
  timeZone?: string
): string {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  try {
    return new Intl.DateTimeFormat(locale, {
      dateStyle: "medium",
      timeStyle: "short",
      ...(timeZone ? { timeZone } : {}),
    }).format(date);
  } catch {
    return new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "short" }).format(date);
  }
}
