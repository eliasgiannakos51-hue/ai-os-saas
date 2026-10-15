"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import { useCredits } from "@/components/credits/credits-context";
import { creditLevel } from "@/lib/billing/credit-level";

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

  // The threshold and what counts as "nothing left" are lib/billing/credit-level.ts,
  // shared with the phone's bottom bar so the two can never disagree.
  const level = creditLevel({ credits, total, isAdmin });
  if (credits === null || (level !== "low" && level !== "empty")) return null;

  const isEmpty = level === "empty";
  const label = isEmpty ? t("none") : t("remaining", { count: credits });

  // The top-nav variant has to survive in a dense row, so it is a compact
  // pill; the Home variant can afford a full-width strip with the action.
  if (variant === "inline") {
    // FROM sm UP ONLY. The top bar is full on a phone (components/dashboard/top-nav.tsx
    // counts it at 344px of 375), and this pill pushed the account button
    // out of it: every page scrolled sideways, by 33px at 390px in Greek
    // and 15px in English, whenever the balance was low (found 2026-10-08,
    // scripts/tests/chat-attachments-edges.prodtest.mjs). On a phone the
    // balance is in the bottom bar instead, beside «You», coloured by the
    // same level (components/dashboard/mobile-tab-bar.tsx; the owner's
    // decision of 2026-10-09, built 2026-10-14).
    return (
      <Link
        href="/dashboard/settings#credits"
        className={[
          "hidden items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-medium transition-colors duration-200 sm:inline-flex",
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
