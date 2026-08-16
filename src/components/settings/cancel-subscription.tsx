"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations, useLocale } from "next-intl";
import { useToast } from "@/components/toast/toast-context";
import { formatDateTime } from "@/lib/format-number";

/** The four options. Free text is separate and also optional. */
const REASONS = ["too_expensive", "missing_feature", "not_using", "found_alternative"] as const;
const MAX_NOTE_LENGTH = 1000;

/**
 * Cancelling, in one click and one confirmation.
 *
 * WHAT THIS DELIBERATELY DOES NOT DO:
 *  - hide the button behind "Manage billing" on Stripe's hosted portal
 *  - ask "are you sure?" more than once
 *  - require the survey, or gate the Cancel button behind answering it
 *  - end access immediately
 *
 * The panel states four things BEFORE the user commits, because they are
 * the four things people are actually afraid of: when access ends, what
 * happens to credits they have already paid for, whether their data is
 * deleted, and whether this is reversible. Answering them up front is what
 * makes one confirmation enough.
 */
export function CancelSubscription({ endsAt }: { endsAt: string | null }) {
  const t = useTranslations("settings.billing.cancel");
  const tCommon = useTranslations("common");
  const locale = useLocale();
  const router = useRouter();
  const { addToast } = useToast();

  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function confirm() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/billing/cancel", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        // Both fields are optional; sending neither is the skipped case.
        body: JSON.stringify({ reason, note: note.trim() || undefined }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        setError(data.error ?? tCommon("networkError"));
        return;
      }
      setOpen(false);
      addToast(t("done"));
      router.refresh();
    } catch {
      setError(tCommon("networkError"));
    } finally {
      setLoading(false);
    }
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex min-h-[40px] items-center justify-center rounded-lg border border-border px-4 py-2 text-sm text-muted transition-colors duration-150 hover:border-red-800 hover:text-red-400"
      >
        {t("button")}
      </button>
    );
  }

  return (
    <div className="w-full rounded-xl border border-border bg-input p-4">
      <h3 className="text-sm font-semibold text-foreground">{t("title")}</h3>

      {/* The four facts, before the decision. */}
      <ul className="mt-3 space-y-1.5 text-xs leading-relaxed text-muted">
        <li>
          {endsAt
            ? t("keepsAccessUntil", { date: formatDateTime(endsAt, locale) })
            : t("keepsAccessUntilPeriodEnd")}
        </li>
        <li>{t("creditsStay")}</li>
        <li>{t("dataKept")}</li>
        <li>{t("reversible")}</li>
      </ul>

      {/* OPTIONAL. No default selection, no required attribute, and the
          confirm button below never checks it. */}
      <fieldset className="mt-4">
        <legend className="text-xs text-muted">{t("surveyQuestion")}</legend>
        <div className="mt-2 flex flex-wrap gap-1.5">
          {REASONS.map((value) => (
            <button
              key={value}
              type="button"
              aria-pressed={reason === value}
              onClick={() => setReason((r) => (r === value ? null : value))}
              className={`min-h-[32px] rounded-full border px-3 py-1 text-xs transition-colors duration-150 ${
                reason === value
                  ? "border-orange-500/60 bg-orange-500/10 text-orange-400"
                  : "border-border text-muted hover:border-orange-500/40 hover:text-foreground"
              }`}
            >
              {t(`reasons.${value}`)}
            </button>
          ))}
        </div>
        <textarea
          value={note}
          onChange={(e) => setNote(e.target.value.slice(0, MAX_NOTE_LENGTH))}
          maxLength={MAX_NOTE_LENGTH}
          rows={2}
          placeholder={t("notePlaceholder")}
          className="input mt-2 min-h-16 resize-y text-xs"
        />
      </fieldset>

      {error && <p className="mt-3 text-xs text-red-400">{error}</p>}

      <div className="mt-4 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={confirm}
          disabled={loading}
          className="inline-flex min-h-[40px] items-center justify-center rounded-lg border border-red-800 bg-red-950/40 px-4 py-2 text-sm font-medium text-red-300 transition-colors duration-150 hover:bg-red-950/70 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {loading ? tCommon("loading") : t("confirm")}
        </button>
        <button
          type="button"
          onClick={() => setOpen(false)}
          disabled={loading}
          className="inline-flex min-h-[40px] items-center justify-center rounded-lg border border-border px-4 py-2 text-sm text-muted transition-colors duration-150 hover:text-foreground disabled:opacity-50"
        >
          {t("keepIt")}
        </button>
      </div>
    </div>
  );
}
