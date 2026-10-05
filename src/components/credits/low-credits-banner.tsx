"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import { useCredits } from "@/components/credits/credits-context";

// Below this share of the monthly allowance, the user gets a heads-up.
// 20% is early enough to act on and late enough not to nag.
export const LOW_CREDITS_THRESHOLD = 0.2;

/**
 * Discrete "X credits left this month" notice.
 *
 * Deliberately not a modal, not a toast, and not dismissible: the point is
 * ambient awareness, so running out is never a surprise. It simply stops
 * rendering once the balance is topped up.
 *
 * Renders nothing for admin/unlimited accounts (they have no meaningful
 * percentage), when the total is unknown, or when the balance is healthy.
 */
export function LowCreditsBanner({ variant = "banner" }: { variant?: "banner" | "inline" }) {
  const { credits, total, isAdmin } = useCredits();
  const t = useTranslations("credits.low");

  if (isAdmin) return null;
  if (credits === null || total === null || total <= 0) return null;
  if (credits / total > LOW_CREDITS_THRESHOLD) return null;

  const isEmpty = credits <= 0;
  const label = isEmpty ? t("none") : t("remaining", { count: credits });

  // The top-nav variant has to survive in a dense row, so it is a compact
  // pill; the Home variant can afford a full-width strip with the action.
  if (variant === "inline") {
    return (
      <Link
        href="/dashboard/settings#credits"
        className={[
          "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-medium transition-colors duration-200",
          isEmpty
            ? "bg-danger/15 text-danger hover:bg-danger/25"
            : "bg-foreground/15 text-foreground hover:bg-foreground/25",
        ].join(" ")}
        title={t("topUp")}
      >
        <span
          className={["h-1.5 w-1.5 rounded-full", isEmpty ? "bg-danger" : "bg-button"].join(" ")}
          aria-hidden="true"
        />
        {label}
      </Link>
    );
  }

  return (
    <div
      className={[
        "mb-6 flex flex-wrap items-center justify-between gap-3 rounded-card border px-4 py-3",
        isEmpty
          ? "border-danger/35 bg-danger/[0.06]"
          : "border-foreground/35 bg-foreground/[0.06]",
      ].join(" ")}
    >
      <p className="text-xs text-muted">
        <span className="font-semibold text-foreground">{label}</span>
        {" — "}
        {t("hint")}
      </p>
      <Link
        href="/dashboard/settings#credits"
        className="shrink-0 rounded-item border border-border px-3 py-1.5 text-xs font-semibold text-foreground transition-all duration-200 hover:border-foreground/40 hover:text-foreground"
      >
        {t("topUp")}
      </Link>
    </div>
  );
}
