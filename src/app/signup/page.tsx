import type { Metadata } from "next";
import { getLocale, getTranslations } from "next-intl/server";
import { pageTitleAndDescription } from "@/lib/page-title";
import { CURRENCY_SYMBOL, PLANS, TEAM_SEAT_PRICE } from "@/lib/billing/plans";
import { capabilityRowsFor } from "@/lib/billing/plan-capability-rows";
import type { CellWords } from "@/lib/billing/feature-catalog";
import { SignupFlow, type PlanCapabilityRows } from "./signup-flow";

export function generateMetadata(): Promise<Metadata> {
  return pageTitleAndDescription("landing.signUp", "pageTitle.signUpDescription");
}

/**
 * THE ROWS ARE BUILT HERE, ON THE SERVER, AND THAT IS NOT A STYLE
 * CHOICE. lib/billing/feature-catalog.ts reaches the per-plan limit
 * modules — files/limits.ts, integrations/limits.ts, publish-limits.ts
 * and four more — and every one of them reads process.env. In a client
 * bundle `process.env.X` is undefined unless it is NEXT_PUBLIC_, so a
 * card built in the browser would quote whatever a missing variable
 * falls back to and show the customer a number the server would never
 * charge them by.
 *
 * scripts/tests/client-env-reach.test.mjs caught exactly that when the
 * first version of this imported the catalog into signup-flow.tsx: eight
 * modules, reached through one import, reported by name.
 */
export default async function SignupPage() {
  const t = await getTranslations("pricing");
  const locale = await getLocale();
  const words: CellWords = {
    unlimited: t("values.unlimited"),
    included: t("values.included"),
    custom: t("values.custom"),
    perSeat: t("values.perSeat", { currency: CURRENCY_SYMBOL, price: TEAM_SEAT_PRICE }),
    perHour: t("values.perHour"),
    perDay: t("values.perDay"),
    minutesPerMonth: t("values.minutesPerMonth"),
  };
  // Plain data across the boundary: an id and a cell, both serialisable.
  const rows: PlanCapabilityRows = Object.fromEntries(
    PLANS.map((plan) => [plan.slug, capabilityRowsFor(plan, words, locale)])
  );
  return <SignupFlow capabilityRows={rows} />;
}
