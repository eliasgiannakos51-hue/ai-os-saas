"use client";

import { useTranslations } from "next-intl";
import { Sparkles } from "lucide-react";
import type { ValueReport } from "@/lib/value-report";

/**
 * "Your impact this month."
 *
 * Renders nothing at all for a new account. A panel that says "no data
 * yet" on somebody's second day is a panel taking up space to report its
 * own emptiness, and the overview already has enough to look at.
 *
 * The quiet month DOES render, and says so plainly rather than showing a
 * row of zeros. A month where nothing happened is worth naming — it is
 * the moment somebody either picks the product back up or stops paying
 * for it — but naming it as "0 presentations, 0 published sites" is a
 * scoreboard of failure the product chose to show them.
 */
export function ValueReportCard({ report }: { report: ValueReport }) {
  const t = useTranslations("dashboard.valueReport");

  if (report.kind === "too_early") return null;

  if (report.kind === "quiet") {
    return (
      <section className="mt-6 rounded-2xl border border-border bg-panel/60 p-4">
        <h2 className="mb-1 flex items-center gap-2 text-xs font-medium text-muted">
          <Sparkles className="h-4 w-4" aria-hidden="true" />
          {t("title")}
        </h2>
        <p className="text-xs text-muted">{t("quiet")}</p>
      </section>
    );
  }

  return (
    <section className="mt-6 rounded-2xl border border-border bg-panel/60 p-4">
      <h2 className="mb-2 flex items-center gap-2 text-xs font-medium text-muted">
        <Sparkles className="h-4 w-4" aria-hidden="true" />
        {t("title")}
      </h2>

      <p className="text-lg font-semibold">
        {t(`lines.${report.headline.key}`, { count: report.headline.count })}
      </p>

      {report.others.length > 0 ? (
        <ul className="mt-2 space-y-1 text-xs text-muted">
          {report.others.map((line) => (
            <li key={line.key}>{t(`lines.${line.key}`, { count: line.count })}</li>
          ))}
        </ul>
      ) : null}

      {/* What it cost, next to what it did. A value panel that shows only
          the upside is an advertisement; showing the spend beside it is
          what makes the rest of the numbers worth believing. */}
      <p className="mt-3 text-[11px] text-muted">{t("creditsSpent", { credits: report.creditsSpent })}</p>
    </section>
  );
}
