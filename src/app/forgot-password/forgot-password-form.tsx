"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { getErrorMessage } from "@/lib/get-error-message";
import { Logo } from "@/components/logo";

export function ForgotPasswordForm() {
  const supabase = createClient();

  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [debugDump, setDebugDump] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);

  // TEMPORARY — diagnosing a report that this flow shows "error: {}" even
  // after the getErrorMessage() fix. Dumps every own property of the raw
  // error (enumerable or not) so we can see its real shape instead of
  // guessing. Remove dumpErrorForDebugging() and the debugDump state/UI
  // once the real cause is identified.
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
    console.error(`[forgot-password debug] ${label}:`, raw);
    // eslint-disable-next-line no-console
    console.error(`[forgot-password debug] ${label} (all props):`, info);
    setDebugDump(JSON.stringify(info, null, 2));
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setDebugDump(null);
    setLoading(true);

    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/reset-password`,
      });

      if (error) {
        dumpErrorForDebugging("resetPasswordForEmail returned error", error);
        setError(getErrorMessage(error));
        return;
      }

      setSent(true);
    } catch (err) {
      dumpErrorForDebugging("resetPasswordForEmail threw", err);
      setError(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="w-full max-w-md">
        <div className="mb-8 text-center">
          <div className="mb-4 flex items-center justify-center">
            <Logo className="h-14 w-auto" />
          </div>
          <h1 className="text-2xl font-bold text-foreground">
            Reset password
          </h1>
        </div>

        <div className="rounded-2xl border border-border bg-panel p-6 shadow-[0_0_0_1px_rgba(249,115,22,0.05)]">
          {sent ? (
            <div className="space-y-4 text-center">
              <p className="text-sm text-foreground/90">
                If an account exists for{" "}
                <span className="text-orange-400">{email}</span>, a password
                reset link is on its way. Check your inbox.
              </p>
              <Link
                href="/login"
                className="inline-flex min-h-[44px] items-center justify-center rounded-xl border border-border px-4 py-2 text-sm text-muted transition-colors duration-150 hover:border-orange-500 hover:text-orange-400 sm:min-h-0"
              >
                Back to login
              </Link>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              <p className="text-xs text-muted">
                Enter the email on your account and we&apos;ll send you a
                link to reset your password.
              </p>

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

              {error && (
                <p className="rounded-xl border border-red-900 bg-red-950/40 px-3 py-2 text-xs text-red-400">
                  {error}
                </p>
              )}

              {debugDump && (
                <div className="rounded-xl border border-orange-800 bg-orange-950/20 p-3">
                  <p className="mb-2 text-[10px] uppercase tracking-wide text-orange-500">
                    temporary debug info — copy/paste this to Claude
                  </p>
                  <pre className="max-h-64 overflow-auto whitespace-pre-wrap break-all text-[10px] leading-relaxed text-orange-200/90">
                    {debugDump}
                  </pre>
                </div>
              )}

              <button
                type="submit"
                disabled={loading}
                className="inline-flex min-h-[44px] w-full items-center justify-center rounded-xl bg-orange-500 px-4 py-2.5 text-sm font-semibold text-black transition-all duration-200 hover:opacity-90 hover:shadow-[0_0_16px_rgba(249,115,22,0.35)] disabled:opacity-50"
              >
                {loading ? "Sending..." : "Send reset link"}
              </button>
            </form>
          )}
        </div>

        {!sent && (
          <p className="mt-4 text-center text-xs text-muted">
            Remembered it?{" "}
            <Link
              href="/login"
              className="text-orange-400 underline underline-offset-2"
            >
              Log in
            </Link>
          </p>
        )}
      </div>
    </main>
  );
}
