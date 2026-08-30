"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { CheckCircle2 } from "lucide-react";

// THE RECEIPT FOR A PAYMENT THAT HAD NONE.
//
// V4.6 #11.3. api/checkout/route.ts sends Stripe a success_url of
// `/dashboard/settings?checkout=success`, and it has done since checkout
// was built. Nothing on the settings page has ever read that parameter,
// so the last thing a paying customer saw was Stripe's own page, and the
// first thing they saw afterwards was the settings screen exactly as it
// looked before — the same one they would have got by pressing Back.
//
// scripts/tests/deep-links.test.mjs is what named it: a URL that carries
// a parameter nothing at the other end reads. Three of those existed and
// this was the one that costs money.
//
// WHY IT DOES NOT ANNOUNCE THE PLAN. The subscription is applied by the
// Stripe webhook, not by this redirect, and the two race: a reader can
// arrive here before the webhook has landed. So the sentence is about
// the PAYMENT, which has definitely happened by the time Stripe
// redirects, and BillingSummary below it shows the plan whenever it is
// ready. Claiming "you are now on Pro" from a query parameter would be
// claiming it from the least reliable source in the system.
export function CheckoutNotice() {
  const t = useTranslations("settings.billing.checkout");
  const [state, setState] = useState<"success" | "cancelled" | null>(null);

  useEffect(() => {
    const value = new URLSearchParams(window.location.search).get("checkout");
    if (value === "success") setState("success");
    else if (value === "cancelled") setState("cancelled");
  }, []);

  if (!state) return null;

  return (
    <p
      role="status"
      className={
        state === "success"
          ? "mb-6 flex items-center gap-2 rounded-2xl border border-emerald-800 bg-emerald-950/30 px-4 py-3 text-xs text-emerald-400"
          : "mb-6 rounded-2xl border border-border bg-panel px-4 py-3 text-xs text-muted"
      }
    >
      {state === "success" && <CheckCircle2 className="h-4 w-4 shrink-0" aria-hidden="true" />}
      {state === "success" ? t("success") : t("cancelled")}
    </p>
  );
}
