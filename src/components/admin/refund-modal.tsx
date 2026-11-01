"use client";

import { useState, useEffect } from "react";
import { useTranslations } from "next-intl";

type Charge = {
  id: string;
  paymentIntentId: string | null;
  amount: number;
  currency: string;
  status: string;
  refunded: boolean;
  amountRefunded: number;
  created: number;
  description: string | null;
};

type Props = {
  userId: string;
  email: string;
  onClose: () => void;
  onDone: () => void;
};

export function RefundModal({ userId, email, onClose, onDone }: Props) {
  const t = useTranslations("adminDashboard.refund");
  const [charges, setCharges] = useState<Charge[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Charge | null>(null);
  const [reason, setReason] = useState("");
  const [partial, setPartial] = useState(false);
  const [amountCents, setAmountCents] = useState("");
  const [confirming, setConfirming] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch(`/api/admin/refund?userId=${encodeURIComponent(userId)}`);
        if (!res.ok) return;
        const data = await res.json();
        setCharges(data.charges ?? []);
      } finally {
        setLoading(false);
      }
    })();
  }, [userId]);

  function formatAmount(cents: number, currency: string) {
    return new Intl.NumberFormat("en", {
      style: "currency",
      currency: currency.toUpperCase(),
    }).format(cents / 100);
  }

  async function handleRefund() {
    if (!selected?.paymentIntentId) return;
    setSubmitting(true);
    setError(null);
    try {
      const body: Record<string, unknown> = {
        paymentIntentId: selected.paymentIntentId,
        reason: reason.trim(),
        userId,
      };
      if (partial && amountCents) {
        body.amountCents = Number(amountCents);
      }
      const res = await fetch("/api/admin/refund", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.message ?? data.code ?? "failed");
        return;
      }
      onDone();
    } catch {
      setError("network");
    } finally {
      setSubmitting(false);
    }
  }

  const refundableAmount = selected
    ? selected.amount - selected.amountRefunded
    : 0;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={onClose}>
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-lg rounded-lg border border-border bg-surface p-6 shadow-xl"
      >
        <h3 className="text-base font-semibold text-foreground">{t("title")}</h3>
        <p className="mt-1 text-xs text-muted">{email}</p>

        {loading ? (
          <p className="py-6 text-center text-sm text-muted">{t("loadingCharges")}</p>
        ) : charges.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted">{t("noCharges")}</p>
        ) : !confirming ? (
          <div className="mt-4 max-h-64 space-y-2 overflow-y-auto">
            {charges.map((c) => {
              const refundable = c.amount - c.amountRefunded;
              const canRefund =
                c.status === "succeeded" && !c.refunded && refundable > 0 && c.paymentIntentId;
              return (
                <button
                  key={c.id}
                  disabled={!canRefund}
                  onClick={() => {
                    setSelected(c);
                    setConfirming(true);
                  }}
                  className={`flex w-full items-center justify-between rounded-item border px-3 py-2 text-left text-sm ${
                    canRefund
                      ? "border-border hover:bg-surface-hover"
                      : "border-border/50 opacity-50"
                  }`}
                >
                  <div>
                    <span className="font-mono text-xs">
                      {formatAmount(c.amount, c.currency)}
                    </span>
                    {c.amountRefunded > 0 && (
                      <span className="ml-2 text-xs text-muted">
                        ({t("refundedPartial", { amount: formatAmount(c.amountRefunded, c.currency) })})
                      </span>
                    )}
                    <span className="ml-2 text-xs text-muted">
                      {new Date(c.created * 1000).toLocaleDateString()}
                    </span>
                  </div>
                  <div className="text-xs">
                    {c.refunded ? (
                      <span className="text-muted">{t("alreadyRefunded")}</span>
                    ) : canRefund ? (
                      <span className="text-foreground">{t("selectBtn")}</span>
                    ) : null}
                  </div>
                </button>
              );
            })}
          </div>
        ) : (
          <div className="mt-4 space-y-3">
            <div className="rounded-item border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-900 dark:border-amber-700 dark:bg-amber-900/20 dark:text-amber-300">
              {t("confirmWarning")}
            </div>

            <p className="text-sm text-foreground">
              {t("chargeAmount")}: <strong>{selected && formatAmount(selected.amount, selected.currency)}</strong>
            </p>
            {refundableAmount < (selected?.amount ?? 0) && (
              <p className="text-xs text-muted">
                {t("refundableAmount")}: {selected && formatAmount(refundableAmount, selected.currency)}
              </p>
            )}

            <label className="flex items-center gap-2 text-xs text-foreground">
              <input
                type="checkbox"
                checked={partial}
                onChange={(e) => setPartial(e.target.checked)}
              />
              {t("partialRefund")}
            </label>

            {partial && (
              <label className="block text-xs font-medium text-foreground">
                {t("refundAmount")}
                <input
                  type="number"
                  step="1"
                  min="1"
                  max={refundableAmount}
                  value={amountCents}
                  onChange={(e) => setAmountCents(e.target.value)}
                  className="mt-1 w-full rounded-item border border-border bg-surface px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-foreground/20"
                  placeholder={t("amountPlaceholder", { max: String(refundableAmount) })}
                />
              </label>
            )}

            <label className="block text-xs font-medium text-foreground">
              {t("reason")}
              <textarea
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                rows={2}
                className="mt-1 w-full rounded-item border border-border bg-surface px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-foreground/20"
                placeholder={t("reasonPlaceholder")}
                required
                minLength={3}
              />
            </label>

            {error && <p className="text-xs text-red-600 dark:text-red-400">{error}</p>}

            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => {
                  setConfirming(false);
                  setSelected(null);
                  setReason("");
                  setPartial(false);
                  setAmountCents("");
                  setError(null);
                }}
                className="rounded-item border border-border px-3 py-1.5 text-xs text-muted hover:bg-surface-hover"
              >
                {t("back")}
              </button>
              <button
                type="button"
                onClick={handleRefund}
                disabled={submitting || reason.trim().length < 3 || (partial && !amountCents)}
                className="rounded-item bg-red-600 px-3 py-1.5 text-xs text-white disabled:opacity-40 dark:bg-red-700"
              >
                {submitting ? t("processing") : t("confirmRefund")}
              </button>
            </div>
          </div>
        )}

        {!confirming && (
          <div className="mt-4 flex justify-end">
            <button
              type="button"
              onClick={onClose}
              className="rounded-item border border-border px-3 py-1.5 text-xs text-muted hover:bg-surface-hover"
            >
              {t("close")}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
