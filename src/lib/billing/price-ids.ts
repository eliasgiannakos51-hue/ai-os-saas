import "server-only";
import { CREDIT_PACKS, type CreditPackId, type PaidPlanSlug, type PlanSlug } from "@/lib/billing/plans";

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

export function getPlanPriceId(slug: PaidPlanSlug): string | undefined {
  return PLAN_PRICE_ENV[slug];
}

export function getPlanSlugFromPriceId(priceId: string): PlanSlug | null {
  for (const [slug, id] of Object.entries(PLAN_PRICE_ENV)) {
    if (id && id === priceId) return slug as PlanSlug;
  }
  return null;
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
