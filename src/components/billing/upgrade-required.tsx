"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import { Lock } from "lucide-react";
import { CURRENCY_SYMBOL } from "@/lib/billing/plans";

/**
 * THE WALL A LOCKED FEATURE PUTS UP, AND THE FOUR THINGS IT HAS TO SAY.
 *
 * WHAT — the feature, by the name the screen it is on uses.
 * WHICH PLAN — the plan it unlocks on, by name.
 * HOW MUCH — that plan's price, in euros, per month.
 * AND A BUTTON THAT GOES THERE — not to /pricing, to that plan's card.
 *
 * THE THIRD AND FOURTH WERE MISSING. "AI Agents requires the Starter
 * plan or higher" and a link to the top of /pricing: a person who wanted
 * the feature then had to find the plan among seven cards and work out
 * what it cost. "Αναβάθμισε" with no price is a request to go and look
 * something up, and most people do not.
 *
 * THE PLAN IS DERIVED, NOT PASSED AS A WORD. Three of the four call
 * sites passed `planName="Starter"` as a literal, which is a claim about
 * a gate in another file: moving AI Memory to Growth would have left
 * three screens telling people to buy Starter, in a green build, with no
 * test able to see it. `featureId` names a row of
 * lib/billing/feature-catalog.ts and the plan comes from its `minPlan` —
 * the same field the gate reads. scripts/tests/feature-catalog.test.mjs
 * fails the build if a paid feature cannot produce a named, priced plan.
 */
export function UpgradeRequired({
  featureName,
  planName,
  planSlug,
  priceEur,
}: {
  featureName: string;
  planName: string;
  /** Deep-links the button at that plan's card. */
  planSlug: string;
  /** EUR per month, or null for Enterprise, which is a conversation
   *  rather than a price — the button then says "talk to us" instead of
   *  quoting a number nobody can pay. */
  priceEur: number | null;
}) {
  const t = useTranslations("common");
  return (
    <div className="flex flex-col items-center gap-3 rounded-2xl border border-border bg-panel p-10 text-center">
      <Lock className="h-8 w-8 text-orange-400" aria-hidden="true" />
      <h2 className="text-sm font-semibold text-foreground">{t("upgradeRequired.title")}</h2>
      <p className="max-w-sm text-xs text-muted">
        {t("upgradeRequired.body", { feature: featureName, plan: planName })}
      </p>
      <p className="text-sm font-semibold text-foreground">
        {priceEur === null
          ? t("upgradeRequired.customPrice", { plan: planName })
          : t("upgradeRequired.price", {
              plan: planName,
              amount: `${CURRENCY_SYMBOL}${priceEur}`,
            })}
      </p>
      <Link
        // THE PLAN'S OWN CARD, not the top of the page. The id is
        // rendered by app/pricing/page.tsx on each card's wrapper, so the
        // browser scrolls to the thing the sentence above just named.
        href={`/pricing#plan-${planSlug}`}
        className="mt-2 inline-flex min-h-[44px] items-center justify-center rounded-lg bg-orange-500 px-4 py-2 text-sm font-semibold text-black transition-all duration-200 hover:opacity-90"
      >
        {t("upgradeRequired.cta", { plan: planName })}
      </Link>
    </div>
  );
}
