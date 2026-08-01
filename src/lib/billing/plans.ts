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

export type PlanFeature = { text: string };

// Real, enforced entitlements for this plan — checked server-side wherever
// the corresponding feature/page/action actually exists. Every plan's
// `features` list below only ever lists things that are actually live
// today — nothing marked "Coming Soon"/pending; if a feature isn't real
// yet, it simply isn't listed anywhere on this plan.
export type PlanCapabilities = {
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
      maxAiAgents: 2,
      websiteBuilder: false,
      mobileSaasBuilder: false,
      imageVideoGeneration: false,
      aiMemory: false,
      teamCollaboration: false,
      chatMemoryLimit: 0,
      customAiPersona: false,
    },
    features: [
      { text: "1 workspace, 3 projects" },
      { text: "2 AI agents" },
      { text: "Basic AI chat" },
      { text: "100 credits/month" },
      { text: "Marketplace: install only" },
      { text: "Community support" },
    ],
  },
  {
    slug: "starter",
    name: "Starter",
    price: 20,
    monthlyCredits: 1000,
    hasTeamSeats: false,
    capabilities: {
      maxAiAgents: 20,
      websiteBuilder: true,
      mobileSaasBuilder: false,
      imageVideoGeneration: true,
      aiMemory: true,
      teamCollaboration: false,
      chatMemoryLimit: 20,
      customAiPersona: false,
    },
    features: [
      { text: "Unlimited projects" },
      { text: "Up to 20 AI agents" },
      { text: "AI Memory" },
      { text: "Website & Automation Builder access" },
      { text: "Image & video generation access" },
      { text: "1,000 credits/month" },
      { text: "Email support" },
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
      maxAiAgents: 100,
      websiteBuilder: true,
      mobileSaasBuilder: true,
      imageVideoGeneration: true,
      aiMemory: true,
      teamCollaboration: false,
      chatMemoryLimit: 20,
      customAiPersona: false,
    },
    features: [
      { text: "Everything in Starter" },
      { text: "Up to 100 AI agents" },
      { text: "Mobile & SaaS Builder access" },
      { text: "3,000 credits/month" },
      { text: "Priority processing" },
    ],
  },
  {
    slug: "professional",
    name: "Professional",
    price: 100,
    monthlyCredits: 10000,
    hasTeamSeats: true,
    capabilities: {
      maxAiAgents: "unlimited",
      websiteBuilder: true,
      mobileSaasBuilder: true,
      imageVideoGeneration: true,
      aiMemory: true,
      teamCollaboration: true,
      chatMemoryLimit: 20,
      customAiPersona: false,
    },
    features: [
      { text: "Everything in Growth" },
      { text: "Unlimited AI agents & teams" },
      { text: "Team collaboration" },
      { text: "Shared AI memory" },
      { text: "10,000 credits/month" },
      { text: "Priority support" },
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
      maxAiAgents: "unlimited",
      websiteBuilder: true,
      mobileSaasBuilder: true,
      imageVideoGeneration: true,
      aiMemory: true,
      teamCollaboration: true,
      chatMemoryLimit: 100,
      customAiPersona: true,
    },
    features: [
      { text: "Everything in Professional" },
      { text: "Unlimited team seats included — no per-member charge" },
      { text: "Extended chat memory retention (100 vs 20 recent facts)" },
      { text: "Custom AI persona name in Ionexa Chat" },
      { text: "25,000 credits/month" },
      { text: "Highest priority processing" },
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
      maxAiAgents: "unlimited",
      websiteBuilder: true,
      mobileSaasBuilder: true,
      imageVideoGeneration: true,
      aiMemory: true,
      teamCollaboration: true,
      chatMemoryLimit: 100,
      customAiPersona: true,
    },
    features: [
      { text: "Everything in Ultimate" },
      { text: "Unlimited members" },
      { text: "Dedicated support" },
      { text: "Custom credits" },
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
