"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";

type Props = {
  userId: string;
  email: string;
  isSuspended: boolean;
  onClose: () => void;
  onDone: () => void;
};

export function SuspendModal({ userId, email, isSuspended, onClose, onDone }: Props) {
  const t = useTranslations("adminDashboard.suspend");
  const [reason, setReason] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit() {
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/suspend", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId,
          action: isSuspended ? "unsuspend" : "suspend",
          reason: reason.trim(),
        }),
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
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-md rounded-lg border border-border bg-surface p-6 shadow-xl"
      >
        <h3 className="text-base font-semibold text-foreground">
          {isSuspended ? t("unsuspendTitle") : t("suspendTitle")}
        </h3>
        <p className="mt-1 text-xs text-muted">{email}</p>

        {!isSuspended && (
          <div className="mt-4 rounded-item border border-red-300 bg-red-50 px-3 py-2 text-xs text-red-900 dark:border-red-700 dark:bg-red-900/20 dark:text-red-300">
            {t("suspendWarning")}
          </div>
        )}

        {isSuspended ? (
          <p className="mt-4 text-sm text-foreground">{t("unsuspendConfirm")}</p>
        ) : (
          <label className="mt-4 block text-xs font-medium text-foreground">
            {t("reason")}
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={3}
              className="mt-1 w-full rounded-item border border-border bg-surface px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-foreground/20"
              placeholder={t("reasonPlaceholder")}
              required
              minLength={3}
            />
          </label>
        )}

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
            type="button"
            onClick={handleSubmit}
            disabled={submitting || (!isSuspended && reason.trim().length < 3)}
            className={`rounded-item px-3 py-1.5 text-xs text-white disabled:opacity-40 ${
              isSuspended
                ? "bg-green-600 dark:bg-green-700"
                : "bg-red-600 dark:bg-red-700"
            }`}
          >
            {submitting
              ? t("processing")
              : isSuspended
                ? t("unsuspendBtn")
                : t("suspendBtn")}
          </button>
        </div>
      </div>
    </div>
  );
}
