import "server-only";
import type { PaidPlanSlug, PlanSlug } from "@/lib/billing/plans";

// Maps plan slugs to Stripe Price IDs via env vars — kept separate from
// plans.ts (which is imported by client components for display) since these
// are a server-only concern.
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
