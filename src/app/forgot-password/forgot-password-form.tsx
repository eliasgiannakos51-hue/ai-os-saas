"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { createClient } from "@/lib/supabase/client";
import { getErrorMessage } from "@/lib/get-error-message";
import { Earth } from "@/components/brand/earth";

export function ForgotPasswordForm() {
  const supabase = createClient();
  const t = useTranslations("auth.forgotPassword");

  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/reset-password`,
      });

      if (error) {
        // eslint-disable-next-line no-console
        console.error("Reset password request error:", error);
        setError(getErrorMessage(error, t("failed")));
        return;
      }

      setSent(true);
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error("Reset password request threw:", err);
      setError(getErrorMessage(err, t("failed")));
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center overflow-x-hidden bg-background px-4">
      <div className="w-full max-w-md">
        <div className="mb-8 text-center">
          <div className="mb-4 flex items-center justify-center">
            <Earth variant="large" px={160} label="Ionexa" />
          </div>
          <h1 className="text-2xl font-bold text-foreground">
            {t("title")}
          </h1>
        </div>

        <div className="surface">
          {sent ? (
            <div className="space-y-4 text-center">
              <p className="text-sm text-foreground/90">
                {t.rich("checkInbox", {
                  highlight: (chunks) => <span className="text-foreground">{chunks}</span>,
                  emailAddress: email,
                })}
              </p>
              <Link
                href="/login"
                className="inline-flex min-h-[44px] items-center justify-center rounded-card border border-border px-4 py-2 text-sm text-muted transition-colors duration-150 hover:border-foreground/40 hover:text-foreground"
              >
                {t("backToLogin")}
              </Link>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              <p className="text-xs text-muted">{t("instructions")}</p>

              <div>
                <label htmlFor="email" className="mb-1 block text-xs text-muted">
                  {t("email")}
                </label>
                <input
                  id="email"
                  type="email"
                  required
                  autoComplete="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full rounded-card border border-border bg-input px-3 py-2.5 text-sm text-foreground outline-none transition-colors duration-150 focus:border-foreground/40"
                  placeholder="you@domain.com"
                />
              </div>

              {error && (
                <p className="rounded-card border border-danger/40 bg-danger/10 px-3 py-2 text-xs text-danger">
                  {error}
                </p>
              )}

              <button
                type="submit"
                disabled={loading}
                className="inline-flex min-h-[44px] w-full items-center justify-center rounded-card bg-button px-4 py-2.5 text-sm font-semibold text-button-ink transition-all duration-200 hover:opacity-90 disabled:opacity-50"
              >
                {loading ? t("sending") : t("sendResetLink")}
              </button>
            </form>
          )}
        </div>

        {!sent && (
          <p className="mt-4 text-center text-xs text-muted">
            {t("rememberedIt")}{" "}
            <Link
              href="/login"
              className="text-foreground underline underline-offset-2"
            >
              {t("logIn")}
            </Link>
          </p>
        )}
      </div>
    </main>
  );
}
