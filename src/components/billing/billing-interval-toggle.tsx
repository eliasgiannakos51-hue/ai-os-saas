"use client";

import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import type { BillingInterval } from "@/lib/billing/plans";

// Monthly / Annual, as a URL parameter rather than component state.
//
// /pricing is a SERVER component that renders every price, every feature
// row and the comparison table. Making the interval client state would
// mean lifting all of that into the browser to re-render two numbers.
// Putting it in the query string keeps the page server-rendered, makes
// "/pricing?billing=annual" a link someone can send, and means the
// annual view is indexable rather than invisible to search.
export function BillingIntervalToggle({
  interval,
  savingsPercent,
}: {
  interval: BillingInterval;
  savingsPercent: number;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const t = useTranslations("pricing");

  function select(next: BillingInterval) {
    if (next === interval) return;
    const query = new URLSearchParams(params.toString());
    if (next === "year") query.set("billing", "annual");
    else query.delete("billing");
    const suffix = query.toString();
    // `scroll: false` — the toggle sits below the fold on a phone, and
    // jumping to the top of the page on every press hides the very
    // numbers the press was meant to change.
    router.push(suffix ? `${pathname}?${suffix}` : pathname, { scroll: false });
  }

  const base =
    "min-h-[40px] rounded-lg px-4 py-2 text-sm font-semibold transition-colors duration-200";
  const on = "bg-orange-500 text-black";
  const off = "text-muted hover:text-foreground";

  return (
    <div className="mt-8 flex flex-col items-center gap-2">
      <div
        role="group"
        aria-label={t("billingIntervalLabel")}
        className="inline-flex items-center gap-1 rounded-xl border border-border bg-panel p-1"
      >
        <button
          type="button"
          onClick={() => select("month")}
          aria-pressed={interval === "month"}
          className={`${base} ${interval === "month" ? on : off}`}
        >
          {t("billingMonthly")}
        </button>
        <button
          type="button"
          onClick={() => select("year")}
          aria-pressed={interval === "year"}
          className={`${base} ${interval === "year" ? on : off}`}
        >
          {t("billingAnnual")}
        </button>
      </div>
      {/* The saving is stated next to the control, not only inside each
          card — it is the reason to press the thing. */}
      <p className="text-xs font-medium text-emerald-400">
        {t("billingAnnualSaving", { percent: savingsPercent })}
      </p>
    </div>
  );
}
