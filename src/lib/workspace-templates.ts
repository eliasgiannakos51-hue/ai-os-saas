// "Quick Start" templates (see components/overview/quick-start-modal.tsx
// and api/templates/apply/route.ts) — each inserts 2-3 rows into a handful
// of module tables so a brand-new, empty workspace immediately shows what
// a filled-in one looks like. Every headline is suffixed "(example)" and
// every free-text body mentions it's demo data, so it's never mistaken for
// real content. Only modules with no minPlanSlug gate are used here (see
// lib/modules.ts / lib/build-modules.ts) — a demo row in a plan-gated
// Build module (websites/apps/images/videos) would be invisible to
// whichever plan the account is actually on, which would be confusing
// rather than helpful. Credits are intentionally not charged for any of
// this — see api/templates/apply/route.ts.
export type WorkspaceTemplateEntry = {
  table: string;
  payload: Record<string, string | number | null>;
};

export type WorkspaceTemplate = {
  id: string;
  name: string;
  description: string;
  entries: WorkspaceTemplateEntry[];
};

export const WORKSPACE_TEMPLATES: WorkspaceTemplate[] = [
  {
    id: "startup",
    name: "Startup",
    description: "An idea, a competitor, and a research note — the first three things any founder logs.",
    entries: [
      {
        table: "ideas",
        payload: {
          name: "AI-powered expense tracker (example)",
          problem: "Freelancers struggle to track deductible expenses across multiple apps.",
          customer: "Freelancers and solo consultants",
          mvp: "A single dashboard that auto-categorizes expenses from bank CSV imports.",
          verdict: "pursue",
        },
      },
      {
        table: "competitors",
        payload: {
          company: "Expensify (example)",
          product: "Expense tracking app",
          pricing: "$5-36/mo",
          strengths: "Established brand, wide integrations",
          weaknesses: "Complex UI for solo users — demo data, safe to delete.",
        },
      },
      {
        table: "research",
        payload: {
          topic: "Freelancer expense management market (example)",
          summary: "TAM estimated at $2B, growing ~12% YoY as the gig economy expands. Demo data — safe to delete.",
        },
      },
    ],
  },
  {
    id: "trading",
    name: "Trading",
    description: "Two sample trades and a decision note, showing what a trading log looks like once it has history.",
    entries: [
      {
        table: "trades",
        payload: {
          symbol: "AAPL (example)",
          direction: "long",
          result: "win",
          pnl: 245,
          notes: "Entered on an earnings beat, exited at resistance. Demo data — safe to delete.",
        },
      },
      {
        table: "trades",
        payload: {
          symbol: "TSLA (example)",
          direction: "short",
          result: "loss",
          pnl: -120,
          notes: "Stopped out on an unexpected rally. Demo data — safe to delete.",
        },
      },
      {
        table: "decisions",
        payload: {
          idea_names: "AAPL vs TSLA position sizing (example)",
          ranking: "AAPL first",
          recommendation: "Prioritize AAPL this week — better risk/reward. Demo data — safe to delete.",
        },
      },
    ],
  },
  {
    id: "marketing-agency",
    name: "Marketing Agency",
    description: "A content idea, a lead, and a campaign — a taste of client-facing workflow.",
    entries: [
      {
        table: "content",
        payload: {
          topic: "5 SEO myths debunked (example)",
          hashtags: "#SEO #ContentMarketing",
          caption: "Demo content idea — safe to delete.",
        },
      },
      {
        table: "leads",
        payload: {
          lead_name: "Acme Corp (example)",
          score: 80,
          next_steps: "Schedule a discovery call. Demo data — safe to delete.",
        },
      },
      {
        table: "ai_campaigns",
        payload: {
          name: "Spring product launch (example)",
          description: "Demo campaign — safe to delete.",
          channel: "social",
          budget: 2000,
          status: "planned",
        },
      },
    ],
  },
  {
    id: "developer",
    name: "Developer",
    description: "A product plan, an automation idea, and an AI coding request.",
    entries: [
      {
        table: "products",
        payload: {
          product_name: "Internal API gateway (example)",
          mvp_features: "Auth, rate limiting, request logging.",
          roadmap: "Demo data — safe to delete.",
        },
      },
      {
        table: "automations",
        payload: {
          task_name: "Auto-deploy on merge to main (example)",
          time_saved: "2 hrs/week",
          idea: "GitHub Actions + Vercel",
          tools_needed: "GitHub Actions",
        },
      },
      {
        table: "ai_coding_requests",
        payload: {
          title: "Add rate limiting middleware (example)",
          description: "Demo request — safe to delete.",
          language: "TypeScript",
          status: "requested",
        },
      },
    ],
  },
];

export function getWorkspaceTemplate(id: string): WorkspaceTemplate | undefined {
  return WORKSPACE_TEMPLATES.find((t) => t.id === id);
}
