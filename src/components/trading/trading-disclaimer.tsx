import { getTranslations } from "next-intl/server";
import { AlertTriangle } from "lucide-react";

/**
 * RULE 5: THE DISCLAIMER, EVERYWHERE.
 *
 * A SERVER COMPONENT, and that is the point. A client component can be
 * skipped by a parent that forgets to render it, hidden by a conditional,
 * or lost when a page is refactored — and nothing would notice, because
 * the page still works. This renders on the server as part of the page's
 * own markup, and scripts/tests/trading-journal.test.mjs asserts that
 * EVERY surface reading trading, bank or crypto data mounts it. A new
 * page that shows this data and forgets the notice fails the build.
 *
 * `variant="inline"` is for a card or a panel; `variant="block"` is for
 * the top of a page. Neither is dismissible. A disclaimer with a close
 * button is a disclaimer that is not there the second time somebody
 * visits, which is the visit where they act on what they read.
 */
export async function TradingDisclaimer({ variant = "inline" }: { variant?: "inline" | "block" }) {
  const t = await getTranslations("dashboard.trading");

  if (variant === "block") {
    return (
      <div
        data-testid="trading-disclaimer"
        role="note"
        className="mb-5 flex gap-2.5 rounded-2xl border border-amber-500/30 bg-amber-500/[0.06] px-4 py-3"
      >
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-400" aria-hidden="true" />
        <div className="space-y-1">
          <p className="text-xs font-semibold text-amber-200">{t("disclaimerTitle")}</p>
          <p className="text-[11px] leading-relaxed text-muted">{t("disclaimer")}</p>
        </div>
      </div>
    );
  }

  return (
    <p
      data-testid="trading-disclaimer"
      role="note"
      className="mt-3 flex items-start gap-1.5 text-[10px] leading-relaxed text-muted"
    >
      <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0 text-amber-400/80" aria-hidden="true" />
      {t("disclaimer")}
    </p>
  );
}
