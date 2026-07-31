"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { createClient } from "@/lib/supabase/client";
import { getErrorMessage } from "@/lib/get-error-message";
import { Logo } from "@/components/logo";

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
        setError(getErrorMessage(error));
        return;
      }

      setSent(true);
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error("Reset password request threw:", err);
      setError(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center overflow-x-hidden bg-background px-4">
      <div className="w-full max-w-md">
        <div className="mb-8 text-center">
          <div className="mb-4 flex items-center justify-center">
            <Logo className="h-14 w-auto" />
          </div>
          <h1 className="text-2xl font-bold text-foreground">
            {t("title")}
          </h1>
        </div>

        <div className="rounded-2xl border border-border bg-panel p-6 shadow-[0_0_0_1px_rgba(249,115,22,0.05)]">
          {sent ? (
            <div className="space-y-4 text-center">
              <p className="text-sm text-foreground/90">
                {t.rich("checkInbox", {
                  highlight: (chunks) => <span className="text-orange-400">{chunks}</span>,
                  emailAddress: email,
                })}
              </p>
              <Link
                href="/login"
                className="inline-flex min-h-[44px] items-center justify-center rounded-xl border border-border px-4 py-2 text-sm text-muted transition-colors duration-150 hover:border-orange-500 hover:text-orange-400 sm:min-h-0"
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
                  className="w-full rounded-xl border border-border bg-input px-3 py-2.5 text-sm text-foreground outline-none transition-colors duration-150 focus:border-orange-500"
                  placeholder="you@domain.com"
                />
              </div>

              {error && (
                <p className="rounded-xl border border-red-900 bg-red-950/40 px-3 py-2 text-xs text-red-400">
                  {error}
                </p>
              )}

              <button
                type="submit"
                disabled={loading}
                className="inline-flex min-h-[44px] w-full items-center justify-center rounded-xl bg-orange-500 px-4 py-2.5 text-sm font-semibold text-black transition-all duration-200 hover:opacity-90 hover:shadow-[0_0_16px_rgba(249,115,22,0.35)] disabled:opacity-50"
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
              className="text-orange-400 underline underline-offset-2"
            >
              {t("logIn")}
            </Link>
          </p>
        )}
      </div>
    </main>
  );
}
