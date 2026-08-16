"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { AlertTriangle } from "lucide-react";
import { Logo } from "@/components/logo";
import { getErrorMessage } from "@/lib/get-error-message";
import { useTranslations } from "next-intl";

type Status = "idle" | "loading" | "done";

// Reads the token from window.location instead of useSearchParams() so this
// page doesn't need a Suspense boundary — same pattern as login-form.tsx's
// ?mode= handling. Deletion only fires on an explicit button click, never
// automatically on page load, so an email client's link-prescanning/bot
// can't trigger a real deletion just by fetching this page.
export function ConfirmDeleteAccountForm() {
  const t = useTranslations("auth.deleteAccount");
  const [token, setToken] = useState<string | null>(null);
  const [status, setStatus] = useState<Status>("idle");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setToken(new URLSearchParams(window.location.search).get("token"));
  }, []);

  async function confirmDeletion() {
    if (!token) return;
    setStatus("loading");
    setError(null);

    try {
      const res = await fetch("/api/delete-account/confirm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token }),
      });
      const data = await res.json();

      if (!res.ok || !data.ok) {
        setStatus("idle");
        setError(getErrorMessage(data.error, "Could not delete the account."));
        return;
      }

      window.location.href = "/?deleted=success";
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error("Delete account confirmation threw:", err);
      setStatus("idle");
      setError(getErrorMessage(err));
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center overflow-x-hidden bg-background px-4">
      <div className="w-full max-w-md text-center">
        <div className="mb-6 flex items-center justify-center">
          <Logo className="h-[168px] w-auto max-w-full" />
        </div>

        <div className="rounded-2xl border border-red-900/50 bg-red-500/[0.03] p-6">
          <h1 className="flex items-center justify-center gap-2 text-lg font-semibold text-red-400">
            <AlertTriangle className="h-5 w-5" /> {t("title")}
          </h1>

          {token === null ? null : !token ? (
            <p className="mt-3 text-sm text-muted">
              {t("missingToken")}
            </p>
          ) : (
            <>
              <p className="mt-3 text-sm text-muted">
                {t("warning")}
              </p>

              {error && (
                <p className="mt-4 rounded-lg border border-red-900 bg-red-950/40 px-3 py-2 text-xs text-red-400">
                  {error}
                </p>
              )}

              <button
                type="button"
                onClick={confirmDeletion}
                disabled={status === "loading"}
                className="mt-5 inline-flex min-h-[44px] w-full items-center justify-center rounded-xl bg-red-600 px-4 py-2.5 text-sm font-semibold text-white transition-all duration-200 hover:opacity-90 hover:shadow-[0_0_16px_rgba(220,38,38,0.35)] disabled:cursor-not-allowed disabled:opacity-50"
              >
                {status === "loading" ? t("deleting") : t("confirmButton")}
              </button>
            </>
          )}

          <p className="mt-4 text-center text-xs text-muted">
            <Link href="/" className="text-orange-400 underline underline-offset-2">
              {t("cancel")}
            </Link>
          </p>
        </div>
      </div>
    </main>
  );
}
