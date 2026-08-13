import "server-only";
import {
  CREDIT_PACKS,
  type BillingInterval,
  type CreditPackId,
  type PaidPlanSlug,
  type PlanSlug,
} from "@/lib/billing/plans";

// Maps plan slugs to Stripe Price IDs via env vars — kept separate from
// plans.ts (which is imported by client components for display) since these
// are a server-only concern. Enterprise has no entry — it's Contact Sales
// only, never a self-serve Checkout session.
const PLAN_PRICE_ENV: Record<PaidPlanSlug, string | undefined> = {
  starter: process.env.STRIPE_PRICE_STARTER,
  growth: process.env.STRIPE_PRICE_GROWTH,
  professional: process.env.STRIPE_PRICE_PROFESSIONAL,
  ultimate: process.env.STRIPE_PRICE_ULTIMATE,
};

// The annual prices, one per paid plan. Separate env vars rather than a
// suffix convention so a deployment that has not created them yet simply
// has no annual option — getPlanPriceId returns undefined, the pricing
// page hides the toggle, and nothing offers a checkout that would 500.
const PLAN_PRICE_ENV_ANNUAL: Record<PaidPlanSlug, string | undefined> = {
  starter: process.env.STRIPE_PRICE_STARTER_ANNUAL,
  growth: process.env.STRIPE_PRICE_GROWTH_ANNUAL,
  professional: process.env.STRIPE_PRICE_PROFESSIONAL_ANNUAL,
  ultimate: process.env.STRIPE_PRICE_ULTIMATE_ANNUAL,
};

export function getPlanPriceId(
  slug: PaidPlanSlug,
  interval: BillingInterval = "month"
): string | undefined {
  return interval === "year" ? PLAN_PRICE_ENV_ANNUAL[slug] : PLAN_PRICE_ENV[slug];
}

/** True when every paid plan has an annual price configured. Anything
 *  less and annual is not offered at all: a toggle that works for two of
 *  four plans is worse than no toggle. */
export function annualBillingAvailable(): boolean {
  return Object.values(PLAN_PRICE_ENV_ANNUAL).every((id) => Boolean(id && id.trim()));
}

/**
 * Reverse lookup for the webhook: which plan AND which interval a Stripe
 * price belongs to.
 *
 * The interval half is what makes an annual subscription identifiable at
 * all. Without it the webhook would write the same user_metadata for a
 * €192/yr customer as for a €20/mo one, and every credit-price divisor
 * downstream would price the annual account 25% too high — silently,
 * because the stored margin is computed from the same divisor.
 */
export function getPlanFromPriceId(
  priceId: string
): { slug: PlanSlug; interval: BillingInterval } | null {
  for (const [slug, id] of Object.entries(PLAN_PRICE_ENV)) {
    if (id && id === priceId) return { slug: slug as PlanSlug, interval: "month" };
  }
  for (const [slug, id] of Object.entries(PLAN_PRICE_ENV_ANNUAL)) {
    if (id && id === priceId) return { slug: slug as PlanSlug, interval: "year" };
  }
  return null;
}

export function getPlanSlugFromPriceId(priceId: string): PlanSlug | null {
  return getPlanFromPriceId(priceId)?.slug ?? null;
}

export function getTeamSeatPriceId(): string | undefined {
  return process.env.STRIPE_PRICE_TEAM_SEAT;
}

// Stripe Price IDs for the credit packs defined in plans.ts (CREDIT_PACKS)
// — €10=500, €25=1500, €50=3500, €100=8000 credits, matching the actual
// Stripe Products created for this app. Sold via api/credits/checkout and
// granted on the "checkout.session.completed" webhook event for a
// payment-mode session.
const CREDIT_PACK_PRICE_ENV: Record<CreditPackId, string | undefined> = {
  credits_10: process.env.STRIPE_PRICE_CREDITS_10,
  credits_25: process.env.STRIPE_PRICE_CREDITS_25,
  credits_50: process.env.STRIPE_PRICE_CREDITS_50,
  credits_100: process.env.STRIPE_PRICE_CREDITS_100,
};

export function getCreditPackPriceId(id: CreditPackId): string | undefined {
  return CREDIT_PACK_PRICE_ENV[id];
}

export function getCreditAmountFromPriceId(priceId: string): number | null {
  for (const [id, envId] of Object.entries(CREDIT_PACK_PRICE_ENV)) {
    if (envId && envId === priceId) {
      return CREDIT_PACKS.find((p) => p.id === id)?.credits ?? null;
    }
  }
  return null;
}
