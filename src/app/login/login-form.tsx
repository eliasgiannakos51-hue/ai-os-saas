"use client";

import { useEffect, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { getErrorMessage } from "@/lib/get-error-message";
import { isPasswordStrong } from "@/lib/password-strength";
import { PasswordInput } from "@/components/ui/password-input";
import { LoginSplash } from "@/components/auth/login-splash";
import { PasswordStrengthChecklist } from "@/components/auth/password-strength-checklist";
import { GeneratePasswordButton } from "@/components/auth/generate-password-button";
import { Logo } from "@/components/logo";

type Mode = "login" | "signup";

export function LoginForm() {
  const router = useRouter();
  const supabase = createClient();

  const [mode, setMode] = useState<Mode>("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [debugDump, setDebugDump] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [resetSuccess, setResetSuccess] = useState(false);
  const [authenticated, setAuthenticated] = useState(false);

  // TEMPORARY — diagnosing a report that this flow shows "error: {}" even
  // though getErrorMessage() is already in use here. Dumps every own
  // property of the raw error (enumerable or not) so we can see its real
  // shape instead of guessing. Same pattern as forgot-password-form.tsx.
  // Remove dumpErrorForDebugging() and the debugDump state/UI once the
  // real cause is identified.
  function dumpErrorForDebugging(label: string, raw: unknown) {
    const info = {
      label,
      typeofRaw: typeof raw,
      isErrorInstance: raw instanceof Error,
      constructorName:
        raw && typeof raw === "object" ? raw.constructor?.name : undefined,
      keysEnumerable: raw && typeof raw === "object" ? Object.keys(raw) : [],
      allOwnProps:
        raw && typeof raw === "object"
          ? Object.getOwnPropertyNames(raw)
          : [],
      jsonStringifyPlain: (() => {
        try {
          return JSON.stringify(raw);
        } catch {
          return "<threw>";
        }
      })(),
      jsonStringifyAllProps: (() => {
        try {
          return raw && typeof raw === "object"
            ? JSON.stringify(raw, Object.getOwnPropertyNames(raw))
            : String(raw);
        } catch {
          return "<threw>";
        }
      })(),
    };
    // eslint-disable-next-line no-console
    console.error(`[login debug] ${label}:`, raw);
    // eslint-disable-next-line no-console
    console.error(`[login debug] ${label} (all props):`, info);
    setDebugDump(JSON.stringify(info, null, 2));
  }

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("reset") === "success") {
      setResetSuccess(true);
    }
    if (params.get("mode") === "signup") {
      setMode("signup");
    }
  }, []);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setDebugDump(null);

    if (mode === "signup" && !termsAccepted) {
      setError("You must agree to the Terms of Service and Privacy Policy to create an account.");
      return;
    }

    setLoading(true);

    try {
      if (mode === "login") {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) {
          // eslint-disable-next-line no-console
          console.error(
            "LOGIN ERROR:",
            JSON.stringify(error, Object.getOwnPropertyNames(error || {}))
          );
          dumpErrorForDebugging("signInWithPassword returned error", error);
          setError(getErrorMessage(error));
          return;
        }
        setAuthenticated(true);
      } else {
        const res = await fetch("/api/signup", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email, password, termsAccepted }),
        });
        const data = await res.json();
        if (!res.ok || !data.ok) {
          dumpErrorForDebugging("/api/signup returned error", data.error);
          setError(getErrorMessage(data.error, "Signup failed."));
          return;
        }
        setAuthenticated(true);
      }
    } catch (err) {
      dumpErrorForDebugging(`${mode} threw`, err);
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
            <Logo className="h-14 w-auto" />
          </div>
          <h1 className="text-2xl font-bold text-foreground">
            {mode === "login" ? "Welcome back" : "Create your account"}
          </h1>
        </div>

        {resetSuccess && (
          <p className="mb-4 rounded-xl border border-emerald-800 bg-emerald-950/30 px-3 py-2 text-center text-xs text-emerald-400">
            Password updated — sign in with your new password.
          </p>
        )}

        <div className="rounded-2xl border border-border bg-panel shadow-[0_0_0_1px_rgba(249,115,22,0.05)]">
          <div className="flex border-b border-border p-1.5 text-sm">
            <button
              type="button"
              onClick={() => {
                setMode("login");
                setError(null);
                setDebugDump(null);
              }}
              aria-pressed={mode === "login"}
              className={`flex-1 rounded-lg px-4 py-2.5 font-medium transition-colors duration-150 ${
                mode === "login"
                  ? "bg-orange-500/10 text-orange-400"
                  : "text-muted hover:text-foreground"
              }`}
            >
              Log In
            </button>
            <button
              type="button"
              onClick={() => {
                setMode("signup");
                setError(null);
                setDebugDump(null);
              }}
              aria-pressed={mode === "signup"}
              className={`flex-1 rounded-lg px-4 py-2.5 font-medium transition-colors duration-150 ${
                mode === "signup"
                  ? "bg-orange-500/10 text-orange-400"
                  : "text-muted hover:text-foreground"
              }`}
            >
              Sign Up
            </button>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4 p-6">
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
                className="w-full rounded-xl border border-border bg-black/40 px-3 py-2.5 text-sm text-foreground outline-none transition-colors duration-150 focus:border-orange-500"
                placeholder="you@domain.com"
              />
            </div>

            <div>
              <div className="mb-1 flex items-center justify-between gap-2">
                <label htmlFor="password" className="block text-xs text-muted">
                  Password
                </label>
                {mode === "signup" && (
                  <GeneratePasswordButton onGenerate={setPassword} />
                )}
              </div>
              <PasswordInput
                id="password"
                required
                minLength={mode === "signup" ? 8 : 6}
                autoComplete={mode === "login" ? "current-password" : "new-password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full rounded-xl border border-border bg-black/40 px-3 py-2.5 text-sm text-foreground outline-none transition-colors duration-150 focus:border-orange-500"
                placeholder="••••••••"
              />
              {mode === "signup" && (
                <div className="mt-2">
                  <PasswordStrengthChecklist password={password} />
                </div>
              )}
            </div>

            {mode === "signup" && (
              <label className="flex items-start gap-2.5 text-xs text-muted">
                <input
                  type="checkbox"
                  required
                  checked={termsAccepted}
                  onChange={(e) => setTermsAccepted(e.target.checked)}
                  className="mt-0.5 h-4 w-4 shrink-0 rounded border-border bg-black/40 text-orange-500 accent-orange-500 outline-none focus:ring-2 focus:ring-orange-500/40"
                />
                <span>
                  I agree to the{" "}
                  <Link
                    href="/terms"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-orange-400 underline underline-offset-2"
                  >
                    Terms of Service
                  </Link>{" "}
                  and{" "}
                  <Link
                    href="/privacy"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-orange-400 underline underline-offset-2"
                  >
                    Privacy Policy
                  </Link>
                </span>
              </label>
            )}

            {error && (
              <p className="rounded-xl border border-red-900 bg-red-950/40 px-3 py-2 text-xs text-red-400">
                {error}
              </p>
            )}

            {debugDump && (
              <div className="rounded-xl border border-orange-800 bg-orange-950/20 p-3">
                <p className="mb-2 text-[10px] uppercase tracking-wide text-orange-500">
                  temporary debug info — include this in your bug report
                </p>
                <pre className="max-h-64 overflow-auto whitespace-pre-wrap break-all text-[10px] leading-relaxed text-orange-200/90">
                  {debugDump}
                </pre>
              </div>
            )}

            <button
              type="submit"
              disabled={
                loading ||
                (mode === "signup" && (!termsAccepted || !isPasswordStrong(password)))
              }
              className="inline-flex min-h-[44px] w-full items-center justify-center rounded-xl bg-orange-500 px-4 py-2.5 text-sm font-semibold text-black transition-all duration-200 hover:opacity-90 hover:shadow-[0_0_16px_rgba(249,115,22,0.35)] disabled:opacity-50"
            >
              {loading
                ? "Working..."
                : mode === "login"
                  ? "Log In"
                  : "Sign Up"}
            </button>
          </form>
        </div>

        <p className="mt-4 text-center text-xs text-muted">
          {mode === "login" ? "No account yet? " : "Already have one? "}
          <button
            type="button"
            onClick={() => setMode(mode === "login" ? "signup" : "login")}
            className="text-orange-400 underline underline-offset-2"
          >
            {mode === "login" ? "Sign up" : "Log in"}
          </button>
        </p>

        {mode === "login" && (
          <p className="mt-2 text-center text-xs text-muted">
            <Link
              href="/forgot-password"
              className="text-orange-400 underline underline-offset-2"
            >
              Forgot password?
            </Link>
          </p>
        )}
      </div>
    </main>
  );
}
