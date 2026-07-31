"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { PaidPlanSlug } from "@/lib/billing/plans";

// Redirects to the Stripe-hosted Checkout Session URL returned by
// /api/checkout. Stripe removed client-side redirectToCheckout() from
// @stripe/stripe-js in favor of this — a server-created session's own
// `url` — so no Stripe.js/publishable key is needed for this flow at all.
export function SubscribeButton({
  plan,
  label,
  className,
}: {
  plan: PaidPlanSlug;
  label: string;
  className: string;
}) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleClick() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plan }),
      });

      if (res.status === 401) {
        router.push(`/signup?plan=${plan}`);
        return;
      }

      const data = await res.json();
      if (!res.ok || !data.ok) {
        setError(data.error ?? "Could not start checkout.");
        return;
      }

      window.location.href = data.url;
    } catch {
      setError("Network error — please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div>
      <button type="button" onClick={handleClick} disabled={loading} className={className}>
        {loading ? "Loading..." : label}
      </button>
      {error && <p className="mt-2 text-xs text-red-400">{error}</p>}
    </div>
  );
}
