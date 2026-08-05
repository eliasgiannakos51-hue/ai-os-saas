import { DEFAULT_LOCALE } from "@/i18n/constants";

/**
 * Human-readable relative time ("2d ago" / "πριν από 2 ημ."), falling back
 * to an absolute date once it's far enough in the past that "N ago" stops
 * being useful.
 *
 * `locale` is required in effect: the previous version hardcoded English
 * suffixes ("h ago", "just now"), so every timestamp in the app stayed
 * English no matter what language the user picked — one of the reported
 * i18n bugs, and one that no amount of adding message keys would have
 * fixed, because the string was being built here rather than looked up.
 *
 * Intl.RelativeTimeFormat does the work: it ships with the platform, knows
 * every locale we support, and gets plural rules right (which a hand-rolled
 * "{n} {unit} ago" template does not — Greek, Arabic and Russian all
 * disagree with English about when a unit is plural).
 *
 * Depends on the current time, so it can render one value on the server and
 * a very slightly different one on the client hydration pass a moment
 * later (rare, and only visible right at a minute/hour boundary) — callers
 * should render it with `suppressHydrationWarning`.
 */
export function formatRelativeTime(dateString: string, locale: string = DEFAULT_LOCALE): string {
  const date = new Date(dateString);
  const diffMs = Date.now() - date.getTime();
  const diffSec = Math.floor(diffMs / 1000);

  const rtf = new Intl.RelativeTimeFormat(locale, { numeric: "auto", style: "narrow" });

  // numeric: "auto" turns "in 0 seconds" into the locale's own idiom for
  // right-now ("now", "τώρα"), which is what the old hardcoded "just now"
  // was approximating.
  if (diffSec < 5) return rtf.format(0, "second");
  if (diffSec < 60) return rtf.format(-diffSec, "second");

  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return rtf.format(-diffMin, "minute");

  const diffHour = Math.floor(diffMin / 60);
  if (diffHour < 24) return rtf.format(-diffHour, "hour");

  const diffDay = Math.floor(diffHour / 24);
  if (diffDay < 7) return rtf.format(-diffDay, "day");

  if (diffDay < 30) return rtf.format(-Math.floor(diffDay / 7), "week");

  return date.toLocaleDateString(locale, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}
