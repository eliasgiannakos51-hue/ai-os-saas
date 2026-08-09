"use client";

import { useState } from "react";
import { useTranslations, useLocale } from "next-intl";
import { CURRENCY_SYMBOL } from "@/lib/billing/plans";
import { formatNumber } from "@/lib/format-number";
import type { CreditShortfall } from "@/lib/billing/shortfall";

// The panel that replaces "Not enough credits. Upgrade your plan or
// purchase more credits."
//
// Three options, in the order they cost the user money: the free one
// first. The free one is only rendered when the server actually worked
// out that a simpler request would fit — never as generic advice, because
// "try something smaller" when nothing smaller fits is the same dead end
// with extra steps.

type Props = {
  shortfall: CreditShortfall;
  /** Called when the user takes the "I'll shorten it" option — the caller
   *  puts the cursor back where the text is. Nothing is rewritten for
   *  them: it is their description. */
  onSimplify?: () => void;
  /** Rendered as the last resort when even the floor does not fit. */
  onDismiss?: () => void;
};

export function CreditShortfallPanel({ shortfall, onSimplify, onDismiss }: Props) {
  const t = useTranslations("creditShortfall");
  const tCommon = useTranslations("common");
  const locale = useLocale();
  const [buying, setBuying] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const n = (value: number) => formatNumber(value, locale);

  async function buyPack(packId: string) {
    setBuying(true);
    setError(null);
    try {
      const res = await fetch("/api/credits/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ packId }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok || !data.url) {
        setError(data?.error ?? t("checkoutFailed"));
        setBuying(false);
        return;
      }
      window.location.href = data.url as string;
    } catch {
      setError(tCommon("networkError"));
      setBuying(false);
    }
  }

  const optionClass =
    "flex w-full flex-col gap-1 rounded-xl border border-border px-4 py-3 text-left transition-colors duration-150 hover:border-orange-500 disabled:cursor-not-allowed disabled:opacity-60";

  return (
    <div
      role="group"
      aria-label={t("title")}
      data-testid="credit-shortfall"
      className="space-y-3 rounded-2xl border border-amber-500/40 bg-amber-500/[0.05] p-4"
    >
      <div>
        <h3 className="text-sm font-semibold text-foreground">{t("title")}</h3>
        <p className="mt-1 text-xs leading-relaxed text-muted" data-testid="credit-shortfall-summary">
          {t("summary", { needed: n(shortfall.needed), available: n(shortfall.available) })}
        </p>
      </div>

      <div className="space-y-2">
        {shortfall.simpler ? (
          <button type="button" onClick={onSimplify} className={optionClass} data-testid="shortfall-simplify">
            <span className="text-xs font-semibold text-emerald-400">{t("simplerTitle")}</span>
            <span className="text-xs leading-relaxed text-muted">
              {shortfall.simpler.dropImages
                ? t("simplerBodyNoImages", {
                    chars: n(shortfall.simpler.inputChars),
                    credits: n(shortfall.simpler.credits),
                  })
                : t("simplerBody", {
                    percent: shortfall.simpler.shrinkPercent,
                    chars: n(shortfall.simpler.inputChars),
                    credits: n(shortfall.simpler.credits),
                  })}
            </span>
          </button>
        ) : (
          <p className="rounded-xl border border-border px-4 py-3 text-xs leading-relaxed text-muted" data-testid="shortfall-no-simpler">
            {t("noSimplerOption", { floor: n(shortfall.floorCredits) })}
          </p>
        )}

        {shortfall.pack && (
          <button
            type="button"
            onClick={() => buyPack(shortfall.pack!.id)}
            disabled={buying}
            className={optionClass}
            data-testid="shortfall-pack"
          >
            <span className="text-xs font-semibold text-foreground">
              {t("packTitle", {
                credits: n(shortfall.pack.credits),
                price: `${CURRENCY_SYMBOL}${shortfall.pack.price}`,
              })}
            </span>
            <span className="text-xs leading-relaxed text-muted">
              {buying
                ? tCommon("loading")
                : t("packBody", { credits: n(shortfall.pack.creditsAfterPurchase) })}
            </span>
          </button>
        )}

        {shortfall.upgrade && (
          <a href="/pricing" className={optionClass} data-testid="shortfall-upgrade">
            <span className="text-xs font-semibold text-foreground">
              {t("upgradeTitle", {
                plan: shortfall.upgrade.name,
                price: `${CURRENCY_SYMBOL}${shortfall.upgrade.price}`,
              })}
            </span>
            <span className="text-xs leading-relaxed text-muted">
              {t("upgradeBody", {
                monthly: n(shortfall.upgrade.monthlyCredits),
                credits: n(shortfall.upgrade.creditsOnPlan),
              })}
            </span>
          </a>
        )}
      </div>

      {error && (
        <p className="rounded-lg border border-red-900 bg-red-950/40 px-3 py-2 text-xs text-red-400">{error}</p>
      )}

      {onDismiss && (
        <button
          type="button"
          onClick={onDismiss}
          className="text-xs text-muted underline underline-offset-2 transition-colors duration-150 hover:text-foreground"
        >
          {tCommon("cancel")}
        </button>
      )}
    </div>
  );
}
