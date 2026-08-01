"use client";

import { Zap } from "lucide-react";
import { useCredits } from "@/components/credits/credits-context";
import { HomeStatCard } from "@/components/overview/home-stat-card";

// Reads the same CreditsContext the top nav's credit badge already uses
// (see dashboard/layout.tsx's CreditsProvider) — no separate query, just
// the live client-side value. No trend: there's no stored credit-balance
// history to chart honestly, so this card is number-only by design.
export function CreditsHomeStat({ label }: { label: string }) {
  const { credits, isAdmin } = useCredits();

  return (
    <HomeStatCard
      icon={Zap}
      label={label}
      value={isAdmin ? "∞" : credits === null ? "…" : credits.toLocaleString()}
    />
  );
}
