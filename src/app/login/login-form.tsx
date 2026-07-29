"use client";

import { useEffect, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";

type Mode = "login" | "signup";

export function LoginForm() {
  const router = useRouter();
  const supabase = createClient();

  const [mode, setMode] = useState<Mode>("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [resetSuccess, setResetSuccess] = useState(false);

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
    setLoading(true);

    if (mode === "login") {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      setLoading(false);
      if (error) {
        setError(error.message);
        return;
      }
      router.push("/dashboard/overview");
      router.refresh();
    } else {
      const res = await fetch("/api/signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const data = await res.json();
      setLoading(false);
      if (!res.ok || !data.ok) {
        setError(data.error ?? "Signup failed.");
        return;
      }
      router.push("/dashboard/overview");
      router.refresh();
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-4 font-mono">
      <div className="w-full max-w-md">
        <div className="mb-8 text-center">
          <p className="text-sm tracking-widest text-amber-500">AI_OS //</p>
          <h1 className="mt-1 text-2xl font-bold text-foreground">
            {mode === "login" ? "authenticate" : "create_account"}
          </h1>
        </div>

        {resetSuccess && (
          <p className="mb-4 rounded border border-emerald-800 bg-emerald-950/30 px-3 py-2 text-center text-xs text-emerald-400">
            password updated — sign in with your new password.
          </p>
        )}

        <div className="rounded-md border border-border bg-panel shadow-[0_0_0_1px_rgba(245,158,11,0.05)]">
          <div className="flex border-b border-border text-sm">
            <button
              type="button"
              onClick={() => {
                setMode("login");
                setError(null);
              }}
              aria-pressed={mode === "login"}
              className={`flex-1 px-4 py-3 transition-colors ${
                mode === "login"
                  ? "bg-black/30 text-amber-400"
                  : "text-muted hover:text-foreground"
              }`}
            >
              login
            </button>
            <button
              type="button"
              onClick={() => {
                setMode("signup");
                setError(null);
              }}
              aria-pressed={mode === "signup"}
              className={`flex-1 px-4 py-3 transition-colors ${
                mode === "signup"
                  ? "bg-black/30 text-amber-400"
                  : "text-muted hover:text-foreground"
              }`}
            >
              sign_up
            </button>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4 p-6">
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

            <div>
              <label htmlFor="password" className="mb-1 block text-xs text-muted">
                <span className="text-amber-500">$</span> password
              </label>
              <input
                id="password"
                type="password"
                required
                minLength={6}
                autoComplete={mode === "login" ? "current-password" : "new-password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
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
              {loading
                ? "working..."
                : mode === "login"
                  ? "run login()"
                  : "run signup()"}
            </button>
          </form>
        </div>

        <p className="mt-4 text-center text-xs text-muted">
          {mode === "login" ? "no account yet? " : "already have one? "}
          <button
            type="button"
            onClick={() => setMode(mode === "login" ? "signup" : "login")}
            className="text-amber-500 underline underline-offset-2"
          >
            {mode === "login" ? "sign_up" : "login"}
          </button>
        </p>

        {mode === "login" && (
          <p className="mt-2 text-center text-xs text-muted">
            <Link
              href="/forgot-password"
              className="text-amber-500 underline underline-offset-2"
            >
              forgot_password()
            </Link>
          </p>
        )}
      </div>
    </main>
  );
}
