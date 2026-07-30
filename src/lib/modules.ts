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
    title: "Automation",
    table: "automations",
    headlineKey: "task_name",
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

export const CREATE_NAV_ITEM = { href: "/dashboard/create", label: "Create" };

export const CHAT_NAV_ITEM = { href: "/dashboard/chat", label: "Veron Chat" };

export const OVERVIEW_NAV_ITEM = { href: "/dashboard/overview", label: "Overview" };

export const SETTINGS_NAV_ITEM = { href: "/dashboard/settings", label: "Settings" };
