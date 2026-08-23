import { MODULES } from "@/lib/modules";
import { BUILD_MODULES } from "@/lib/build-modules";

/**
 * module_slug -> the translation key that names it.
 *
 * DERIVED, not typed out. The search index stores a module_slug per row
 * (see the 20260824 migration's `specs` list) and the filter chips have
 * to put a human name on it in ten languages. Writing that list a second
 * time by hand is how one of the two ends up missing a module — so it is
 * built from the same MODULES/BUILD_MODULES configs the rest of the app
 * routes and titles from.
 *
 * `ideas` is the one entry that cannot come from there: the ideas module
 * lives at /dashboard rather than in MODULES, so it has no ModuleConfig
 * to read a titleKey off. scripts/tests/unified-search.test.mjs parses
 * the migration and asserts every module_slug in it appears here, which
 * is what turns "I remembered the exception" into a check.
 */
export const MODULE_TITLE_KEYS: Record<string, string> = {
  ideas: "sidebar.items.ideas",
  // THE TWO THAT LEFT BUILD_MODULES IN V4 #19 + #20, and had to stay
  // here. `coding` and `data-analysis` are no longer tracking modules —
  // they are tools with bespoke pages — but the search index still
  // carries their OLD tables (ai_coding_requests,
  // ai_data_analysis_requests), because those rows still exist and are
  // still the user's own content. Dropping the labels would have left
  // real search results with a raw slug for a filter chip in all ten
  // languages, which is the one thing this file exists to prevent.
  coding: "sidebar.items.coding",
  "data-analysis": "sidebar.items.dataAnalysis",
  ...Object.fromEntries(
    [...MODULES, ...BUILD_MODULES].map((module) => [module.slug, module.titleKey])
  ),
};
