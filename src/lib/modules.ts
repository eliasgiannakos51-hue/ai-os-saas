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
};

export const MODULES: ModuleConfig[] = [
  {
    slug: "competitors",
    title: "Competitors",
    table: "competitors",
    headlineKey: "company",
    fields: [
      { key: "company", label: "company", type: "text", required: true },
      { key: "product", label: "product", type: "text" },
      { key: "pricing", label: "pricing", type: "text" },
      { key: "customers", label: "customers", type: "text" },
      { key: "marketing", label: "marketing", type: "textarea", full: true },
      { key: "strengths", label: "strengths", type: "textarea", full: true },
      { key: "weaknesses", label: "weaknesses", type: "textarea", full: true },
    ],
  },
  {
    slug: "research",
    title: "Research",
    table: "research",
    headlineKey: "topic",
    fields: [
      { key: "topic", label: "topic", type: "text", required: true },
      { key: "summary", label: "summary", type: "textarea", full: true },
    ],
  },
  {
    slug: "finance",
    title: "Finance",
    table: "finance_entries",
    headlineKey: "description",
    fields: [
      { key: "description", label: "description", type: "text", required: true },
      {
        key: "type",
        label: "type",
        type: "select",
        required: true,
        badge: true,
        options: ["income", "expense"],
      },
      { key: "amount", label: "amount", type: "number", required: true, badge: true },
    ],
  },
  {
    slug: "learning",
    title: "Learning",
    table: "learning_entries",
    headlineKey: "topic",
    fields: [
      { key: "topic", label: "topic", type: "text", required: true },
      { key: "resources", label: "resources", type: "textarea", full: true },
      { key: "quiz", label: "quiz", type: "textarea", full: true },
    ],
  },
  {
    slug: "trading",
    title: "Trading",
    table: "trades",
    headlineKey: "symbol",
    fields: [
      { key: "symbol", label: "symbol", type: "text", required: true },
      { key: "direction", label: "direction", type: "text", badge: true, placeholder: "long / short" },
      { key: "result", label: "result", type: "text", badge: true, placeholder: "win / loss" },
      { key: "pnl", label: "pnl", type: "number", badge: true },
      { key: "notes", label: "notes", type: "textarea", full: true },
    ],
  },
  {
    slug: "decisions",
    title: "Decisions",
    table: "decisions",
    headlineKey: "idea_names",
    fields: [
      { key: "idea_names", label: "idea_names", type: "text", required: true },
      { key: "ranking", label: "ranking", type: "text", badge: true },
      { key: "recommendation", label: "recommendation", type: "textarea", full: true },
    ],
  },
  {
    slug: "products",
    title: "Products",
    table: "products",
    headlineKey: "product_name",
    fields: [
      { key: "product_name", label: "product_name", type: "text", required: true },
      { key: "pricing", label: "pricing", type: "text" },
      { key: "target_audience", label: "target_audience", type: "text" },
      { key: "mvp_features", label: "mvp_features", type: "textarea", full: true },
      { key: "roadmap", label: "roadmap", type: "textarea", full: true },
      { key: "user_journey", label: "user_journey", type: "textarea", full: true },
      { key: "risks", label: "risks", type: "textarea", full: true },
      { key: "launch_plan", label: "launch_plan", type: "textarea", full: true },
    ],
  },
  {
    slug: "content",
    title: "Content",
    table: "content",
    headlineKey: "topic",
    fields: [
      { key: "topic", label: "topic", type: "text", required: true },
      { key: "hashtags", label: "hashtags", type: "text" },
      { key: "caption", label: "caption", type: "textarea", full: true },
      { key: "twitter_thread", label: "twitter_thread", type: "textarea", full: true },
      { key: "content_ideas", label: "content_ideas", type: "textarea", full: true },
    ],
  },
  {
    slug: "sales",
    title: "Sales",
    table: "leads",
    headlineKey: "lead_name",
    fields: [
      { key: "lead_name", label: "lead_name", type: "text", required: true },
      { key: "score", label: "score", type: "number", badge: true },
      { key: "cold_email", label: "cold_email", type: "textarea", full: true },
      { key: "follow_up_email", label: "follow_up_email", type: "textarea", full: true },
      { key: "next_steps", label: "next_steps", type: "textarea", full: true },
    ],
  },
  {
    slug: "feedback",
    title: "Feedback",
    table: "feedback",
    headlineKey: "summary",
    fields: [
      { key: "summary", label: "summary", type: "text", required: true },
      { key: "sentiment", label: "sentiment", type: "text", badge: true },
      { key: "category", label: "category", type: "text", badge: true },
      { key: "priority", label: "priority", type: "text", badge: true },
      { key: "suggested_response", label: "suggested_response", type: "textarea", full: true },
    ],
  },
  {
    slug: "analytics",
    title: "Analytics",
    table: "metrics",
    headlineKey: "metric_name",
    fields: [
      { key: "metric_name", label: "metric_name", type: "text", required: true },
      { key: "value", label: "value", type: "number", badge: true },
      { key: "notes", label: "notes", type: "textarea", full: true },
    ],
  },
  {
    slug: "automation",
    title: "Automation",
    table: "automations",
    headlineKey: "task_name",
    fields: [
      { key: "task_name", label: "task_name", type: "text", required: true },
      { key: "time_saved", label: "time_saved", type: "text", badge: true },
      { key: "idea", label: "idea", type: "text" },
      { key: "tools_needed", label: "tools_needed", type: "text" },
      { key: "suggested_workflow", label: "suggested_workflow", type: "textarea", full: true },
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

export const CREATE_NAV_ITEM = { href: "/dashboard/create", label: "Create" };
