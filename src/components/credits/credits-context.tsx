"use client";

import { createContext, useCallback, useContext, useState, type ReactNode } from "react";

type CreditsContextValue = {
  credits: number | null;
  /** The plan's monthly allowance, so consumers can compute a percentage.
   *  Without it a "20% left" warning is impossible — 200 credits is nearly
   *  everything on Free and nearly nothing on Ultimate. */
  total: number | null;
  /** What one credit is worth on THIS account (plan rate, or the cheapest
   *  credit-pack rate they bought). The pre-submit estimate must divide by
   *  the same number settlement does, or an Ultimate user is quoted less
   *  than half what they will actually be charged. */
  accountCreditPriceEur: number | null;
  refresh: () => Promise<void>;
  isAdmin: boolean;
};

const CreditsContext = createContext<CreditsContextValue | null>(null);

// Seeded with a server-fetched initial value (see dashboard/layout.tsx) so
// the top nav never flashes a loading state on first paint; refresh() is
// called by every credit-consuming action (chat send, create anything,
// gated module creation) so the displayed number updates live without a
// full page reload.
//
// isAdmin is display-only here — admin-listed accounts (lib/admin.ts)
// never actually have credits deducted (api/chat, api/create both skip
// deductCredits for them), but /api/credits/balance and this row's
// credits_remaining were never plumbed to know that, so without this flag
// the top nav would show a plain, static, misleadingly-low number instead
// of reflecting their real unlimited access.
export function CreditsProvider({
  initialCredits,
  initialTotal = null,
  initialCreditPriceEur = null,
  isAdmin = false,
  children,
}: {
  initialCredits: number | null;
  initialTotal?: number | null;
  initialCreditPriceEur?: number | null;
  isAdmin?: boolean;
  children: ReactNode;
}) {
  const [credits, setCredits] = useState<number | null>(initialCredits);
  const [total, setTotal] = useState<number | null>(initialTotal);
  const [accountCreditPriceEur, setRate] = useState<number | null>(initialCreditPriceEur);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch("/api/credits/balance");
      const data = await res.json();
      if (res.ok && data?.ok && typeof data.credits === "number") {
        setCredits(data.credits);
        if (typeof data.total === "number") setTotal(data.total);
        if (typeof data.creditPriceEur === "number") setRate(data.creditPriceEur);
      }
    } catch {
      // Best-effort — a failed refresh just leaves the last known balance
      // displayed until the next successful one.
    }
  }, []);

  return (
    <CreditsContext.Provider value={{ credits, total, accountCreditPriceEur, refresh, isAdmin }}>{children}</CreditsContext.Provider>
  );
}

export function useCredits(): CreditsContextValue {
  const ctx = useContext(CreditsContext);
  if (!ctx) {
    throw new Error("useCredits must be used within a CreditsProvider");
  }
  return ctx;
}
