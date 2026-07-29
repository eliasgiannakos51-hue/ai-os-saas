"use client";

import { useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

type Status = "checking" | "ready" | "invalid";

export default function ResetPasswordPage() {
  const router = useRouter();
  const [supabase] = useState(() => createClient());

  const [status, setStatus] = useState<Status>("checking");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let active = true;

    // The reset link lands here with a recovery session already applied by
    // the Supabase client (it parses the URL on load). "PASSWORD_RECOVERY"
    // is the documented signal that it succeeded; getSession() is a
    // fallback in case that event fired before this listener attached.
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event) => {
      if (event === "PASSWORD_RECOVERY" && active) {
        setStatus("ready");
      }
    });

    supabase.auth.getSession().then(({ data: { session } }) => {
      if (active && session) {
        setStatus("ready");
      }
    });

    const timeout = setTimeout(() => {
      if (active) {
        setStatus((current) => (current === "checking" ? "invalid" : current));
      }
    }, 5000);

    return () => {
      active = false;
      subscription.unsubscribe();
      clearTimeout(timeout);
    };
  }, [supabase]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);

    if (password !== confirmPassword) {
      setError("Passwords don't match.");
      return;
    }

    setLoading(true);
    const { error } = await supabase.auth.updateUser({ password });
    setLoading(false);

    if (error) {
      setError(error.message);
      return;
    }

    await supabase.auth.signOut();
    router.push("/login?reset=success");
    router.refresh();
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-4 font-mono">
      <div className="w-full max-w-md">
        <div className="mb-8 text-center">
          <p className="text-sm tracking-widest text-amber-500">AI_OS //</p>
          <h1 className="mt-1 text-2xl font-bold text-foreground">
            set_new_password
          </h1>
        </div>

        <div className="rounded-md border border-border bg-panel p-6 shadow-[0_0_0_1px_rgba(245,158,11,0.05)]">
          {status === "checking" && (
            <p className="animate-pulse text-center text-sm text-muted">
              verifying reset link...
            </p>
          )}

          {status === "invalid" && (
            <div className="space-y-4 text-center">
              <p className="text-sm text-red-400">
                This reset link is invalid or has expired.
              </p>
              <Link
                href="/forgot-password"
                className="inline-flex min-h-[44px] items-center justify-center rounded bg-amber-500 px-4 py-2 text-sm font-semibold text-black transition-opacity hover:opacity-90 sm:min-h-0"
              >
                request a new link
              </Link>
            </div>
          )}

          {status === "ready" && (
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label htmlFor="password" className="mb-1 block text-xs text-muted">
                  <span className="text-amber-500">$</span> new password
                </label>
                <input
                  id="password"
                  type="password"
                  required
                  minLength={6}
                  autoComplete="new-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full rounded border border-border bg-black/40 px-3 py-2 text-sm text-foreground outline-none transition-colors focus:border-amber-500"
                  placeholder="••••••••"
                />
              </div>

              <div>
                <label htmlFor="confirmPassword" className="mb-1 block text-xs text-muted">
                  <span className="text-amber-500">$</span> confirm password
                </label>
                <input
                  id="confirmPassword"
                  type="password"
                  required
                  minLength={6}
                  autoComplete="new-password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  className="w-full rounded border border-border bg-black/40 px-3 py-2 text-sm text-foreground outline-none transition-colors focus:border-amber-500"
                  placeholder="••••••••"
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
                {loading ? "saving..." : "run reset()"}
              </button>
            </form>
          )}
        </div>
      </div>
    </main>
  );
}
