import type { ModuleConfig } from "@/lib/modules";

// "Build" modules — Websites, Apps, Images, Videos and the rest. Same
// RLS/CRUD/search/sort/export pattern as the 13 business modules
// (lib/modules.ts), reusing the same generic list/form/row components, but
// kept in a separate array on purpose: these are NOT added to
// CLASSIFIER_MODULES (lib/classifier-modules.ts), so Create Anything's
// free-text routing is unaffected. Each is purely a tracking/log table for
// now — no real AI generation happens yet, matching the "Coming Soon" /
// "Future Vision" framing on the public roadmap page.
export const BUILD_MODULES: ModuleConfig[] = [
  {
    slug: "websites",
    emptyKey: "moduleData.empty.websites",
    newKey: "moduleData.new.websites",
    titleKey: "sidebar.items.websites",
    table: "ai_websites",
    headlineKey: "name",
    creditCost: 100,
    minPlanSlug: "starter",
    fields: [
      { key: "name", labelKey: "moduleData.fields.name", type: "text", required: true },
      { key: "description", labelKey: "moduleData.fields.description", type: "textarea", full: true },
      { key: "url", labelKey: "moduleData.fields.url", type: "text", placeholderKey: "moduleData.placeholders.httpsUrl" },
      {
        key: "status",
        labelKey: "moduleData.fields.status",
        type: "select",
        badge: true,
        options: ["planned", "in progress", "live", "archived"],
      },
    ],
  },
  {
    slug: "apps",
    emptyKey: "moduleData.empty.apps",
    newKey: "moduleData.new.apps",
    titleKey: "sidebar.items.apps",
    table: "ai_apps",
    headlineKey: "name",
    creditCost: 300,
    minPlanSlug: "growth",
    fields: [
      { key: "name", labelKey: "moduleData.fields.name", type: "text", required: true },
      { key: "description", labelKey: "moduleData.fields.description", type: "textarea", full: true },
      {
        key: "platform",
        labelKey: "moduleData.fields.platform",
        type: "select",
        badge: true,
        options: ["ios", "android", "web", "desktop", "cross-platform"],
      },
      {
        key: "status",
        labelKey: "moduleData.fields.status",
        type: "select",
        badge: true,
        options: ["planned", "in progress", "live", "archived"],
      },
    ],
  },
  {
    slug: "images",
    emptyKey: "moduleData.empty.images",
    newKey: "moduleData.new.images",
    titleKey: "sidebar.items.images",
    table: "ai_images",
    headlineKey: "prompt",
    minPlanSlug: "starter",
    fields: [
      { key: "prompt", labelKey: "moduleData.fields.prompt", type: "text", required: true },
      { key: "description", labelKey: "moduleData.fields.notes", type: "textarea", full: true },
      {
        key: "status",
        labelKey: "moduleData.fields.status",
        type: "select",
        badge: true,
        options: ["requested", "in progress", "done"],
      },
    ],
  },
  {
    slug: "videos",
    emptyKey: "moduleData.empty.videos",
    newKey: "moduleData.new.videos",
    titleKey: "sidebar.items.videos",
    table: "ai_videos",
    headlineKey: "prompt",
    minPlanSlug: "starter",
    fields: [
      { key: "prompt", labelKey: "moduleData.fields.prompt", type: "text", required: true },
      { key: "description", labelKey: "moduleData.fields.notes", type: "textarea", full: true },
      {
        key: "status",
        labelKey: "moduleData.fields.status",
        type: "select",
        badge: true,
        options: ["requested", "in progress", "done"],
      },
    ],
  },
  {
    slug: "coding",
    emptyKey: "moduleData.empty.coding",
    newKey: "moduleData.new.coding",
    titleKey: "sidebar.items.coding",
    table: "ai_coding_requests",
    headlineKey: "title",
    fields: [
      { key: "title", labelKey: "moduleData.fields.title", type: "text", required: true },
      { key: "description", labelKey: "moduleData.fields.description", type: "textarea", full: true },
      {
        key: "language",
        labelKey: "moduleData.fields.language",
        type: "text",
        badge: true,
        placeholderKey: "moduleData.placeholders.codingLanguages",
      },
      {
        key: "status",
        labelKey: "moduleData.fields.status",
        type: "select",
        badge: true,
        options: ["requested", "in progress", "done", "archived"],
      },
    ],
  },
  {
    slug: "data-analysis",
    emptyKey: "moduleData.empty.dataAnalysis",
    newKey: "moduleData.new.dataAnalysis",
    titleKey: "sidebar.items.dataAnalysis",
    table: "ai_data_analysis_requests",
    headlineKey: "title",
    fields: [
      { key: "title", labelKey: "moduleData.fields.title", type: "text", required: true },
      { key: "description", labelKey: "moduleData.fields.description", type: "textarea", full: true },
      {
        key: "data_source",
        labelKey: "moduleData.fields.dataSource",
        type: "text",
        placeholderKey: "moduleData.placeholders.dataSources",
      },
      { key: "findings", labelKey: "moduleData.fields.findings", type: "textarea", full: true },
      {
        key: "status",
        labelKey: "moduleData.fields.status",
        type: "select",
        badge: true,
        options: ["requested", "in progress", "done", "archived"],
      },
    ],
  },
  {
    slug: "presentations",
    // The one empty state that has to say what this module is NOT. It was
    // the first module to get its own (module.emptyPresentationNotes, now
    // moved into the shared moduleData.empty.* table with the other
    // twenty); presentation-notes.test.mjs still holds it to saying
    // "does not generate slides" in all ten locales.
    emptyKey: "moduleData.empty.presentations",
    newKey: "moduleData.new.presentations",
    // "Presentations" promised a generator this module does not contain.
    //
    // It is a CRUD tracker — a table of rows the user types by hand, with
    // no AI call anywhere in it. A user clicking "Presentations" expects
    // to describe a deck and get slides, and finds a form with a
    // slide-count field. That gap is not a wording problem to soften; the
    // name was simply not true.
    //
    // Renamed rather than built: the real generator is a separate piece of
    // work (slides jsonb, themes, a viewer/editor, PDF export) and is on
    // the roadmap under "AI Presentations & Documents", where the promise
    // belongs until it is real.
    titleKey: "sidebar.items.presentations",
    table: "ai_presentations",
    headlineKey: "title",
    fields: [
      { key: "title", labelKey: "moduleData.fields.title", type: "text", required: true },
      { key: "description", labelKey: "moduleData.fields.description", type: "textarea", full: true },
      { key: "slide_count", labelKey: "moduleData.fields.slideCount", type: "number", badge: true },
      {
        key: "status",
        labelKey: "moduleData.fields.status",
        type: "select",
        badge: true,
        options: ["draft", "in review", "final", "archived"],
      },
    ],
  },
  {
    slug: "campaigns",
    emptyKey: "moduleData.empty.campaigns",
    newKey: "moduleData.new.campaigns",
    titleKey: "sidebar.items.campaigns",
    table: "ai_campaigns",
    headlineKey: "name",
    fields: [
      { key: "name", labelKey: "moduleData.fields.name", type: "text", required: true },
      { key: "description", labelKey: "moduleData.fields.description", type: "textarea", full: true },
      {
        key: "channel",
        labelKey: "moduleData.fields.channel",
        type: "select",
        badge: true,
        options: ["email", "social", "paid ads", "content", "seo", "event", "other"],
      },
      { key: "budget", labelKey: "moduleData.fields.budget", type: "number", badge: true },
      {
        key: "status",
        labelKey: "moduleData.fields.status",
        type: "select",
        badge: true,
        options: ["planned", "active", "paused", "completed"],
      },
    ],
  },
];

export function getBuildModule(slug: string): ModuleConfig | undefined {
  return BUILD_MODULES.find((m) => m.slug === slug);
}
