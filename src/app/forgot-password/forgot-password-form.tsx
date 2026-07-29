"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { getErrorMessage } from "@/lib/get-error-message";

export function ForgotPasswordForm() {
  const supabase = createClient();

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
        setError(getErrorMessage(error));
        return;
      }

      setSent(true);
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-4 font-mono">
      <div className="w-full max-w-md">
        <div className="mb-8 text-center">
          <p className="text-sm tracking-widest text-amber-500">AI_OS //</p>
          <h1 className="mt-1 text-2xl font-bold text-foreground">
            reset_password
          </h1>
        </div>

        <div className="rounded-md border border-border bg-panel p-6 shadow-[0_0_0_1px_rgba(245,158,11,0.05)]">
          {sent ? (
            <div className="space-y-4 text-center">
              <p className="text-sm text-foreground/90">
                If an account exists for{" "}
                <span className="text-amber-400">{email}</span>, a password
                reset link is on its way. Check your inbox.
              </p>
              <Link
                href="/login"
                className="inline-flex min-h-[44px] items-center justify-center rounded border border-border px-4 py-2 text-sm text-muted transition-colors hover:border-amber-500 hover:text-amber-400 sm:min-h-0"
              >
                back to login
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
                  <span className="text-amber-500">$</span> email
                </label>
                <input
                  id="email"
                  type="email"
                  required
                  autoComplete="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full rounded border border-border bg-black/40 px-3 py-2 text-sm text-foreground outline-none transition-colors focus:border-amber-500"
                  placeholder="you@domain.com"
                />
              </div>

              {error && (
                <p className="rounded border border-red-900 bg-red-950/40 px-3 py-2 text-xs text-red-400">
                  error: {error}
                </p>
              )}

              <button
                type="submit"
                disabled={loading}
                className="inline-flex min-h-[44px] w-full items-center justify-center rounded bg-amber-500 px-4 py-2 text-sm font-semibold text-black transition-opacity hover:opacity-90 disabled:opacity-50"
              >
                {loading ? "sending..." : "send_reset()"}
              </button>
            </form>
          )}
        </div>

        {!sent && (
          <p className="mt-4 text-center text-xs text-muted">
            remembered it?{" "}
            <Link
              href="/login"
              className="text-amber-500 underline underline-offset-2"
            >
              login
            </Link>
          </p>
        )}
      </div>
    </main>
  );
}
