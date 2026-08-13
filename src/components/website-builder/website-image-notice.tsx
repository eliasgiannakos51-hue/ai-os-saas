"use client";

import { AlertTriangle, ImageOff } from "lucide-react";
import { useTranslations } from "next-intl";
import {
  classifyImageOutcome,
  imageReportSeverity,
  type WebsiteImageReport,
} from "@/lib/website-image-brief";

/**
 * "Δεν βρέθηκαν σχετικές φωτογραφίες — χρησιμοποιήθηκαν placeholders."
 *
 * The reported failure was not only that a generated site got photographs
 * with no relationship to the place. It was that NOTHING SAID SO. On screen a
 * seeded placeholder is a photograph: it loads, it is the right shape, it is
 * in the right slot. A site owner scrolls past it, sees a page full of
 * pictures, and publishes.
 *
 * So the resolver counts what it did (lib/website-image-resolver.ts) and this
 * says it, in the user's own language, on the screen where they look at the
 * result. Three deliberate choices:
 *
 *   IT IS RENDERED, NOT TOASTED. A toast is gone in four seconds and the
 *   decision it informs — publish or don't — happens later.
 *
 *   IT SAYS THE NUMBER. "Some photos may be placeholders" is a hedge that
 *   costs the reader a hunt through the page. "2 of the 6 photos" is
 *   actionable, and it is measured rather than guessed.
 *
 *   IT IS LOUDER WHEN IT WAS ASKED FOR. A brief that said "φωτογραφίες από
 *   τη Σαντορίνη" and got placeholders is a promise broken, not a detail,
 *   and it gets the warning colour and its own heading.
 *
 * Renders nothing at all when every photo is real, when the page has no
 * stock photos, and when the report is null — a row generated before the
 * column existed was never measured, and claiming "all real" on the strength
 * of a missing measurement would be the same silence in a new costume.
 */
export function WebsiteImageNotice({ report }: { report: WebsiteImageReport | null | undefined }) {
  const t = useTranslations("dashboard.websiteBuilder");
  if (!report) return null;

  const severity = imageReportSeverity(report);
  if (severity === "none") return null;

  const outcome = classifyImageOutcome(report);
  const values = { placeholder: report.fromPlaceholder, total: report.total };
  const body =
    outcome === "not-configured"
      ? t("photosNotConfiguredBody", values)
      : outcome === "credentials"
        ? t("photosCredentialsBody", values)
        : outcome === "quota"
          ? t("photosQuotaBody", values)
          : t("photosPlaceholderBody", values);

  const warning = severity === "warning";
  const Icon = warning ? AlertTriangle : ImageOff;

  return (
    <div
      // Announced, because it is the reason not to press Publish, and a
      // person who reached this screen with a screen reader has exactly the
      // same decision to make as everyone else.
      role="status"
      aria-live="polite"
      className={`mt-3 flex items-start gap-2.5 rounded-lg border px-3 py-2.5 ${
        warning ? "border-amber-700/60 bg-amber-950/25" : "border-neutral-700/60 bg-neutral-900/40"
      }`}
    >
      <Icon
        className={`mt-0.5 h-4 w-4 shrink-0 ${warning ? "text-amber-400" : "text-muted"}`}
        aria-hidden="true"
      />
      <div className="min-w-0">
        <p className={`text-xs font-semibold ${warning ? "text-amber-300" : "text-neutral-200"}`}>
          {warning ? t("photosMissingTitle") : t("photosPlaceholderTitle")}
        </p>
        <p className={`mt-0.5 text-xs ${warning ? "text-amber-200/80" : "text-muted"}`}>{body}</p>
      </div>
    </div>
  );
}
