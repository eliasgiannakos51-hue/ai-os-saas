"use client";

import { useEffect, useState } from "react";
import { Clock, X } from "lucide-react";
import Link from "next/link";
import { useTranslations } from "next-intl";

const STORAGE_KEY = "beta-expiry-banner-dismissed-for";

// Discrete reminder shown only in the final BETA_ACCESS_DAYS-to-3-days
// window before a beta grant's 30-day access closes (see lib/beta.ts) —
// overview/page.tsx decides the "is it in that window" part server-side
// from the real beta_expires_at, this just handles dismiss. The dismiss
// key is stamped with the expiry timestamp itself (not a flat "1"), so a
// dismissal doesn't accidentally suppress a *different* future expiry —
// there's only ever one per account in practice, but it keeps the
// component correct if that ever changes.
export function BetaExpiryBanner({
  daysRemaining,
  expiresAtKey,
}: {
  daysRemaining: number;
  expiresAtKey: string;
}) {
  const t = useTranslations("common");
  const [dismissed, setDismissed] = useState(true);

  useEffect(() => {
    try {
      setDismissed(window.localStorage.getItem(STORAGE_KEY) === expiresAtKey);
    } catch {
      setDismissed(false);
    }
  }, [expiresAtKey]);

  function dismiss() {
    setDismissed(true);
    try {
      window.localStorage.setItem(STORAGE_KEY, expiresAtKey);
    } catch {
      // Private browsing / storage disabled — reappears next visit, no
      // worse than not dismissing at all.
    }
  }

  if (dismissed) return null;

  return (
    <div className="mt-6 flex items-center justify-between gap-3 rounded-2xl border border-orange-900/50 bg-orange-500/5 px-4 py-3 text-sm">
      <div className="flex min-w-0 items-center gap-2.5">
        <Clock className="h-4 w-4 shrink-0 text-orange-400" aria-hidden="true" />
        <p className="min-w-0 text-orange-200/90">
          Your beta access expires in {daysRemaining} day{daysRemaining === 1 ? "" : "s"}.{" "}
          <Link
            href="/pricing"
            className="font-medium text-orange-400 underline underline-offset-2 transition-colors duration-150 hover:text-orange-300"
          >
            Upgrade to keep full access
          </Link>
          .
        </p>
      </div>
      <button
        type="button"
        onClick={dismiss}
        aria-label={t("dismiss")}
        className="shrink-0 rounded p-1 text-orange-400/70 transition-colors duration-150 hover:text-orange-300"
      >
        <X className="h-4 w-4" aria-hidden="true" />
      </button>
    </div>
  );
}
