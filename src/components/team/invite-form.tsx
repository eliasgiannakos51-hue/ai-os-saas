"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { UserPlus } from "lucide-react";
import { getErrorMessage } from "@/lib/get-error-message";

export function InviteForm() {
  const router = useRouter();
  const t = useTranslations("dashboard.team");
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSuccess(null);
    setLoading(true);

    try {
      const res = await fetch("/api/team/invite", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const data = await res.json();

      if (!res.ok || !data.ok) {
        setError(getErrorMessage(data.error, t("inviteFailed")));
        return;
      }

      setSuccess(t("inviteSent", { email }));
      setEmail("");
      router.refresh();
    } catch {
      setError("Network error — please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3 rounded-2xl border border-border bg-panel p-5">
      <h2 className="text-sm font-semibold text-foreground">{t("inviteTitle")}</h2>
      <div className="flex flex-col gap-2 sm:flex-row">
        <input
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder={t("emailPlaceholder")}
          className="input flex-1"
        />
        <button
          type="submit"
          disabled={loading}
          className="inline-flex min-h-[44px] items-center justify-center gap-1.5 rounded-xl bg-orange-500 px-4 py-2 text-sm font-semibold text-black transition-all duration-200 hover:opacity-90 hover:shadow-[0_0_16px_rgba(249,115,22,0.35)] disabled:cursor-not-allowed disabled:opacity-50 sm:min-h-0"
        >
          <UserPlus className="h-4 w-4" />
          {loading ? t("sending") : t("sendInvite")}
        </button>
      </div>
      {error && (
        <p className="rounded-lg border border-red-900 bg-red-950/40 px-3 py-2 text-xs text-red-400">
          {error}
        </p>
      )}
      {success && (
        <p className="rounded-lg border border-emerald-800 bg-emerald-950/30 px-3 py-2 text-xs text-emerald-400">
          {success}
        </p>
      )}
    </form>
  );
}
