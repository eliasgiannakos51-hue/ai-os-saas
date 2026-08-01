"use client";

import { useEffect, useState } from "react";
import { MessageSquareHeart, X } from "lucide-react";

const STORAGE_KEY = "beta-feedback-banner-dismissed";

// Discrete, dismissible reminder shown to beta testers (see lib/beta.ts)
// once their account is a few days old — overview/page.tsx decides the
// "is it time yet" part server-side from the real account created_at, this
// just handles the one-time dismiss so it doesn't nag on every visit.
export function BetaFeedbackBanner({
  message,
  linkLabel,
  feedbackUrl,
}: {
  message: string;
  linkLabel: string;
  feedbackUrl: string;
}) {
  const [dismissed, setDismissed] = useState(true);

  useEffect(() => {
    try {
      setDismissed(window.localStorage.getItem(STORAGE_KEY) === "1");
    } catch {
      setDismissed(false);
    }
  }, []);

  function dismiss() {
    setDismissed(true);
    try {
      window.localStorage.setItem(STORAGE_KEY, "1");
    } catch {
      // Private browsing / storage disabled — reappears next visit, no
      // worse than not dismissing at all.
    }
  }

  if (dismissed) return null;

  return (
    <div className="mt-6 flex items-center justify-between gap-3 rounded-2xl border border-emerald-900/50 bg-emerald-950/20 px-4 py-3 text-sm">
      <div className="flex min-w-0 items-center gap-2.5">
        <MessageSquareHeart className="h-4 w-4 shrink-0 text-emerald-400" aria-hidden="true" />
        <p className="min-w-0 text-emerald-200/90">
          {message}{" "}
          <a
            href={feedbackUrl}
            target={feedbackUrl.startsWith("http") ? "_blank" : undefined}
            rel={feedbackUrl.startsWith("http") ? "noopener noreferrer" : undefined}
            className="font-medium text-emerald-400 underline underline-offset-2 transition-colors duration-150 hover:text-emerald-300"
          >
            {linkLabel}
          </a>
        </p>
      </div>
      <button
        type="button"
        onClick={dismiss}
        aria-label="Dismiss"
        className="shrink-0 rounded p-1 text-emerald-400/70 transition-colors duration-150 hover:text-emerald-300"
      >
        <X className="h-4 w-4" aria-hidden="true" />
      </button>
    </div>
  );
}
