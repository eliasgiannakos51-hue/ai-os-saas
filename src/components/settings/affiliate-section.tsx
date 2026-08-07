"use client";

import { useCallback, useEffect, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Loader2, Users } from "lucide-react";
import { useToast } from "@/components/toast/toast-context";
import { formatCents } from "@/lib/marketplace/marketplace-config";

type Data = {
  account: { code: string; status: string } | null;
  percent: number;
  commissionMonths: number;
  totals: { referrals: number; converted: number; totalCents: number; unpaidCents: number };
};

/**
 * The affiliate programme, in Settings.
 *
 * Loaded on mount rather than server-rendered into the page, because
 * Settings is already a large server component and most people will
 * never open this section. The cost of one extra request for the people
 * who do is smaller than the cost of three more queries on every
 * Settings load for everyone.
 *
 * What it deliberately shows: earned AND unpaid separately. A single
 * "earned" figure invites the reading that the money has arrived, and
 * payouts are not switched on yet — saying so plainly is better than a
 * number somebody discovers is not in their bank account.
 */
export function AffiliateSection() {
  const t = useTranslations("settings.affiliate");
  const locale = useLocale();
  const { addToast } = useToast();

  const [data, setData] = useState<Data | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/affiliate");
      const body = await res.json().catch(() => null);
      if (res.ok && body?.ok) setData(body);
    } catch {
      // Silent. This is a secondary panel; a failed load shows the join
      // state, which is recoverable by pressing the button.
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function join() {
    setBusy(true);
    try {
      const res = await fetch("/api/affiliate", { method: "POST" });
      const body = await res.json().catch(() => null);
      if (!res.ok || !body?.ok) {
        addToast(body?.error || t("joinFailed"), "error");
        return;
      }
      await load();
    } catch {
      addToast(t("joinFailed"), "error");
    } finally {
      setBusy(false);
    }
  }

  const link =
    data?.account && typeof window !== "undefined"
      ? `${window.location.origin}/?ref=${data.account.code}`
      : "";

  return (
    <section className="space-y-3 rounded-2xl border border-border bg-panel/60 p-4">
      <h2 className="flex items-center gap-2 text-sm font-medium">
        <Users className="h-4 w-4" aria-hidden="true" />
        {t("title")}
      </h2>

      <p className="text-xs leading-relaxed text-muted">
        {t("description", {
          percent: data?.percent ?? 25,
          months: data?.commissionMonths ?? 12,
        })}
      </p>

      {!data?.account ? (
        <button type="button" className="btn-primary" onClick={() => void join()} disabled={busy}>
          {busy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : null}
          {t("join")}
        </button>
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-2 rounded-xl border border-border p-3">
            <code className="flex-1 truncate text-[11px] text-muted">{link}</code>
            <button
              type="button"
              className="btn-secondary"
              onClick={() => {
                void navigator.clipboard?.writeText(link);
                addToast(t("copied"), "success");
              }}
            >
              {t("copy")}
            </button>
          </div>

          <dl className="grid gap-3 sm:grid-cols-4">
            <Stat label={t("statReferrals")} value={String(data.totals.referrals)} />
            <Stat label={t("statConverted")} value={String(data.totals.converted)} />
            <Stat label={t("statEarned")} value={formatCents(data.totals.totalCents, locale)} />
            <Stat label={t("statUnpaid")} value={formatCents(data.totals.unpaidCents, locale)} />
          </dl>

          {/* Said plainly rather than left to be discovered. Commissions
              accrue because they are owed; sending the money needs the
              same Stripe Connect account the marketplace is waiting on. */}
          <p className="text-[11px] leading-relaxed text-muted">{t("payoutNote")}</p>
        </>
      )}
    </section>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-border p-3">
      <dt className="text-[11px] text-muted">{label}</dt>
      <dd className="text-lg font-semibold">{value}</dd>
    </div>
  );
}
