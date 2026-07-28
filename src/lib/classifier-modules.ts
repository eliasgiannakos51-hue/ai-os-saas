import { MODULES, type ModuleConfig } from "@/lib/modules";

// The Ideas module's fields aren't exported from lib/modules.ts (Ideas has
// its own hand-built page/components), so they're mirrored here for the
// "Create Anything" classifier only. Keep in sync with supabase_schema.sql /
// src/types/ideas.ts if the ideas table ever changes.
const IDEAS_MODULE: ModuleConfig = {
  slug: "ideas",
  title: "Ideas",
  table: "ideas",
  headlineKey: "name",
  fields: [
    { key: "name", label: "name", type: "text", required: true },
    { key: "problem", label: "problem", type: "textarea" },
    { key: "customer", label: "customer", type: "text" },
    { key: "competitors", label: "competitors", type: "textarea" },
    { key: "market_size", label: "market_size", type: "text" },
    { key: "mvp", label: "mvp", type: "textarea" },
    { key: "score", label: "score", type: "number" },
    { key: "verdict", label: "verdict", type: "text" },
  ],
};

export const CLASSIFIER_MODULES: ModuleConfig[] = [IDEAS_MODULE, ...MODULES];

export function getClassifierModule(slug: string): ModuleConfig | undefined {
  return CLASSIFIER_MODULES.find((m) => m.slug === slug);
}

export function moduleHref(slug: string): string {
  return slug === "ideas" ? "/dashboard" : `/dashboard/${slug}`;
}
