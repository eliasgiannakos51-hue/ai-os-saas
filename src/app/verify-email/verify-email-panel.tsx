"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { MailCheck } from "lucide-react";
import { Earth } from "@/components/brand/earth";

type State = "idle" | "sending" | "sent" | "failed" | "rate_limited" | "signed_out";

// Reads ?error= from window.location rather than useSearchParams(), like
// the other account pages, so the page needs no Suspense boundary.
export function VerifyEmailPanel() {
  const t = useTranslations("auth.verifyEmail");
  const [linkInvalid, setLinkInvalid] = useState(false);
  const [state, setState] = useState<State>("idle");

  useEffect(() => {
    setLinkInvalid(new URLSearchParams(window.location.search).has("error"));
  }, []);

  async function resend() {
    setState("sending");
    try {
      const res = await fetch("/api/auth/resend-confirmation", { method: "POST" });
      const data = (await res.json().catch(() => ({}))) as { ok?: boolean; code?: string; alreadyConfirmed?: boolean };
      if (data.alreadyConfirmed) {
        window.location.href = "/dashboard/overview";
        return;
      }
      if (res.status === 401) return setState("signed_out");
      if (res.status === 429) return setState("rate_limited");
      setState(res.ok && data.ok ? "sent" : "failed");
    } catch {
      setState("failed");
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center overflow-x-hidden bg-background px-4">
      <div className="w-full max-w-md text-center">
        <div className="mb-6 flex items-center justify-center">
          <Earth variant="large" px={160} label="Ionexa" />
        </div>
        <div className="rounded-card bg-panel p-6">
          <h1 className="flex items-center justify-center gap-2 text-lg font-semibold text-foreground">
            <MailCheck className="h-5 w-5" aria-hidden /> {t("title")}
          </h1>
          <p className="mt-3 text-sm text-muted">{linkInvalid ? t("linkInvalid") : t("body")}</p>
          {state === "sent" ? (
            <p className="mt-4 text-sm text-success">{t("sent")}</p>
          ) : state === "signed_out" ? (
            <p className="mt-4 text-sm text-muted">{t("signedOut")}</p>
          ) : (
            <>
              {state === "failed" && <p className="mt-4 text-xs text-danger">{t("failed")}</p>}
              {state === "rate_limited" && <p className="mt-4 text-xs text-danger">{t("rateLimited")}</p>}
              <button
                type="button"
                onClick={() => void resend()}
                disabled={state === "sending"}
                className="mt-5 min-h-[44px] rounded-item border border-foreground/60 px-4 text-sm font-semibold text-foreground hover:bg-foreground/10 disabled:opacity-50"
              >
                {state === "sending" ? t("sending") : t("resend")}
              </button>
            </>
          )}
        </div>
      </div>
    </main>
  );
}
