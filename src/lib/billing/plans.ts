// Plan metadata for display (pricing page, Settings) and for the real
// entitlement checks enforced server-side (credit costs in
// lib/billing/credits.ts, page/creation gating driven by `capabilities`
// below). No Stripe price IDs here on purpose — this file is imported by
// client components, and price IDs are a server-only concern (see
// price-ids.ts).
export type PlanSlug = "free" | "starter" | "growth" | "professional" | "ultimate" | "enterprise";

// Every plan except Enterprise has a real Stripe Price ID and can start a
// self-serve Checkout session — Enterprise is "Contact Sales" only (custom
// pricing, no fixed price to charge). Kept as `PaidPlanSlug` too since
// that's the name existing call sites (subscribe-button.tsx, api/checkout,
// signup-flow.tsx) already import for "can this slug start a self-serve
// Stripe checkout".
export type SelfServePlanSlug = Exclude<PlanSlug, "free" | "enterprise">;
export type PaidPlanSlug = SelfServePlanSlug;

// All prices (plans and credit packs) are in EUR — every Stripe Product
// backing this app was created in EUR.
export const CURRENCY_SYMBOL = "€";

// i18n key under pricing.features.<textKey>. Was a raw English `text`
// string until the V1+V2 audit: these render on /pricing and /signup,
// the two pages a non-English visitor is most likely to see FIRST, and
// every one of them stayed English in all ten locales. The pre-formatted
// numbers in them ("1,000 credits/month") also carried English digit
// grouping into Greek and German pages.
export type PlanFeature = { textKey: string };

// Real, enforced entitlements for this plan — checked server-side wherever
// the corresponding feature/page/action actually exists. Every plan's
// `features` list below only ever lists things that are actually live
// today — nothing marked "Coming Soon"/pending; if a feature isn't real
// yet, it simply isn't listed anywhere on this plan.
export type PlanCapabilities = {
  // How many AUTONOMOUS AGENTS this plan may own — real agents that run on
  // a schedule on our infrastructure (V3 Task 1: user_agents + agent_runs,
  // enforced in lib/agents/agent-limits.ts, which also lets every number
  // here be overridden per-deployment via AGENT_LIMIT_<PLAN>).
  //
  // It used to mean something else: a row-count ceiling on the `ai_agents`
  // TRACKER, a table of hand-typed notes that never ran anything. The old
  // numbers (2/20/100/unlimited) were sized for that — for rows in a table.
  // They are not defensible for a thing that calls Anthropic and sends an
  // email on a schedule forever with no further consent: "unlimited"
  // literally meant unbounded recurring cost per account. The numbers below
  // are the real allowances, and Free is zero because an agent is the one
  // feature that spends money while nobody is looking.
  maxAiAgents: number | "unlimited";
  websiteBuilder: boolean;
  aiMemory: boolean;
  teamCollaboration: boolean;
  // How many chat_memory entries (see lib/chat/memory.ts) get loaded as
  // context on each Ionexa Chat message — Ultimate's "extended chat
  // memory retention" differentiator vs Professional.
  chatMemoryLimit: number;
  // Lets the account rename the assistant persona in Ionexa Chat (see
  // Settings > AI Persona, wired into api/chat's system prompt) — one of
  // Ultimate's real differentiators vs Professional.
  customAiPersona: boolean;
};

export type Plan = {
  slug: PlanSlug;
  name: string;
  price: number | "custom"; // EUR/month, 0 for Free, "custom" for Enterprise
  monthlyCredits: number | "custom";
  capabilities: PlanCapabilities;
  features: PlanFeature[];
  hasTeamSeats: boolean;
  // true when team seats are included at no extra charge (Ultimate,
  // Enterprise) rather than the +€20/member/month add-on Professional
  // charges — see api/checkout/route.ts, which skips the team-seat Stripe
  // line item entirely for these plans.
  teamSeatsIncluded?: boolean;
  highlighted?: boolean;
};

export const TEAM_SEAT_PRICE = 20;

// ---------------------------------------------------------------------
// Annual billing
// ---------------------------------------------------------------------
//
// Two months free, expressed as a 20% discount on twelve months:
// Starter 20 x 12 = 240 -> 192. The percentage is the single source of
// truth and every displayed figure is derived from it, so the pricing
// page, the checkout and the Stripe setup instructions cannot drift apart
// the way three hand-typed numbers would.
//
// WHAT ANNUAL DOES *NOT* CHANGE: the credit allowance. An annual customer
// gets `monthlyCredits` every month, not 12x in one lump on day one. A
// year's credits handed over at once is a year's cost we might absorb in
// week one, and it turns a refund request into an arithmetic problem.
// Enforced in api/cron/monthly-credits, which is the only thing that
// grants an annual subscriber's monthly allowance.

export type BillingInterval = "month" | "year";

export function isBillingInterval(value: unknown): value is BillingInterval {
  return value === "month" || value === "year";
}

/**
 * TWO MONTHS FREE, and the price is derived from that rather than from a
 * percentage chosen next to it.
 *
 * This was `ANNUAL_DISCOUNT_PERCENT = 20` while the badge beside it read
 * "Save {percent}% — two months free". Those disagreed: 20% off twelve
 * months is 2.4 months free, so the copy understated what the customer
 * actually got and the two numbers had no way to stay in step. Anchoring
 * on the MONTHS makes the sentence literally true and leaves the
 * percentage as a display of it, not a second source of truth.
 */
export const ANNUAL_MONTHS_CHARGED = 10;
export const ANNUAL_MONTHS_FREE = 12 - ANNUAL_MONTHS_CHARGED;

/** 2/12 is 16.67%, which the pricing badge shows as 17. Derived, so the
 *  badge cannot drift from the amount billed. */
export const ANNUAL_DISCOUNT_PERCENT = Math.round((ANNUAL_MONTHS_FREE / 12) * 100);

/** What a year costs up front. Null for Free and Enterprise. */
export function annualPriceEur(plan: Pick<Plan, "price">): number | null {
  if (typeof plan.price !== "number" || plan.price <= 0) return null;
  // Rounded to whole euros: every monthly price in this product is a whole
  // number and 20% of 12x a whole number always is too, but rounding here
  // means a future 15% or a 19.99 price cannot produce a Stripe amount
  // with sub-cent drift.
  // Charged for ten months. NOT `price * 12 * (1 - percent/100)`, which
  // rounds a percentage back into euros and lands on €192 for a €20 plan
  // — a number no customer can derive from "two months free".
  return Math.round(plan.price * ANNUAL_MONTHS_CHARGED);
}

/** The "€16/month, billed annually" figure. Null where annual does not
 *  apply. Not rounded — it is a display of a division, and rounding it
 *  would make 12x it disagree with the price actually charged. */
export function annualMonthlyEquivalentEur(plan: Pick<Plan, "price">): number | null {
  const annual = annualPriceEur(plan);
  return annual === null ? null : annual / 12;
}

/** Euros saved over a year by paying annually. */
export function annualSavingsEur(plan: Pick<Plan, "price">): number | null {
  const annual = annualPriceEur(plan);
  if (annual === null || typeof plan.price !== "number") return null;
  return plan.price * 12 - annual;
}

/**
 * What a credit is WORTH on this plan at this interval — the divisor the
 * margin guarantee is taken against.
 *
 * Annual billing sells the same credits for 20% less, so an annual
 * subscriber's credit is cheaper and the settlement formula has to divide
 * by the smaller number or the multiplier quietly drops by that 20%. This
 * is the identical leak the plan-rate and credit-pack fixes already
 * closed, arriving through a third door — see credit-formula.ts.
 */
export function planCreditPriceEur(
  plan: Pick<Plan, "price" | "monthlyCredits"> | null | undefined,
  interval: BillingInterval
): number | null {
  if (!plan) return null;
  if (typeof plan.price !== "number" || typeof plan.monthlyCredits !== "number") return null;
  if (plan.price <= 0 || plan.monthlyCredits <= 0) return null;
  if (interval === "month") return plan.price / plan.monthlyCredits;
  const annual = annualPriceEur(plan);
  if (annual === null) return null;
  // A year's money over a year's credits.
  return annual / (plan.monthlyCredits * 12);
}

export const PLANS: Plan[] = [
  {
    slug: "free",
    name: "Free",
    price: 0,
    monthlyCredits: 100,
    hasTeamSeats: false,
    capabilities: {
      maxAiAgents: 0,
      websiteBuilder: false,
      aiMemory: false,
      teamCollaboration: false,
      chatMemoryLimit: 0,
      customAiPersona: false,
    },
    features: [
      { textKey: "basicAiChat" },
      { textKey: "creditsPerMonth" },
    ],
  },
  {
    slug: "starter",
    name: "Starter",
    price: 20,
    monthlyCredits: 1000,
    hasTeamSeats: false,
    capabilities: {
      maxAiAgents: 2,
      websiteBuilder: true,
      aiMemory: true,
      teamCollaboration: false,
      chatMemoryLimit: 20,
      customAiPersona: false,
    },
    features: [
      { textKey: "upTo2AiAgents" },
      { textKey: "aiMemory" },
      { textKey: "websiteAutomationBuilderAccess" },
      { textKey: "creditsPerMonth" },
    ],
  },
  {
    slug: "growth",
    name: "Growth",
    price: 50,
    monthlyCredits: 3000,
    hasTeamSeats: false,
    highlighted: true,
    capabilities: {
      maxAiAgents: 5,
      websiteBuilder: true,
      aiMemory: true,
      teamCollaboration: false,
      chatMemoryLimit: 20,
      customAiPersona: false,
    },
    features: [
      { textKey: "everythingInStarter" },
      { textKey: "upTo5AiAgents" },
      { textKey: "creditsPerMonth" },
    ],
  },
  {
    slug: "professional",
    name: "Professional",
    price: 100,
    monthlyCredits: 10000,
    hasTeamSeats: true,
    capabilities: {
      maxAiAgents: 15,
      websiteBuilder: true,
      aiMemory: true,
      teamCollaboration: true,
      chatMemoryLimit: 20,
      customAiPersona: false,
    },
    features: [
      { textKey: "everythingInGrowth" },
      { textKey: "upTo15AiAgentsTeams" },
      { textKey: "teamCollaboration" },
      { textKey: "creditsPerMonth" },
    ],
  },
  {
    slug: "ultimate",
    name: "Ultimate",
    price: 200,
    monthlyCredits: 25000,
    hasTeamSeats: true,
    teamSeatsIncluded: true,
    capabilities: {
      maxAiAgents: 50,
      websiteBuilder: true,
      aiMemory: true,
      teamCollaboration: true,
      chatMemoryLimit: 100,
      customAiPersona: true,
    },
    features: [
      { textKey: "everythingInProfessional" },
      { textKey: "upTo50AiAgents" },
      { textKey: "unlimitedTeamSeatsIncludedNoPerMemberCharge" },
      { textKey: "extendedChatMemoryRetention100Vs20RecentFact" },
      { textKey: "customAiPersonaNameInIonexaChat" },
      { textKey: "creditsPerMonth" },
    ],
  },
  {
    slug: "enterprise",
    name: "Enterprise",
    price: "custom",
    monthlyCredits: "custom",
    hasTeamSeats: true,
    teamSeatsIncluded: true,
    capabilities: {
      maxAiAgents: 100,
      websiteBuilder: true,
      aiMemory: true,
      teamCollaboration: true,
      chatMemoryLimit: 100,
      customAiPersona: true,
    },
    features: [
      { textKey: "everythingInUltimate" },
      { textKey: "upTo100AiAgents" },
      { textKey: "unlimitedMembers" },
      { textKey: "customCredits" },
    ],
  },
];

// Ordinal rank for "does this plan meet the minimum tier" checks (page
// gating, feature gating) — index in this array, higher is better.
const PLAN_RANK: PlanSlug[] = ["free", "starter", "growth", "professional", "ultimate", "enterprise"];

/**
 * The better of two tiers.
 *
 * Exists because an account can hold entitlements from two independent
 * sources — what they pay for themselves, and what a team owner grants
 * them — and the answer has to be the higher of the two rather than
 * whichever was written last. Writing one over the other is what let
 * leaving a team take away a subscription the person was still paying
 * for.
 *
 * An unknown slug ranks below "free", so a corrupt value can never win.
 */
export function higherPlanSlug(a: string | null | undefined, b: string | null | undefined): PlanSlug {
  const rank = (slug: string | null | undefined) => PLAN_RANK.indexOf(String(slug ?? "") as PlanSlug);
  const rankA = rank(a);
  const rankB = rank(b);
  if (rankA < 0 && rankB < 0) return "free";
  return rankA >= rankB ? (a as PlanSlug) : (b as PlanSlug);
}

export function getPlan(slug: string): Plan | undefined {
  return PLANS.find((p) => p.slug === slug);
}

export function isPaidPlanSlug(slug: string): slug is PaidPlanSlug {
  return PLANS.some((p) => p.slug === slug && p.slug !== "free" && p.slug !== "enterprise");
}

export function planMeetsMinimum(tier: string, minimum: PlanSlug): boolean {
  const tierRank = PLAN_RANK.indexOf(tier as PlanSlug);
  const minRank = PLAN_RANK.indexOf(minimum);
  return tierRank >= 0 && tierRank >= minRank;
}

// One-time credit packs (mode: "payment", not a subscription) — display
// metadata only, client-safe. Stripe Price IDs live in price-ids.ts
// (server-only) keyed by the same `id`. Amounts/prices match the actual
// Stripe Products created for this app (EUR).
export type CreditPackId = "credits_10" | "credits_25" | "credits_50" | "credits_100";

export const CREDIT_PACKS: { id: CreditPackId; price: number; credits: number }[] = [
  { id: "credits_10", price: 10, credits: 500 },
  { id: "credits_25", price: 25, credits: 1500 },
  { id: "credits_50", price: 50, credits: 3500 },
  { id: "credits_100", price: 100, credits: 8000 },
];

export function getCreditPack(id: string): { id: CreditPackId; price: number; credits: number } | undefined {
  return CREDIT_PACKS.find((p) => p.id === id);
}

/**
 * What one credit from this pack actually cost the buyer, in EUR. Settlement
 * divides by this (via effectiveCreditPriceEurForAccount) instead of the
 * €0.02 list price, so the margin multiplier holds on the money that was
 * really paid — the bulk discount on the big packs is otherwise taken
 * straight out of margin. See credit-formula.ts for the full derivation.
 */
export function creditPackPriceEurPerCredit(pack: { price: number; credits: number }): number {
  if (pack.credits <= 0) return 0;
  return pack.price / pack.credits;
}
