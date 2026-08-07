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
  mobileSaasBuilder: boolean;
  imageVideoGeneration: boolean;
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
      mobileSaasBuilder: false,
      imageVideoGeneration: false,
      aiMemory: false,
      teamCollaboration: false,
      chatMemoryLimit: 0,
      customAiPersona: false,
    },
    features: [
      { textKey: "1Workspace3Projects" },
      { textKey: "basicAiChat" },
      { textKey: "creditsPerMonth" },
      { textKey: "marketplaceInstallOnly" },
      { textKey: "communitySupport" },
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
      mobileSaasBuilder: false,
      imageVideoGeneration: true,
      aiMemory: true,
      teamCollaboration: false,
      chatMemoryLimit: 20,
      customAiPersona: false,
    },
    features: [
      { textKey: "unlimitedProjects" },
      { textKey: "upTo2AiAgents" },
      { textKey: "aiMemory" },
      { textKey: "websiteAutomationBuilderAccess" },
      { textKey: "imageVideoGenerationAccess" },
      { textKey: "creditsPerMonth" },
      { textKey: "emailSupport" },
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
      mobileSaasBuilder: true,
      imageVideoGeneration: true,
      aiMemory: true,
      teamCollaboration: false,
      chatMemoryLimit: 20,
      customAiPersona: false,
    },
    features: [
      { textKey: "everythingInStarter" },
      { textKey: "upTo5AiAgents" },
      { textKey: "mobileSaasBuilderAccess" },
      { textKey: "creditsPerMonth" },
      { textKey: "priorityProcessing" },
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
      mobileSaasBuilder: true,
      imageVideoGeneration: true,
      aiMemory: true,
      teamCollaboration: true,
      chatMemoryLimit: 20,
      customAiPersona: false,
    },
    features: [
      { textKey: "everythingInGrowth" },
      { textKey: "upTo15AiAgentsTeams" },
      { textKey: "teamCollaboration" },
      { textKey: "sharedAiMemory" },
      { textKey: "creditsPerMonth" },
      { textKey: "prioritySupport" },
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
      mobileSaasBuilder: true,
      imageVideoGeneration: true,
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
      { textKey: "highestPriorityProcessing" },
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
      mobileSaasBuilder: true,
      imageVideoGeneration: true,
      aiMemory: true,
      teamCollaboration: true,
      chatMemoryLimit: 100,
      customAiPersona: true,
    },
    features: [
      { textKey: "everythingInUltimate" },
      { textKey: "upTo100AiAgents" },
      { textKey: "unlimitedMembers" },
      { textKey: "dedicatedSupport" },
      { textKey: "customCredits" },
    ],
  },
];

// Ordinal rank for "does this plan meet the minimum tier" checks (page
// gating, feature gating) — index in this array, higher is better.
const PLAN_RANK: PlanSlug[] = ["free", "starter", "growth", "professional", "ultimate", "enterprise"];

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

/**
 * The plan an upgrade suggestion may name — the next SELF-SERVE plan up,
 * or null when there is nothing suggestible.
 *
 * Enterprise is deliberately never returned: it is sales-negotiated, so
 * pointing a banner at it sends the user to a pricing page with no
 * button to press. Ultimate (and Enterprise itself, and any unknown
 * slug) therefore get null, which every caller already treats as "say
 * nothing" — the correct way to address the customer on the top plan.
 */
export function nextPlanUp(slug: string): Plan | null {
  const rank = PLAN_RANK.indexOf(slug as PlanSlug);
  if (rank < 0) return null;
  const next = PLAN_RANK[rank + 1];
  if (!next || !isPaidPlanSlug(next)) return null;
  return getPlan(next) ?? null;
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
