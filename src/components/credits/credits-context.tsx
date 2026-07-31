"use client";

import { createContext, useCallback, useContext, useState, type ReactNode } from "react";

type CreditsContextValue = {
  credits: number | null;
  refresh: () => Promise<void>;
};

const CreditsContext = createContext<CreditsContextValue | null>(null);

// Seeded with a server-fetched initial value (see dashboard/layout.tsx) so
// the top nav never flashes a loading state on first paint; refresh() is
// called by every credit-consuming action (chat send, create anything,
// gated module creation) so the displayed number updates live without a
// full page reload.
export function CreditsProvider({
  initialCredits,
  children,
}: {
  initialCredits: number | null;
  children: ReactNode;
}) {
  const [credits, setCredits] = useState<number | null>(initialCredits);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch("/api/credits/balance");
      const data = await res.json();
      if (res.ok && data?.ok && typeof data.credits === "number") {
        setCredits(data.credits);
      }
    } catch {
      // Best-effort — a failed refresh just leaves the last known balance
      // displayed until the next successful one.
    }
  }, []);

  return <CreditsContext.Provider value={{ credits, refresh }}>{children}</CreditsContext.Provider>;
}

export function useCredits(): CreditsContextValue {
  const ctx = useContext(CreditsContext);
  if (!ctx) {
    throw new Error("useCredits must be used within a CreditsProvider");
  }
  return ctx;
}
