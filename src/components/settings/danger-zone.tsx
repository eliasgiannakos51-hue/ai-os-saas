"use client";

import { useState, type FormEvent } from "react";
import { AlertTriangle, Trash2, MailCheck } from "lucide-react";
import { useToast } from "@/components/toast/toast-context";
import { getErrorMessage } from "@/lib/get-error-message";

export function DangerZone({ email }: { email: string }) {
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
      setError("Email doesn't match.");
      return;
    }

    setLoading(true);
    try {
      const res = await fetch("/api/delete-account/request", { method: "POST" });
      const data = await res.json();

      if (!res.ok || !data.ok) {
        setError(getErrorMessage(data.error, "Failed to start account deletion."));
        addToast("✗ could not start account deletion", "error");
        return;
      }

      setRequested(true);
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error("Delete account request threw:", err);
      setError(getErrorMessage(err));
      addToast("✗ could not start account deletion", "error");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="rounded-2xl border border-red-900/50 bg-red-500/[0.03] p-5">
      <h2 className="flex items-center gap-2 text-sm font-semibold text-red-400">
        <AlertTriangle className="h-4 w-4" /> Danger Zone
      </h2>
      <p className="mt-2 text-xs text-muted">
        Permanently delete your account and every record you&apos;ve logged
        across all 13 modules. This can&apos;t be undone.
      </p>

      {requested ? (
        <p className="mt-4 flex items-start gap-2 rounded-lg border border-emerald-800 bg-emerald-950/30 px-3 py-2.5 text-xs text-emerald-400">
          <MailCheck className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          Check your email to confirm deletion — we sent a link to{" "}
          <span className="text-emerald-300">{email}</span>. It expires in 1
          hour; nothing is deleted until you click it.
        </p>
      ) : !open ? (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="mt-4 inline-flex min-h-[44px] items-center justify-center gap-1.5 rounded-lg border border-red-800 px-4 py-2 text-sm text-red-400 transition-colors duration-150 hover:border-red-500 hover:bg-red-950/30 sm:min-h-0"
        >
          <Trash2 className="h-4 w-4" /> Delete Account
        </button>
      ) : (
        <form onSubmit={handleDelete} className="mt-4 space-y-3">
          <label className="block text-xs text-muted">
            <span className="mb-1 block">
              type <span className="text-red-400">{email}</span> to confirm
            </span>
            <input
              type="email"
              required
              value={confirmEmail}
              onChange={(e) => setConfirmEmail(e.target.value)}
              className="w-full rounded-lg border border-red-900 bg-input px-3 py-2 text-sm text-foreground outline-none transition-colors duration-150 focus:border-red-500"
              placeholder={email}
              autoComplete="off"
            />
          </label>

          {error && (
            <p className="rounded-lg border border-red-900 bg-red-950/40 px-3 py-2 text-xs text-red-400">
              error: {error}
            </p>
          )}

          <div className="flex flex-col gap-2 sm:flex-row">
            <button
              type="submit"
              disabled={loading || !confirmed}
              className="inline-flex min-h-[44px] items-center justify-center rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white transition-all duration-200 hover:opacity-90 hover:shadow-[0_0_16px_rgba(220,38,38,0.35)] disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:shadow-none sm:min-h-0"
            >
              {loading ? "Sending..." : "Send deletion confirmation email"}
            </button>
            <button
              type="button"
              onClick={cancel}
              disabled={loading}
              className="inline-flex min-h-[44px] items-center justify-center rounded-lg border border-border px-4 py-2 text-sm text-muted transition-colors duration-150 hover:border-orange-500 hover:text-orange-400 disabled:opacity-50 sm:min-h-0"
            >
              Cancel
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
