"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { BadgeCheck, Check, Loader2, Sparkles } from "lucide-react";
import { useToast } from "@/components/toast/toast-context";
import { useCredits } from "@/components/credits/credits-context";
import { formatDate, formatNumber } from "@/lib/format-number";
import { getErrorMessage } from "@/lib/get-error-message";
import type { SiteBadgeState } from "@/components/publishing/published-sites-list";

/**
 * Buying and cancelling badge removal for ONE published site (V4 #25).
 *
 * Four states, and each one says what is actually true right now rather
 * than what the user bought at some point in the past:
 *
 *   included in plan — nothing to buy. No button, because offering one
 *     would invite a charge for something already paid for monthly.
 *   paid             — shows the real expiry date and how many days are
 *     left, plus whether it renews on its own.
 *   lapsed           — says the badge is BACK, not "expired". The user
 *     cares about what their page looks like, not about a column.
 *   never purchased  — the offer.
 */
export function BadgeControl({
  siteId,
  badge,
  credits,
}: {
  siteId: string;
  badge: SiteBadgeState;
  credits: number;
}) {
  const t = useTranslations("dashboard.publishing.badge");
  const locale = useLocale();
  const router = useRouter();
  const { addToast } = useToast();
  const { refresh } = useCredits();

  const [busy, setBusy] = useState<"buy" | "cancel" | null>(null);

  const buy = async () => {
    if (busy) return;
    setBusy("buy");
    try {
      const res = await fetch(`/api/published/${siteId}/badge-removal`, { method: "POST" });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.ok) {
        addToast(typeof data?.error === "string" ? data.error : t("buyError"), "error");
      } else {
        addToast(t("bought"));
        void refresh();
        router.refresh();
      }
    } catch (err) {
      addToast(getErrorMessage(err, t("buyError")), "error");
    }
    setBusy(null);
  };

  const cancelRenewal = async () => {
    if (busy) return;
    if (!window.confirm(t("confirmCancel"))) return;
    setBusy("cancel");
    try {
      const res = await fetch(`/api/published/${siteId}/badge-removal`, { method: "DELETE" });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.ok) {
        addToast(typeof data?.error === "string" ? data.error : t("cancelError"), "error");
      } else {
        addToast(t("cancelled"));
        router.refresh();
      }
    } catch (err) {
      addToast(getErrorMessage(err, t("cancelError")), "error");
    }
    setBusy(null);
  };

  if (badge.includedInPlan) {
    return (
      <div className="flex items-start gap-2 rounded-xl border border-border bg-input/40 p-3">
        <BadgeCheck className="mt-0.5 h-4 w-4 shrink-0 text-emerald-400" aria-hidden="true" />
        <div className="min-w-0">
          <p className="text-xs font-semibold text-foreground">{t("includedTitle")}</p>
          <p className="mt-0.5 text-[11px] leading-relaxed text-muted">{t("includedHint")}</p>
        </div>
      </div>
    );
  }

  const price = formatNumber(credits, locale);
  const until = badge.paidUntil ? formatDate(badge.paidUntil, locale) : "";

  return (
    <div className="space-y-2.5 rounded-xl border border-border bg-input/40 p-3">
      <div className="flex items-start gap-2">
        <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-orange-400" aria-hidden="true" />
        <div className="min-w-0">
          <p className="text-xs font-semibold text-foreground">
            {badge.showBadge ? t("visibleTitle") : t("removedTitle")}
          </p>
          <p className="mt-0.5 text-[11px] leading-relaxed text-muted" suppressHydrationWarning>
            {badge.reason === "paid"
              ? badge.autoRenew
                ? t("paidRenewing", { date: until, days: badge.daysRemaining ?? 0, credits: price })
                : t("paidEnding", { date: until, days: badge.daysRemaining ?? 0 })
              : badge.reason === "lapsed"
                ? t("lapsedHint", { date: until })
                : t("offerHint", { credits: price })}
          </p>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={buy}
          disabled={busy !== null}
          className="inline-flex min-h-[36px] items-center gap-2 rounded-xl border border-border px-4 text-xs font-semibold text-foreground transition-colors hover:border-orange-500 hover:text-orange-400 disabled:opacity-40"
        >
          {busy === "buy" ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
          ) : (
            <Check className="h-3.5 w-3.5" aria-hidden="true" />
          )}
          {badge.reason === "paid" ? t("extendButton", { credits: price }) : t("buyButton", { credits: price })}
        </button>

        {badge.reason === "paid" && badge.autoRenew ? (
          <button
            type="button"
            onClick={cancelRenewal}
            disabled={busy !== null}
            className="text-[11px] text-muted underline-offset-2 transition-colors hover:text-foreground hover:underline disabled:opacity-40"
          >
            {t("cancelRenewal")}
          </button>
        ) : null}
      </div>
    </div>
  );
}
