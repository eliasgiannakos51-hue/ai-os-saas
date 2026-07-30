// Plan metadata for display (pricing page, Settings). No Stripe price IDs
// here on purpose — this file is imported by client components, and price
// IDs are a server-only concern (see price-ids.ts).
export type PlanSlug = "free" | "starter" | "growth" | "professional" | "ultimate";
export type PaidPlanSlug = Exclude<PlanSlug, "free">;

export type PlanFeature = { text: string; comingSoon?: boolean };

export type Plan = {
  slug: PlanSlug;
  name: string;
  price: number; // USD/month, 0 for Free
  aiRequestsPerMonth: number | "unlimited";
  features: PlanFeature[];
  hasTeamSeats: boolean;
  highlighted?: boolean;
};

export const TEAM_SEAT_PRICE_USD = 20;

export const PLANS: Plan[] = [
  {
    slug: "free",
    name: "Free",
    price: 0,
    aiRequestsPerMonth: 20,
    hasTeamSeats: false,
    features: [
      { text: "Access to all 13 modules" },
      { text: "20 AI requests/month (Create Anything + Veron Chat combined)" },
      { text: "Veron Chat history: 7 days" },
    ],
  },
  {
    slug: "starter",
    name: "Starter",
    price: 20,
    aiRequestsPerMonth: 200,
    hasTeamSeats: true,
    features: [
      { text: "Everything in Free" },
      { text: "200 AI requests/month" },
      { text: "CSV export on every module" },
      { text: "Unlimited Veron Chat history + pinned conversations" },
    ],
  },
  {
    slug: "growth",
    name: "Growth",
    price: 50,
    aiRequestsPerMonth: 750,
    hasTeamSeats: true,
    highlighted: true,
    features: [
      { text: "Everything in Starter" },
      { text: "750 AI requests/month" },
      { text: "Full data export (JSON, all modules)" },
      { text: "Automation Builder", comingSoon: true },
    ],
  },
  {
    slug: "professional",
    name: "Professional",
    price: 100,
    aiRequestsPerMonth: 2500,
    hasTeamSeats: true,
    features: [
      { text: "Everything in Growth" },
      { text: "2,500 AI requests/month" },
      { text: "Priority email support" },
      { text: "AI Agent Builder", comingSoon: true },
      { text: "Website Builder", comingSoon: true },
    ],
  },
  {
    slug: "ultimate",
    name: "Ultimate",
    price: 200,
    aiRequestsPerMonth: "unlimited",
    hasTeamSeats: true,
    features: [
      { text: "Everything in Professional" },
      { text: "Unlimited AI requests" },
      { text: "Dedicated support" },
      { text: "Video/Image Studio", comingSoon: true },
      { text: "Marketplace access", comingSoon: true },
    ],
  },
];

export function getPlan(slug: string): Plan | undefined {
  return PLANS.find((p) => p.slug === slug);
}

export function isPaidPlanSlug(slug: string): slug is PaidPlanSlug {
  return slug !== "free" && PLANS.some((p) => p.slug === slug);
}
