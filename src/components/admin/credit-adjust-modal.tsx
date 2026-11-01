"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";

type Props = {
  userId: string;
  email: string;
  creditsRemaining: number;
  onClose: () => void;
  onDone: () => void;
};

export function CreditAdjustModal({ userId, email, creditsRemaining, onClose, onDone }: Props) {
  const t = useTranslations("adminDashboard.creditAdjust");
  const [amount, setAmount] = useState("");
  const [reason, setReason] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const num = Number(amount);
    if (!num || !Number.isFinite(num)) return;
    if (reason.trim().length < 3) return;

    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/users/credits", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId, amount: num, reason: reason.trim() }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.code ?? "failed");
        return;
      }
      onDone();
    } catch {
      setError("network");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={onClose}>
      <form
        onClick={(e) => e.stopPropagation()}
        onSubmit={handleSubmit}
        className="w-full max-w-md rounded-lg border border-border bg-surface p-6 shadow-xl"
      >
        <h3 className="text-base font-semibold text-foreground">{t("title")}</h3>
        <p className="mt-1 text-xs text-muted">{email}</p>
        <p className="mt-1 text-xs text-muted">
          {t("current")}: {creditsRemaining}
        </p>

        <label className="mt-4 block text-xs font-medium text-foreground">
          {t("amount")}
          <input
            type="number"
            step="1"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            className="mt-1 w-full rounded-item border border-border bg-surface px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-foreground/20"
            placeholder={t("amountPlaceholder")}
            required
          />
        </label>

        <label className="mt-3 block text-xs font-medium text-foreground">
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

        {error && <p className="mt-2 text-xs text-red-600 dark:text-red-400">{error}</p>}

        <div className="mt-4 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-item border border-border px-3 py-1.5 text-xs text-muted hover:bg-surface-hover"
          >
            {t("cancel")}
          </button>
          <button
            type="submit"
            disabled={submitting || !amount || !reason.trim()}
            className="rounded-item bg-foreground px-3 py-1.5 text-xs text-background disabled:opacity-40"
          >
            {submitting ? t("submitting") : t("confirm")}
          </button>
        </div>
      </form>
    </div>
  );
}
