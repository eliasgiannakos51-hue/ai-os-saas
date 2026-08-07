"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Loader2, UserPlus } from "lucide-react";

/**
 * The accept button. The server page has already decided what state the
 * visitor is in (signed out, wrong account, valid) — this component only
 * exists because the claim must be a POST: a GET that grants access
 * would be triggered by link prefetchers and mail scanners, which open
 * every URL in an email before the human does.
 */
export function AcceptInvite({ token }: { token: string }) {
  const t = useTranslations("collaboration");
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const accept = async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/collaboration/accept", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.ok) {
        setError(typeof data?.error === "string" ? data.error : t("acceptFailed"));
        setBusy(false);
        return;
      }
      router.push("/dashboard/mission");
    } catch {
      setError(t("acceptFailed"));
      setBusy(false);
    }
  };

  return (
    <div className="space-y-3">
      <button
        type="button"
        onClick={accept}
        disabled={busy}
        className="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-xl bg-orange-500 px-5 py-2 text-sm font-semibold text-black transition-all duration-200 hover:opacity-90 disabled:opacity-50"
      >
        {busy ? (
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
        ) : (
          <UserPlus className="h-4 w-4" aria-hidden="true" />
        )}
        {t("acceptButton")}
      </button>
      {error ? <p className="text-xs text-red-400">{error}</p> : null}
    </div>
  );
}
