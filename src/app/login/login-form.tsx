"use client";

import { useEffect, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { getErrorMessage } from "@/lib/get-error-message";
import { PasswordInput } from "@/components/ui/password-input";
import { LoginSplash } from "@/components/auth/login-splash";
import { AppBackground } from "@/components/ui/app-background";
import { SocialAuthButtons } from "@/components/auth/social-auth-buttons";
import { Logo } from "@/components/logo";

export function LoginForm() {
  const router = useRouter();
  const t = useTranslations("auth.login");

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [resetSuccess, setResetSuccess] = useState(false);
  const [authenticated, setAuthenticated] = useState(false);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("reset") === "success") {
      setResetSuccess(true);
    }
  }, []);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      // Routed through /api/auth/login (server-side) instead of calling
      // supabase.auth.signInWithPassword directly — see that route's file
      // comment for why: repeated-failed-attempt rate limiting can only
      // be a real security boundary when enforced server-side. The
      // session cookie is set via this fetch's own Set-Cookie response
      // headers (applied to the browser's cookie store automatically,
      // same-origin), which is what goToDashboard's router.refresh()
      // below actually needs — a fresh server render re-reads those
      // cookies directly, independent of this component's own client-side
      // supabase instance.
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        // eslint-disable-next-line no-console
        console.error("Login error:", data?.error);
        setError(getErrorMessage(data?.error, t("failed")));
        return;
      }

      // New-device security email (see api/auth/device-check) — best-effort,
      // must never block getting into the dashboard.
      try {
        await fetch("/api/auth/device-check", { method: "POST" });
      } catch (deviceCheckErr) {
        // eslint-disable-next-line no-console
        console.error("Device check failed:", deviceCheckErr);
      }

      setAuthenticated(true);
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error("Login threw:", err);
      setError(getErrorMessage(err, t("failed")));
    } finally {
      setLoading(false);
    }
  }

  function goToDashboard() {
    router.push("/dashboard/overview");
    router.refresh();
  }

  if (authenticated) {
    return <LoginSplash onDone={goToDashboard} />;
  }

  return (
    <main className="relative flex min-h-screen items-center justify-center overflow-x-hidden bg-background px-4">
      <AppBackground />
      <div className="relative z-10 w-full max-w-md">
        <div className="mb-8 text-center">
          <div className="mb-4 flex items-center justify-center">
            <Logo className="h-[168px] w-auto max-w-full" />
          </div>
          <h1 className="text-2xl font-bold text-foreground">{t("welcomeBack")}</h1>
        </div>

        {resetSuccess && (
          <p className="mb-4 rounded-xl border border-emerald-800 bg-emerald-950/30 px-3 py-2 text-center text-xs text-emerald-400">
            {t("resetSuccess")}
          </p>
        )}

        <div className="rounded-2xl border border-border bg-panel p-6 shadow-[0_0_0_1px_rgba(249,115,22,0.05)]">
          <SocialAuthButtons />

          <form onSubmit={handleSubmit} className="space-y-4">
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

            <div>
              <label htmlFor="password" className="mb-1 block text-xs text-muted">
                {t("password")}
              </label>
              <PasswordInput
                id="password"
                required
                minLength={6}
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full rounded-xl border border-border bg-input px-3 py-2.5 text-sm text-foreground outline-none transition-colors duration-150 focus:border-orange-500"
                placeholder="••••••••"
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
              className="cta-amber inline-flex min-h-[44px] w-full items-center justify-center rounded-xl px-4 py-2.5 text-sm font-semibold text-black disabled:opacity-50"
            >
              {loading ? t("working") : t("logIn")}
            </button>
          </form>
        </div>

        <p className="mt-4 text-center text-xs text-muted">
          {t("noAccount")}{" "}
          <Link href="/signup" className="text-orange-400 underline underline-offset-2">
            {t("signUp")}
          </Link>
        </p>

        <p className="mt-2 text-center text-xs text-muted">
          <Link href="/forgot-password" className="text-orange-400 underline underline-offset-2">
            {t("forgotPassword")}
          </Link>
        </p>
      </div>
    </main>
  );
}
