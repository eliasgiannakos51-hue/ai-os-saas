"use client";

import { useEffect, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { getErrorMessage } from "@/lib/get-error-message";
import { PasswordInput } from "@/components/ui/password-input";
import { LoginSplash } from "@/components/auth/login-splash";
import { Logo } from "@/components/logo";

export function LoginForm() {
  const router = useRouter();
  const supabase = createClient();

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
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) {
        // eslint-disable-next-line no-console
        console.error("Login error:", error);
        setError(getErrorMessage(error));
        return;
      }
      setAuthenticated(true);
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error("Login threw:", err);
      setError(getErrorMessage(err));
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
    <main className="flex min-h-screen items-center justify-center overflow-x-hidden bg-background px-4">
      <div className="w-full max-w-md">
        <div className="mb-8 text-center">
          <div className="mb-4 flex items-center justify-center">
            <Logo className="h-[168px] w-auto max-w-full" />
          </div>
          <h1 className="text-2xl font-bold text-foreground">Welcome back</h1>
        </div>

        {resetSuccess && (
          <p className="mb-4 rounded-xl border border-emerald-800 bg-emerald-950/30 px-3 py-2 text-center text-xs text-emerald-400">
            Password updated — sign in with your new password.
          </p>
        )}

        <div className="rounded-2xl border border-border bg-panel p-6 shadow-[0_0_0_1px_rgba(249,115,22,0.05)]">
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label htmlFor="email" className="mb-1 block text-xs text-muted">
                Email
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
                Password
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
              className="inline-flex min-h-[44px] w-full items-center justify-center rounded-xl bg-orange-500 px-4 py-2.5 text-sm font-semibold text-black transition-all duration-200 hover:opacity-90 hover:shadow-[0_0_16px_rgba(249,115,22,0.35)] disabled:opacity-50"
            >
              {loading ? "Working..." : "Log In"}
            </button>
          </form>
        </div>

        <p className="mt-4 text-center text-xs text-muted">
          No account yet?{" "}
          <Link href="/signup" className="text-orange-400 underline underline-offset-2">
            Sign up
          </Link>
        </p>

        <p className="mt-2 text-center text-xs text-muted">
          <Link href="/forgot-password" className="text-orange-400 underline underline-offset-2">
            Forgot password?
          </Link>
        </p>
      </div>
    </main>
  );
}
