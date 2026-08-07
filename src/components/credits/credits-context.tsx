"use client";

import { createContext, useCallback, useContext, useState, type ReactNode } from "react";
import { useTranslations } from "next-intl";
import { useToast } from "@/components/toast/toast-context";
import { readUsageReceipt, type UsageReceipt } from "@/lib/billing/usage-receipt";

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
  refresh: () => Promise<number | null>;
  /**
   * Call after ANY action that may have been billed, passing the raw API
   * response. Refreshes the balance and shows the user what it cost.
   *
   * Both halves were missing. The counter only moved on a full reload —
   * refresh() existed, and its own comment claimed "called by every
   * credit-consuming action", but twelve of the seventeen components
   * using this context never called it, including chat, the Website
   * Builder, Create Studio, Ask AI and Weekly Reflection. And nothing
   * anywhere reported what an action had cost, so a charge was visible
   * only in the database.
   *
   * Safe to call with any payload: a response carrying no receipt just
   * refreshes the balance.
   */
  reportUsage: (payload: unknown) => Promise<void>;
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
  const { addToast } = useToast();
  const t = useTranslations("credits");
  const [credits, setCredits] = useState<number | null>(initialCredits);
  const [total, setTotal] = useState<number | null>(initialTotal);
  const [accountCreditPriceEur, setRate] = useState<number | null>(initialCreditPriceEur);

  // Returns the new balance so a caller can put it in the same message as
  // the charge ("Used 109 credits - 24,891 left") without a second read.
  const refresh = useCallback(async (): Promise<number | null> => {
    try {
      const res = await fetch("/api/credits/balance");
      const data = await res.json();
      if (res.ok && data?.ok && typeof data.credits === "number") {
        setCredits(data.credits);
        if (typeof data.total === "number") setTotal(data.total);
        if (typeof data.creditPriceEur === "number") setRate(data.creditPriceEur);
        return data.credits as number;
      }
    } catch {
      // Best-effort — a failed refresh just leaves the last known balance
      // displayed until the next successful one.
    }
    return null;
  }, []);

  const reportUsage = useCallback(
    async (payload: unknown) => {
      const receipt: UsageReceipt | null = readUsageReceipt(payload);
      // The balance is re-read even without a receipt: an action that
      // billed through a path this component cannot see still moved it.
      const remaining = await refresh();
      if (!receipt) return;

      // A free chat message says how many are left, because that is the
      // number the user is actually tracking.
      if (receipt.freeRemaining !== null) {
        addToast(t("freeMessage", { count: receipt.freeRemaining }), "success");
        return;
      }
      if (receipt.bypass) {
        addToast(
          receipt.wouldHaveCharged !== null
            ? t("unlimitedWouldHaveCost", { count: receipt.wouldHaveCharged })
            : t("unlimited"),
          "success"
        );
        return;
      }
      // Zero is not worth interrupting anyone for.
      if (receipt.creditsCharged <= 0) return;
      // The user never chooses a model, so when a complex request ran on
      // the strongest tier, the receipt says so — otherwise the higher
      // charge looks like a pricing bug from their side.
      const base =
        remaining !== null
          ? t("usedWithRemaining", { count: receipt.creditsCharged, remaining })
          : t("used", { count: receipt.creditsCharged });
      addToast(
        receipt.modelTier === "max" ? `${base} \u00b7 ${t("advancedModel")}` : base,
        "success"
      );
    },
    [refresh, addToast, t]
  );

  return (
    <CreditsContext.Provider
      value={{ credits, total, accountCreditPriceEur, refresh, reportUsage, isAdmin }}
    >
      {children}
    </CreditsContext.Provider>
  );
}

export function useCredits(): CreditsContextValue {
  const ctx = useContext(CreditsContext);
  if (!ctx) {
    throw new Error("useCredits must be used within a CreditsProvider");
  }
  return ctx;
}
