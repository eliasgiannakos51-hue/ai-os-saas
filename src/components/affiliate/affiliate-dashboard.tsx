"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Copy, Check, Share2, Wallet, AlertTriangle } from "lucide-react";
import { useToast } from "@/components/toast/toast-context";
import { getErrorMessage } from "@/lib/get-error-message";
import { formatCents } from "@/lib/affiliate/rules";
import type { AffiliateStats } from "@/lib/affiliate/store";

/**
 * The affiliate's own view of the programme.
 *
 * WHAT IT DOES NOT SHOW, deliberately: who the referred people are. The
 * row-level policy on affiliate_referrals lets an affiliate read their own
 * referral rows, and those rows contain a uuid and nothing else — no
 * email, no name, no plan. Somebody signing up should not have their
 * identity handed to whoever's link they clicked, and a dashboard that
 * showed it would make that a product feature rather than a leak.
 *
 * What it does show is every number that decides whether they get paid:
 * how many signed up, how many started paying, what is owed, what has been
 * sent, and — the one people actually ask about — why a payout has not
 * happened yet.
 */
export function AffiliateDashboard({
  code,
  status,
  rate,
  hasConnectAccount,
  payoutsEnabled,
  connectAvailable,
  stats,
  siteUrl,
  commissionMonths,
  minPayoutCents,
}: {
  code: string | null;
  status: "active" | "suspended" | null;
  rate: number | null;
  hasConnectAccount: boolean;
  payoutsEnabled: boolean;
  connectAvailable: boolean;
  stats: AffiliateStats | null;
  siteUrl: string;
  commissionMonths: number;
  minPayoutCents: number;
}) {
  const t = useTranslations("dashboard.affiliate");
  const router = useRouter();
  const { addToast } = useToast();
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);

  const link = code ? `${siteUrl.replace(/\/+$/, "")}/r/${code}` : null;

  async function join() {
    setBusy(true);
    try {
      const response = await fetch("/api/affiliate", { method: "POST" });
      const data = await response.json();
      if (!data.ok) {
        addToast(data.error ?? t("joinError"), "error");
        return;
      }
      router.refresh();
    } catch (err) {
      addToast(getErrorMessage(err, t("joinError")), "error");
    } finally {
      setBusy(false);
    }
  }

  async function setUpPayouts() {
    setBusy(true);
    try {
      const response = await fetch("/api/affiliate/connect", { method: "POST" });
      const data = await response.json();
      if (!data.ok) {
        addToast(data.error ?? t("connectError"), "error");
        return;
      }
      // A full navigation: the destination is Stripe's own domain.
      window.location.href = data.url;
    } catch (err) {
      addToast(getErrorMessage(err, t("connectError")), "error");
      setBusy(false);
    }
  }

  async function copyLink() {
    if (!link) return;
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard blocked (an insecure origin, a locked-down browser). The
      // link is selectable text on screen either way, so this is not worth
      // an error toast.
    }
  }

  if (!code) {
    return (
      <div className="space-y-4 rounded-2xl border border-border bg-panel p-6 text-center">
        <Share2 className="mx-auto h-6 w-6 text-orange-400" aria-hidden="true" />
        <p className="text-sm leading-relaxed text-foreground">
          {t("pitch", { percent: Math.round((rate ?? 0.25) * 100), months: commissionMonths })}
        </p>
        <p className="text-xs leading-relaxed text-muted">{t("pitchTerms")}</p>
        <button
          type="button"
          onClick={() => void join()}
          disabled={busy}
          className="cta-amber inline-flex min-h-[44px] items-center justify-center rounded-xl px-6 py-2.5 text-sm font-semibold text-black disabled:opacity-60 sm:min-h-0"
        >
          {busy ? t("joining") : t("join")}
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {status === "suspended" && (
        <p className="flex items-start gap-2 rounded-xl border border-red-900 bg-red-950/30 px-4 py-3 text-xs leading-relaxed text-red-400">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          {t("suspended")}
        </p>
      )}

      <div className="space-y-3 rounded-2xl border border-border bg-panel p-5">
        <h2 className="text-sm font-semibold text-foreground">{t("yourLink")}</h2>
        <div className="flex flex-wrap items-center gap-2">
          <code className="min-w-0 flex-1 break-all rounded-lg border border-border bg-input px-3 py-2 font-mono text-xs text-foreground">
            {link}
          </code>
          <button
            type="button"
            onClick={() => void copyLink()}
            className="inline-flex min-h-[40px] shrink-0 items-center gap-1.5 rounded-lg border border-border px-3 py-2 text-xs font-medium text-foreground transition-colors duration-150 hover:border-orange-500/50 sm:min-h-0"
          >
            {copied ? (
              <Check className="h-3.5 w-3.5 text-emerald-400" aria-hidden="true" />
            ) : (
              <Copy className="h-3.5 w-3.5" aria-hidden="true" />
            )}
            {copied ? t("copied") : t("copy")}
          </button>
        </div>
        <p className="text-xs leading-relaxed text-muted">
          {t("terms", { percent: Math.round((rate ?? 0.25) * 100), months: commissionMonths })}
        </p>
      </div>

      <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          { key: "signups", value: String(stats?.referrals ?? 0) },
          { key: "paying", value: String(stats?.converted ?? 0) },
          { key: "owed", value: formatCents(stats?.accruedCents ?? 0) },
          { key: "paidOut", value: formatCents(stats?.paidCents ?? 0) },
        ].map((stat) => (
          <div key={stat.key} className="rounded-2xl border border-border bg-panel p-4">
            <dt className="text-[11px] uppercase tracking-wide text-muted">{t(`stat.${stat.key}`)}</dt>
            <dd className="mt-1 text-xl font-bold tabular-nums text-foreground">{stat.value}</dd>
          </div>
        ))}
      </dl>

      <div className="space-y-3 rounded-2xl border border-border bg-panel p-5">
        <h2 className="flex items-center gap-2 text-sm font-semibold text-foreground">
          <Wallet className="h-4 w-4 text-orange-400" aria-hidden="true" /> {t("payouts")}
        </h2>

        {!connectAvailable ? (
          <p className="text-xs leading-relaxed text-muted">{t("payoutsUnavailable")}</p>
        ) : payoutsEnabled ? (
          // The one thing people actually want to know, said plainly: when.
          <p className="text-xs leading-relaxed text-muted">
            {t("payoutsReady", { minimum: formatCents(minPayoutCents) })}
          </p>
        ) : (
          <>
            <p className="text-xs leading-relaxed text-muted">
              {hasConnectAccount ? t("payoutsIncomplete") : t("payoutsNotSetUp")}
            </p>
            <button
              type="button"
              onClick={() => void setUpPayouts()}
              disabled={busy || status === "suspended"}
              className="inline-flex min-h-[40px] items-center justify-center rounded-lg bg-orange-500 px-4 py-2 text-xs font-semibold text-black transition-opacity duration-150 hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60 sm:min-h-0"
            >
              {busy ? t("opening") : hasConnectAccount ? t("finishSetup") : t("setUpPayouts")}
            </button>
          </>
        )}
      </div>

      <p className="text-[11px] leading-relaxed text-muted">{t("rules")}</p>
    </div>
  );
}
