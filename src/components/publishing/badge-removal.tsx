"use client";

import { useCallback, useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { Loader2, Sparkles } from "lucide-react";

/**
 * REMOVING THE BADGE WITH CREDITS, ON THE SITE IT APPLIES TO.
 *
 * PER SITE, so the control lives on the site's own row rather than in
 * Settings. Somebody with three published sites has three separate
 * decisions to make, and one switch in Settings would either charge for
 * all of them or leave them guessing which it applied to.
 *
 * THE PRICE IS ON SCREEN BEFORE THE BUTTON THAT SPENDS IT — in credits,
 * in euros, and as how many months their current balance covers. A price
 * in credits alone is a price in a currency the customer cannot value,
 * and "200 credits" tells somebody nothing about whether they can afford
 * it in June.
 *
 * A PAID PLAN IS TOLD IT ALREADY HAS THIS, and shown no button at all.
 * Rule (ε) is not merely "do not charge twice", it is "never offer to".
 */

type State = {
  creditsPerSitePerMonth: number;
  eurPerSitePerMonth: number;
  monthsAffordable: number;
  creditsRemaining: number;
  active: boolean;
  autoRenewCancelled: boolean;
  includedInPlan: boolean;
  canBuy: boolean;
  reason: string | null;
};

export function BadgeRemoval({ siteId }: { siteId: string }) {
  const t = useTranslations("publishing.badge");
  const tCommon = useTranslations("common");
  const [state, setState] = useState<State | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/publishing/badge?siteId=${encodeURIComponent(siteId)}`);
      if (!res.ok) return;
      setState((await res.json()) as State);
    } catch {
      // A panel that could not load its own state shows nothing rather
      // than a price that might be wrong.
    }
  }, [siteId]);

  useEffect(() => {
    void load();
  }, [load]);

  if (!state) return null;

  // NOTHING TO OFFER SOMEBODY WHO ALREADY HAS IT.
  if (state.includedInPlan) {
    return <p className="text-xs text-muted">{t("includedInPlan")}</p>;
  }

  async function buy() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/publishing/badge", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ siteId }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        setError(String(data.error ?? tCommon("networkError")));
        return;
      }
      await load();
    } catch {
      setError(tCommon("networkError"));
    } finally {
      setBusy(false);
    }
  }

  async function cancel() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/publishing/badge?siteId=${encodeURIComponent(siteId)}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        setError(tCommon("networkError"));
        return;
      }
      await load();
    } catch {
      setError(tCommon("networkError"));
    } finally {
      setBusy(false);
    }
  }

  if (state.active) {
    return (
      <div className="space-y-1">
        <p className="flex items-center gap-1.5 text-xs text-emerald-400">
          <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
          {t("removedThisMonth")}
        </p>
        {state.autoRenewCancelled ? (
          // WHAT THEY KEEP, not merely that they cancelled. "Cancelled"
          // on its own reads as "the badge is back now", and it is not.
          <p className="text-xs text-muted">{t("cancelledKeepsMonth")}</p>
        ) : (
          <button
            type="button"
            onClick={cancel}
            disabled={busy}
            className="inline-flex min-h-[32px] items-center gap-1.5 text-xs text-muted underline underline-offset-2 transition-colors duration-150 hover:text-foreground disabled:opacity-60"
          >
            {busy ? <Loader2 className="h-3 w-3 animate-spin" aria-hidden="true" /> : null}
            {t("stopRenewing")}
          </button>
        )}
        {error ? <p className="text-xs text-red-400">{error}</p> : null}
      </div>
    );
  }

  return (
    <div className="space-y-1.5">
      {/* THE WHOLE PRICE, BEFORE THE BUTTON. Credits are what is
          deducted, euros are what they mean, and months-affordable is
          the question somebody actually has. */}
      <p className="text-xs text-muted">
        {t("offer", {
          credits: state.creditsPerSitePerMonth,
          eur: state.eurPerSitePerMonth.toFixed(2),
        })}
      </p>
      <p className="text-xs text-muted">
        {state.canBuy
          ? t("affordable", { balance: state.creditsRemaining, months: state.monthsAffordable })
          : t("notEnough", { balance: state.creditsRemaining, needed: state.creditsPerSitePerMonth })}
      </p>
      <button
        type="button"
        onClick={buy}
        disabled={busy || !state.canBuy}
        className="inline-flex min-h-[32px] items-center gap-1.5 rounded-lg border border-border px-2.5 text-xs text-foreground transition-colors duration-150 hover:border-orange-500 hover:text-orange-400 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {busy ? <Loader2 className="h-3 w-3 animate-spin" aria-hidden="true" /> : null}
        {t("remove")}
      </button>
      {error ? <p className="text-xs text-red-400">{error}</p> : null}
    </div>
  );
}
