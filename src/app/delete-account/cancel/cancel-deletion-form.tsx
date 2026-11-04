"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { ShieldCheck } from "lucide-react";
import { Earth } from "@/components/brand/earth";
import { getErrorMessage } from "@/lib/get-error-message";

type Status = "idle" | "loading" | "done";

export function CancelDeletionForm() {
  const t = useTranslations("auth.cancelDeletion");
  const [token, setToken] = useState<string | null>(null);
  const [status, setStatus] = useState<Status>("idle");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setToken(new URLSearchParams(window.location.search).get("token"));
  }, []);

  async function cancelDeletion() {
    if (!token) return;
    setStatus("loading");
    setError(null);

    try {
      const res = await fetch("/api/delete-account/cancel", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token }),
      });
      const data = await res.json();

      if (!res.ok || !data.ok) {
        setStatus("idle");
        setError(data.error || t("failed"));
        return;
      }

      setStatus("done");
    } catch (err) {
      console.error("Cancel deletion threw:", err);
      setStatus("idle");
      setError(getErrorMessage(err, t("failed")));
    }
  }

  if (status === "done") {
    return (
      <main className="flex min-h-screen items-center justify-center overflow-x-hidden bg-background px-4">
        <div className="w-full max-w-md text-center">
          <div className="mb-6 flex items-center justify-center">
            <Earth variant="large" px={160} label="Ionexa" />
          </div>

          <div className="rounded-card border border-success/40 bg-success/[0.03] p-6">
            <h1 className="flex items-center justify-center gap-2 text-lg font-semibold text-success">
              <ShieldCheck className="h-5 w-5" /> {t("successTitle")}
            </h1>
            <p className="mt-3 text-sm text-muted">{t("successBody")}</p>
            <p className="mt-4 text-center text-xs text-muted">
              <Link href="/dashboard" className="text-foreground underline underline-offset-2">
                {t("backToDashboard")}
              </Link>
            </p>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="flex min-h-screen items-center justify-center overflow-x-hidden bg-background px-4">
      <div className="w-full max-w-md text-center">
        <div className="mb-6 flex items-center justify-center">
          <Earth variant="large" px={160} label="Ionexa" />
        </div>

        <div className="rounded-card border border-border bg-panel p-6">
          <h1 className="text-lg font-semibold text-foreground">
            {t("title")}
          </h1>

          {token === null ? null : !token ? (
            <p className="mt-3 text-sm text-muted">{t("missingToken")}</p>
          ) : (
            <>
              <p className="mt-3 text-sm text-muted">{t("body")}</p>

              {error && (
                <p className="mt-4 rounded-item border border-danger/40 bg-danger/10 px-3 py-2 text-xs text-danger">
                  {error}
                </p>
              )}

              <button
                type="button"
                onClick={cancelDeletion}
                disabled={status === "loading"}
                className="mt-5 inline-flex min-h-[44px] w-full items-center justify-center rounded-card bg-button px-4 py-2.5 text-sm font-semibold text-button-ink transition-all duration-200 hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {status === "loading" ? t("cancelling") : t("cancelButton")}
              </button>
            </>
          )}

          <p className="mt-4 text-center text-xs text-muted">
            <Link href="/" className="text-foreground underline underline-offset-2">
              {t("home")}
            </Link>
          </p>
        </div>
      </div>
    </main>
  );
}
