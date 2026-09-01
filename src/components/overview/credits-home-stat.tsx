"use client";

import { Zap } from "lucide-react";
import { useCredits } from "@/components/credits/credits-context";
import { HomeStatCard } from "@/components/overview/home-stat-card";
import { formatNumber } from "@/lib/format-number";
import { useLocale } from "next-intl";

// Reads the same CreditsContext the top nav's credit badge already uses
// (see dashboard/layout.tsx's CreditsProvider) — no separate query, just
// the live client-side value. No trend: there's no stored credit-balance
// history to chart honestly, so this card is number-only by design.
export function CreditsHomeStat({
  label,
  explain,
  openLabel,
}: {
  label: string;
  explain: string;
  openLabel: string;
}) {
  const locale = useLocale();
  const { credits, isAdmin } = useCredits();

  return (
    <HomeStatCard
      icon={<Zap className="h-4 w-4" aria-hidden="true" />}
      label={label}
      value={isAdmin ? "∞" : credits === null ? "…" : formatNumber(credits, locale)}
      explain={explain}
      // NO `basis`, and the absence is the statement: a balance is not a
      // summary of countable things, so "from N entries" would be a
      // sentence with nothing true to put in it. Where it goes instead is
      // the ledger, which is what the link opens.
      href="/dashboard/settings#buy-credits"
      openLabel={openLabel}
    />
  );
}
