import type { PlanSlug } from "@/lib/billing/plans";

export type FieldType = "text" | "textarea" | "number" | "select";

export type FieldConfig = {
  key: string;
  label: string;
  type: FieldType;
  required?: boolean;
  full?: boolean;
  badge?: boolean;
  options?: string[];
  placeholder?: string;
};

export type ModuleConfig = {
  slug: string;
  title: string;
  table: string;
  headlineKey: string;
  fields: FieldConfig[];
  // Credits system (see lib/billing/credits.ts). creditCost, when set,
  // routes GenericAddForm through /api/modules/create instead of a direct
  // client insert, so the cost can be checked/deducted server-side.
  // minPlanSlug, when set, gates the whole page (BuildModulePage only) —
  // below that plan, the page shows an "Upgrade Required" prompt instead
  // of its normal content.
  //
  // There used to be a third field here, countCapCapability, which existed
  // solely to cap the "agents" tracker's row count against
  // plan.capabilities.maxAiAgents. /dashboard/agents is the real
  // Autonomous Agents feature now and maxAiAgents means the number of REAL
  // agents an account may own (enforced in lib/agents/agent-limits.ts and
  // checked in api/agents). Leaving a second, unrelated enforcement of the
  // same capability behind would have made one number mean two things.
  creditCost?: number;
  minPlanSlug?: PlanSlug;
  // Overrides the shared "No entries yet" empty state with a key under
  // messages/*.json's `module.*`.
  //
  // Exists for Presentation Notes, where the generic message is actively
  // misleading: a user who arrived expecting a slide generator needs the
  // empty screen to say what this actually is, and every OTHER module is
  // served perfectly well by the shared string. A per-module override is
  // the smallest change that fixes one module without touching twenty.
  emptyKey?: string;
  /**
   * Message key under `sidebar.items` for this module's DISPLAYED name.
   *
   * `title` above stays English and stays the state key — it is what the
   * classifier, the CSV export and the entity-link labels match on. What
   * changes is the heading a person reads, which was rendering
   * `moduleConfig.title` verbatim: every module page showed its English
   * name in all ten locales while the sidebar beside it showed the
   * translation. Two names for one thing, in two places on the same
   * screen.
   *
   * Pointed at the SIDEBAR's key rather than a new one, so a module can
   * only ever have one display name.
   */
  titleKey?: string;
};

export const MODULES: ModuleConfig[] = [
  {
    slug: "competitors",
    titleKey: "competitors",
    title: "Competitors",
    table: "competitors",
    headlineKey: "company",
    fields: [
      { key: "company", label: "Company", type: "text", required: true },
      { key: "product", label: "Product", type: "text" },
      { key: "pricing", label: "Pricing", type: "text" },
      { key: "customers", label: "Customers", type: "text" },
      { key: "marketing", label: "Marketing", type: "textarea", full: true },
      { key: "strengths", label: "Strengths", type: "textarea", full: true },
      { key: "weaknesses", label: "Weaknesses", type: "textarea", full: true },
    ],
  },
  {
    slug: "research",
    titleKey: "research",
    title: "Research",
    table: "research",
    headlineKey: "topic",
    fields: [
      { key: "topic", label: "Topic", type: "text", required: true },
      { key: "summary", label: "Summary", type: "textarea", full: true },
    ],
  },
  {
    slug: "finance",
    titleKey: "finance",
    title: "Finance",
    table: "finance_entries",
    headlineKey: "description",
    fields: [
      { key: "description", label: "Description", type: "text", required: true },
      {
        key: "type",
        label: "Type",
        type: "select",
        required: true,
        badge: true,
        options: ["income", "expense"],
      },
      { key: "amount", label: "Amount", type: "number", required: true, badge: true },
    ],
  },
  {
    slug: "learning",
    titleKey: "learning",
    title: "Learning",
    table: "learning_entries",
    headlineKey: "topic",
    fields: [
      { key: "topic", label: "Topic", type: "text", required: true },
      { key: "resources", label: "Resources", type: "textarea", full: true },
      { key: "quiz", label: "Quiz", type: "textarea", full: true },
    ],
  },
  {
    slug: "trading",
    titleKey: "trading",
    title: "Trading",
    table: "trades",
    headlineKey: "symbol",
    fields: [
      { key: "symbol", label: "Symbol", type: "text", required: true },
      { key: "direction", label: "Direction", type: "text", badge: true, placeholder: "long / short" },
      { key: "result", label: "Result", type: "text", badge: true, placeholder: "win / loss" },
      { key: "pnl", label: "P&L", type: "number", badge: true },
      { key: "notes", label: "Notes", type: "textarea", full: true },
    ],
  },
  {
    slug: "decisions",
    titleKey: "decisions",
    title: "Decisions",
    table: "decisions",
    headlineKey: "idea_names",
    fields: [
      { key: "idea_names", label: "Idea Names", type: "text", required: true },
      { key: "ranking", label: "Ranking", type: "text", badge: true },
      { key: "recommendation", label: "Recommendation", type: "textarea", full: true },
    ],
  },
  {
    slug: "products",
    titleKey: "products",
    title: "Products",
    table: "products",
    headlineKey: "product_name",
    fields: [
      { key: "product_name", label: "Product Name", type: "text", required: true },
      { key: "pricing", label: "Pricing", type: "text" },
      { key: "target_audience", label: "Target Audience", type: "text" },
      { key: "mvp_features", label: "MVP Features", type: "textarea", full: true },
      { key: "roadmap", label: "Roadmap", type: "textarea", full: true },
      { key: "user_journey", label: "User Journey", type: "textarea", full: true },
      { key: "risks", label: "Risks", type: "textarea", full: true },
      { key: "launch_plan", label: "Launch Plan", type: "textarea", full: true },
    ],
  },
  {
    slug: "content",
    titleKey: "content",
    title: "Content",
    table: "content",
    headlineKey: "topic",
    fields: [
      { key: "topic", label: "Topic", type: "text", required: true },
      { key: "hashtags", label: "Hashtags", type: "text" },
      { key: "caption", label: "Caption", type: "textarea", full: true },
      { key: "twitter_thread", label: "Twitter Thread", type: "textarea", full: true },
      { key: "content_ideas", label: "Content Ideas", type: "textarea", full: true },
    ],
  },
  {
    slug: "sales",
    titleKey: "sales",
    title: "Sales",
    table: "leads",
    headlineKey: "lead_name",
    fields: [
      { key: "lead_name", label: "Lead Name", type: "text", required: true },
      { key: "score", label: "Score", type: "number", badge: true },
      { key: "cold_email", label: "Cold Email", type: "textarea", full: true },
      { key: "follow_up_email", label: "Follow-up Email", type: "textarea", full: true },
      { key: "next_steps", label: "Next Steps", type: "textarea", full: true },
    ],
  },
  {
    slug: "feedback",
    titleKey: "feedback",
    title: "Feedback",
    table: "feedback",
    headlineKey: "summary",
    fields: [
      { key: "summary", label: "Summary", type: "text", required: true },
      { key: "sentiment", label: "Sentiment", type: "text", badge: true },
      { key: "category", label: "Category", type: "text", badge: true },
      { key: "priority", label: "Priority", type: "text", badge: true },
      { key: "suggested_response", label: "Suggested Response", type: "textarea", full: true },
    ],
  },
  {
    slug: "analytics",
    titleKey: "analytics",
    title: "Analytics",
    table: "metrics",
    headlineKey: "metric_name",
    fields: [
      { key: "metric_name", label: "Metric Name", type: "text", required: true },
      { key: "value", label: "Value", type: "number", badge: true },
      { key: "notes", label: "Notes", type: "textarea", full: true },
    ],
  },
  {
    slug: "automation",
    titleKey: "automation",
    title: "Automation",
    table: "automations",
    headlineKey: "task_name",
    creditCost: 50,
    fields: [
      { key: "task_name", label: "Task Name", type: "text", required: true },
      { key: "time_saved", label: "Time Saved", type: "text", badge: true },
      { key: "idea", label: "Idea", type: "text" },
      { key: "tools_needed", label: "Tools Needed", type: "text" },
      { key: "suggested_workflow", label: "Suggested Workflow", type: "textarea", full: true },
    ],
  },
];

export function getModule(slug: string): ModuleConfig | undefined {
  return MODULES.find((m) => m.slug === slug);
}

export const NAV_ITEMS: { href: string; label: string }[] = [
  { href: "/dashboard", label: "Ideas" },
  ...MODULES.map((m) => ({ href: `/dashboard/${m.slug}`, label: m.title })),
];

export const CREATE_NAV_ITEM = { href: "/dashboard/create", label: "Create Studio" };

export const CHAT_NAV_ITEM = { href: "/dashboard/chat", label: "Ionexa Chat" };

export const TIMELINE_NAV_ITEM = { href: "/dashboard/timeline", label: "Timeline" };

export const MISSION_NAV_ITEM = { href: "/dashboard/mission", label: "Mission Control" };

export const REFLECTION_NAV_ITEM = { href: "/dashboard/reflection", label: "Weekly Reflection" };

export const OVERVIEW_NAV_ITEM = { href: "/dashboard/overview", label: "Overview" };

export const SETTINGS_NAV_ITEM = { href: "/dashboard/settings", label: "Settings" };
