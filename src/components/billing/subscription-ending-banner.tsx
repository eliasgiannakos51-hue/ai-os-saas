"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Clock } from "lucide-react";
import { useToast } from "@/components/toast/toast-context";

/**
 * "Your subscription ends in X days. Restore it?"
 *
 * NOT DISMISSIBLE, and that is the one place this feature is deliberately
 * insistent — in the user's favour. Everything else about cancelling is
 * one click; this is the only signal that a paid account is about to lose
 * its plan, and someone who cancelled by accident (or forgot) has exactly
 * one chance to notice. It disappears on its own the moment they restore.
 */
export function SubscriptionEndingBanner({ daysLeft }: { daysLeft: number }) {
  const t = useTranslations("settings.billing.cancel");
  const tCommon = useTranslations("common");
  const router = useRouter();
  const { addToast } = useToast();
  const [loading, setLoading] = useState(false);

  async function resume() {
    setLoading(true);
    try {
      const res = await fetch("/api/billing/resume", { method: "POST" });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        addToast(`✗ ${data.error ?? tCommon("networkError")}`, "error");
        return;
      }
      addToast(t("restored"));
      router.refresh();
    } catch {
      addToast(`✗ ${tCommon("networkError")}`, "error");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-orange-900/60 bg-orange-500/5 px-4 py-3">
      <p className="flex items-center gap-2 text-xs text-orange-300">
        <Clock className="h-4 w-4 shrink-0" aria-hidden="true" />
        {t("endingIn", { days: daysLeft })}
      </p>
      <button
        type="button"
        onClick={resume}
        disabled={loading}
        className="inline-flex min-h-[36px] shrink-0 items-center justify-center rounded-lg bg-orange-500 px-4 py-1.5 text-xs font-semibold text-black transition-all duration-200 hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50 sm:min-h-0"
      >
        {loading ? tCommon("loading") : t("restore")}
      </button>
    </div>
  );
}
