"use client";

import { useLocale } from "next-intl";
import { formatRelativeTime } from "@/lib/format-time";

/**
 * Client-side relative time bound to the ACTIVE APP LOCALE.
 *
 * Exists because formatRelativeTime is a plain function and cannot read the
 * locale itself, and because the tempting shortcut — letting
 * Intl.RelativeTimeFormat default its locale — resolves to the BROWSER's
 * language, not the one the user picked in the app. A Greek-language
 * browser would then show Greek timestamps inside an English UI, which is
 * the same class of bug as the English timestamps this replaced.
 *
 * Returns a formatter rather than a formatted string so a list can render
 * many timestamps from one hook call.
 */
export function useFormatRelativeTime(): (dateString: string) => string {
  const locale = useLocale();
  return (dateString: string) => formatRelativeTime(dateString, locale);
}
