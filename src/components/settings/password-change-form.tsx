"use client";

import { useState, type FormEvent } from "react";
import { createClient } from "@/lib/supabase/client";
import { useToast } from "@/components/toast/toast-context";
import { PasswordInput } from "@/components/ui/password-input";

export function PasswordChangeForm() {
  const supabase = createClient();
  const { addToast } = useToast();
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);

    if (newPassword !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }

    setLoading(true);
    const { error } = await supabase.auth.updateUser({ password: newPassword });
    setLoading(false);

    if (error) {
      setError(error.message);
      addToast(`✗ error: ${error.message}`, "error");
      return;
    }

    setNewPassword("");
    setConfirmPassword("");
    addToast("✓ password updated");
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="space-y-4 rounded-2xl border border-border bg-panel p-5"
    >
      <h2 className="text-sm font-semibold text-foreground">Change Password</h2>

      <label className="block text-xs text-muted">
        <span className="mb-1 block">
          new password
        </span>
        <PasswordInput
          required
          minLength={6}
          value={newPassword}
          onChange={(e) => setNewPassword(e.target.value)}
          className="input"
          placeholder="••••••••"
          autoComplete="new-password"
        />
      </label>

      <label className="block text-xs text-muted">
        <span className="mb-1 block">
          confirm password
        </span>
        <PasswordInput
          required
          minLength={6}
          value={confirmPassword}
          onChange={(e) => setConfirmPassword(e.target.value)}
          className="input"
          placeholder="••••••••"
          autoComplete="new-password"
        />
      </label>

      {error && (
        <p className="rounded-lg border border-red-900 bg-red-950/40 px-3 py-2 text-xs text-red-400">
          error: {error}
        </p>
      )}

      <button
        type="submit"
        disabled={loading}
        className="inline-flex min-h-[44px] w-full items-center justify-center rounded-lg bg-orange-500 px-4 py-2 text-sm font-semibold text-black transition-all duration-200 hover:opacity-90 hover:shadow-[0_0_16px_rgba(249,115,22,0.35)] disabled:opacity-50 sm:min-h-0 sm:w-auto"
      >
        {loading ? "Updating..." : "Update Password"}
      </button>
    </form>
  );
}
