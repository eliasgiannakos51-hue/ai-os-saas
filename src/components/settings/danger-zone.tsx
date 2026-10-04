"use client";

import { useState, type FormEvent } from "react";
import { useTranslations } from "next-intl";
import { AlertTriangle, Trash2, MailCheck } from "lucide-react";
import { useToast } from "@/components/toast/toast-context";
import { getErrorMessage } from "@/lib/get-error-message";

export function DangerZone({ email }: { email: string }) {
  const t = useTranslations("settings.dangerZone");
  const tCommon = useTranslations("common");
  const { addToast } = useToast();

  const [open, setOpen] = useState(false);
  const [confirmEmail, setConfirmEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [requested, setRequested] = useState(false);

  const confirmed = confirmEmail.trim().toLowerCase() === email.toLowerCase();

  function cancel() {
    setOpen(false);
    setConfirmEmail("");
    setError(null);
  }

  async function handleDelete(e: FormEvent) {
    e.preventDefault();
    setError(null);

    if (!confirmed) {
      setError(t("emailDoesNotMatch"));
      return;
    }

    setLoading(true);
    try {
      const res = await fetch("/api/delete-account/request", { method: "POST" });
      const data = await res.json();

      if (!res.ok || !data.ok) {
        setError(getErrorMessage(data.error, "Failed to start account deletion."));
        addToast(t("couldNotStartDeletion"), "error");
        return;
      }

      setRequested(true);
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error("Delete account request threw:", err);
      setError(getErrorMessage(err, t("failed")));
      addToast(t("couldNotStartDeletion"), "error");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="rounded-card border border-danger/40 bg-danger/[0.03] p-5">
      <h2 className="flex items-center gap-2 text-sm font-semibold text-danger">
        <AlertTriangle className="h-4 w-4" /> {t("title")}
      </h2>
      <p className="mt-2 text-xs text-muted">{t("description")}</p>

      {requested ? (
        <p className="mt-4 flex items-start gap-2 rounded-item border border-success/40 bg-success/10 px-3 py-2.5 text-xs text-success">
          <MailCheck className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          {t.rich("checkEmail", {
            highlight: (chunks) => <span className="text-success">{chunks}</span>,
            email,
          })}
        </p>
      ) : !open ? (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="mt-4 inline-flex min-h-[44px] items-center justify-center gap-1.5 rounded-item border border-danger/40 px-4 py-2 text-sm text-danger transition-colors duration-150 hover:border-danger hover:bg-danger/10"
        >
          <Trash2 className="h-4 w-4" /> {t("deleteAccount")}
        </button>
      ) : (
        <form onSubmit={handleDelete} className="mt-4 space-y-3">
          <label className="block text-xs text-muted">
            <span className="mb-1 block">
              {t.rich("typeToConfirm", {
                highlight: (chunks) => <span className="text-danger">{chunks}</span>,
                email,
              })}
            </span>
            <input
              type="email"
              required
              value={confirmEmail}
              onChange={(e) => setConfirmEmail(e.target.value)}
              className="w-full rounded-item border border-danger/40 bg-input px-3 py-2 text-sm text-foreground outline-none transition-colors duration-150 focus:border-danger"
              placeholder={email}
              autoComplete="off"
            />
          </label>

          {error && (
            <p className="rounded-item border border-danger/40 bg-danger/10 px-3 py-2 text-xs text-danger">
              {tCommon("errorWithMessage", { message: error })}
            </p>
          )}

          <div className="flex flex-col gap-2 sm:flex-row">
            <button
              type="submit"
              disabled={loading || !confirmed}
              className="inline-flex min-h-[44px] items-center justify-center rounded-item bg-danger px-4 py-2 text-sm font-semibold text-button-ink transition-all duration-200 hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:shadow-none"
            >
              {loading ? t("sending") : t("sendConfirmationEmail")}
            </button>
            <button
              type="button"
              onClick={cancel}
              disabled={loading}
              className="inline-flex min-h-[44px] items-center justify-center rounded-item border border-border px-4 py-2 text-sm text-muted transition-colors duration-150 hover:border-foreground/40 hover:text-foreground disabled:opacity-50"
            >
              {tCommon("cancel")}
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
