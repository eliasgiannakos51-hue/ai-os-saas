"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { AlertTriangle } from "lucide-react";
import { Earth } from "@/components/brand/earth";
import { getErrorMessage } from "@/lib/get-error-message";

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

  // The codes /api/delete-account/confirm answers with, each said here in
  // the reader's language (auth.deleteAccount.errors in messages/*.json).
  // One literal key per code, so the page's message slice can see them.
  function deletionError(code: unknown): string {
    switch (code) {
      case "rate_limited": return t("errors.rate_limited");
      case "invalid_request": return t("errors.invalid_request");
      case "link_invalid": return t("errors.link_invalid");
      case "retry": return t("errors.retry");
      case "contact_support": return t("errors.contact_support");
      case "files_retry": return t("errors.files_retry");
      case "subscription_retry": return t("errors.subscription_retry");
      default: return t("confirmFailed");
    }
  }

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
        // The route answers with a code; the words are this page's, in the
        // reader's language. Its `error` sentence is English only.
        setError(deletionError(data.code));
        return;
      }

      window.location.href = "/?deleted=success";
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error("Delete account confirmation threw:", err);
      setStatus("idle");
      setError(getErrorMessage(err, t("confirmFailed")));
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center overflow-x-hidden bg-background px-4">
      <div className="w-full max-w-md text-center">
        <div className="mb-6 flex items-center justify-center">
          <Earth variant="large" px={160} label="Ionexa" />
        </div>

        <div className="rounded-card border border-danger/40 bg-danger/[0.03] p-6">
          <h1 className="flex items-center justify-center gap-2 text-lg font-semibold text-danger">
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
                <p className="mt-4 rounded-item border border-danger/40 bg-danger/10 px-3 py-2 text-xs text-danger">
                  {error}
                </p>
              )}

              <button
                type="button"
                onClick={confirmDeletion}
                disabled={status === "loading"}
                className="mt-5 inline-flex min-h-[44px] w-full items-center justify-center rounded-card bg-danger px-4 py-2.5 text-sm font-semibold text-button-ink transition-all duration-200 hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {status === "loading" ? t("deleting") : t("confirmButton")}
              </button>
            </>
          )}

          <p className="mt-4 text-center text-xs text-muted">
            <Link href="/" className="text-foreground underline underline-offset-2">
              {t("cancel")}
            </Link>
          </p>
        </div>
      </div>
    </main>
  );
}
