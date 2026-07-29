"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { useToast } from "@/components/toast/toast-context";

export function DangerZone({ email }: { email: string }) {
  const router = useRouter();
  const supabase = createClient();
  const { addToast } = useToast();

  const [open, setOpen] = useState(false);
  const [confirmEmail, setConfirmEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const confirmed = confirmEmail.trim().toLowerCase() === email.toLowerCase();

  function cancel() {
    setOpen(false);
    setConfirmEmail("");
    setError(null);
  }

  async function handleDelete(e: FormEvent) {
    e.preventDefault();
    setError(null);

    if (!confirmed) {
      setError("Email doesn't match.");
      return;
    }

    setLoading(true);
    const res = await fetch("/api/delete-account", { method: "POST" });
    const data = await res.json();

    if (!res.ok || !data.ok) {
      setLoading(false);
      const message = data.error ?? "Failed to delete account.";
      setError(message);
      addToast(`✗ error: ${message}`, "error");
      return;
    }

    await supabase.auth.signOut();
    router.push("/?deleted=success");
    router.refresh();
  }

  return (
    <div className="rounded-md border border-red-900 bg-red-950/10 p-5">
      <h2 className="text-sm text-red-400">Danger Zone</h2>
      <p className="mt-2 text-xs text-muted">
        Permanently delete your account and every record you&apos;ve logged
        across all 13 modules. This can&apos;t be undone.
      </p>

      {!open ? (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="mt-4 inline-flex min-h-[44px] items-center justify-center rounded border border-red-800 px-4 py-2 text-sm text-red-400 transition-colors hover:border-red-500 hover:bg-red-950/30 sm:min-h-0"
        >
          delete_account()
        </button>
      ) : (
        <form onSubmit={handleDelete} className="mt-4 space-y-3">
          <label className="block text-xs text-muted">
            <span className="mb-1 block">
              type <span className="text-red-400">{email}</span> to confirm
            </span>
            <input
              type="email"
              required
              value={confirmEmail}
              onChange={(e) => setConfirmEmail(e.target.value)}
              className="w-full rounded border border-red-900 bg-black/40 px-3 py-2 text-sm text-foreground outline-none transition-colors focus:border-red-500"
              placeholder={email}
              autoComplete="off"
            />
          </label>

          {error && (
            <p className="rounded border border-red-900 bg-red-950/40 px-3 py-2 text-xs text-red-400">
              error: {error}
            </p>
          )}

          <div className="flex flex-col gap-2 sm:flex-row">
            <button
              type="submit"
              disabled={loading || !confirmed}
              className="inline-flex min-h-[44px] items-center justify-center rounded bg-red-600 px-4 py-2 text-sm font-semibold text-white transition-all duration-200 hover:opacity-90 hover:shadow-[0_0_16px_rgba(220,38,38,0.35)] disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:shadow-none sm:min-h-0"
            >
              {loading ? "deleting..." : "permanently delete my account"}
            </button>
            <button
              type="button"
              onClick={cancel}
              disabled={loading}
              className="inline-flex min-h-[44px] items-center justify-center rounded border border-border px-4 py-2 text-sm text-muted transition-colors hover:border-amber-500 hover:text-amber-400 disabled:opacity-50 sm:min-h-0"
            >
              cancel
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
