"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { BillingInterval, PaidPlanSlug } from "@/lib/billing/plans";
import { useTranslations } from "next-intl";

// Redirects to the Stripe-hosted Checkout Session URL returned by
// /api/checkout. Stripe removed client-side redirectToCheckout() from
// @stripe/stripe-js in favor of this — a server-created session's own
// `url` — so no Stripe.js/publishable key is needed for this flow at all.
export function SubscribeButton({
  plan,
  label,
  className,
  successPath,
  interval = "month",
}: {
  plan: PaidPlanSlug;
  label: string;
  className: string;
  /** Which Stripe price to buy. Server-validated — this only decides what
   *  the request asks for, never what it is allowed to charge. */
  interval?: BillingInterval;
  // Where Stripe sends the browser back after a successful payment —
  // omit to keep the existing default (/dashboard/settings?checkout=success,
  // set server-side in api/checkout). Forwarded to /signup's own checkout
  // call too when the user isn't logged in yet (see the ?successPath= read
  // in signup-flow.tsx), so the destination survives account creation.
  successPath?: string;
}) {
  const router = useRouter();
  const tCommon = useTranslations("common");
  const t = useTranslations("pricing");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleClick() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plan, interval, ...(successPath ? { successPath } : {}) }),
      });

      if (res.status === 401) {
        const params = new URLSearchParams({ plan, interval });
        if (successPath) params.set("successPath", successPath);
        router.push(`/signup?${params.toString()}`);
        return;
      }

      const data = await res.json();
      if (!res.ok || !data.ok) {
        setError(data.error ?? t("checkoutFailed"));
        return;
      }

      // An EXISTING subscriber does not go to Stripe at all — the plan
      // change happened server-side, prorated, on the subscription they
      // already have (see api/checkout). There is no session url to
      // follow, and following `undefined` would navigate the browser to
      // the string "undefined".
      if (data.updated || data.unchanged) {
        router.push(String(data.redirectPath ?? successPath ?? "/dashboard/settings"));
        router.refresh();
        return;
      }

      window.location.href = data.url;
    } catch {
      setError(tCommon("networkError"));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div>
      <button type="button" onClick={handleClick} disabled={loading} className={className}>
        {loading ? tCommon("loading") : label}
      </button>
      {error && <p className="mt-2 text-xs text-red-400">{error}</p>}
    </div>
  );
}
