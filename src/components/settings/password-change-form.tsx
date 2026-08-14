"use client";

import { useState, type FormEvent } from "react";
import { useTranslations } from "next-intl";
import { createClient } from "@/lib/supabase/client";
import { useToast } from "@/components/toast/toast-context";
import { PasswordInput } from "@/components/ui/password-input";
import { PasswordStrengthChecklist } from "@/components/auth/password-strength-checklist";
import { isPasswordStrong } from "@/lib/password-strength";
import { getErrorMessage } from "@/lib/get-error-message";

export function PasswordChangeForm() {
  const t = useTranslations("settings.changePassword");
  const supabase = createClient();
  const { addToast } = useToast();
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);

    if (!isPasswordStrong(newPassword)) {
      setError(t("requirementsNotMet"));
      return;
    }
    if (newPassword !== confirmPassword) {
      setError(t("passwordsDoNotMatch"));
      return;
    }

    setLoading(true);
    try {
      const { error } = await supabase.auth.updateUser({ password: newPassword });

      if (error) {
        // eslint-disable-next-line no-console
        console.error("Password change error:", error);
        setError(getErrorMessage(error));
        addToast(t("couldNotUpdate"), "error");
        return;
      }

      setNewPassword("");
      setConfirmPassword("");
      addToast(t("passwordUpdated"));
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error("Password change threw:", err);
      setError(getErrorMessage(err));
      addToast(t("couldNotUpdate"), "error");
    } finally {
      setLoading(false);
    }
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="space-y-4 rounded-2xl border border-border bg-panel p-5"
    >
      <h2 className="text-sm font-semibold text-foreground">{t("title")}</h2>

      <label className="block text-xs text-muted">
        <span className="mb-1 block">
          {t("newPassword")}
        </span>
        <PasswordInput
          required
          minLength={8}
          value={newPassword}
          onChange={(e) => setNewPassword(e.target.value)}
          className="input"
          placeholder="••••••••"
          autoComplete="new-password"
        />
      </label>

      {newPassword && (
        <PasswordStrengthChecklist password={newPassword} />
      )}

      <label className="block text-xs text-muted">
        <span className="mb-1 block">
          {t("confirmPassword")}
        </span>
        <PasswordInput
          required
          minLength={8}
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
        className="inline-flex min-h-[44px] w-full items-center justify-center rounded-lg bg-orange-500 px-4 py-2 text-sm font-semibold text-black transition-all duration-200 hover:opacity-90 hover:shadow-[0_0_16px_rgba(249,115,22,0.35)] disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto"
      >
        {loading ? t("updating") : t("updatePassword")}
      </button>
    </form>
  );
}
