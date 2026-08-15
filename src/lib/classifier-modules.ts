import { MODULES, type ModuleConfig } from "@/lib/modules";

// The Ideas module's fields aren't exported from lib/modules.ts (Ideas has
// its own hand-built page/components), so they're mirrored here for the
// "Create Anything" classifier only. Keep in sync with supabase_schema.sql /
// src/types/ideas.ts if the ideas table ever changes.
// Ideas keeps its own hand-built page and components, so its labels live
// under dashboard.ideas (batch A2) rather than moduleData — the keys point
// at the translations that already exist rather than duplicating them.
const IDEAS_MODULE: ModuleConfig = {
  slug: "ideas",
  titleKey: "sidebar.items.ideas",
  table: "ideas",
  headlineKey: "name",
  fields: [
    { key: "name", labelKey: "dashboard.ideas.nameLabel", type: "text", required: true },
    { key: "problem", labelKey: "dashboard.ideas.problemLabel", type: "textarea" },
    { key: "customer", labelKey: "dashboard.ideas.customerLabel", type: "text" },
    { key: "competitors", labelKey: "dashboard.ideas.competitorsLabel", type: "textarea" },
    { key: "market_size", labelKey: "dashboard.ideas.marketSizeLabel", type: "text" },
    { key: "mvp", labelKey: "dashboard.ideas.mvpLabel", type: "textarea" },
    { key: "score", labelKey: "dashboard.ideas.scoreLabel", type: "number" },
    { key: "verdict", labelKey: "dashboard.ideas.verdictLabel", type: "text" },
  ],
};

export const CLASSIFIER_MODULES: ModuleConfig[] = [IDEAS_MODULE, ...MODULES];

export function getClassifierModule(slug: string): ModuleConfig | undefined {
  return CLASSIFIER_MODULES.find((m) => m.slug === slug);
}

export function moduleHref(slug: string): string {
  return slug === "ideas" ? "/dashboard" : `/dashboard/${slug}`;
}
