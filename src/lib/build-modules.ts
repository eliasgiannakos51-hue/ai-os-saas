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
    titleKey: "websites",
    emptyKey: "emptyWebsitePlans",
    title: "Websites",
    table: "ai_websites",
    headlineKey: "name",
    creditCost: 100,
    minPlanSlug: "starter",
    fields: [
      { key: "name", label: "Name", type: "text", required: true },
      { key: "description", label: "Description", type: "textarea", full: true },
      { key: "url", label: "URL", type: "text", placeholder: "https://..." },
      {
        key: "status",
        label: "Status",
        type: "select",
        badge: true,
        options: ["planned", "in progress", "live", "archived"],
      },
    ],
  },
  {
    slug: "apps",
    titleKey: "apps",
    emptyKey: "emptyApps",
    title: "Apps",
    table: "ai_apps",
    headlineKey: "name",
    creditCost: 300,
    minPlanSlug: "growth",
    fields: [
      { key: "name", label: "Name", type: "text", required: true },
      { key: "description", label: "Description", type: "textarea", full: true },
      {
        key: "platform",
        label: "Platform",
        type: "select",
        badge: true,
        options: ["ios", "android", "web", "desktop", "cross-platform"],
      },
      {
        key: "status",
        label: "Status",
        type: "select",
        badge: true,
        options: ["planned", "in progress", "live", "archived"],
      },
    ],
  },
  {
    slug: "images",
    titleKey: "images",
    emptyKey: "emptyImages",
    title: "Images",
    table: "ai_images",
    headlineKey: "prompt",
    minPlanSlug: "starter",
    fields: [
      { key: "prompt", label: "Prompt", type: "text", required: true },
      { key: "description", label: "Notes", type: "textarea", full: true },
      {
        key: "status",
        label: "Status",
        type: "select",
        badge: true,
        options: ["requested", "in progress", "done"],
      },
    ],
  },
  {
    slug: "videos",
    titleKey: "videos",
    emptyKey: "emptyVideos",
    title: "Videos",
    table: "ai_videos",
    headlineKey: "prompt",
    minPlanSlug: "starter",
    fields: [
      { key: "prompt", label: "Prompt", type: "text", required: true },
      { key: "description", label: "Notes", type: "textarea", full: true },
      {
        key: "status",
        label: "Status",
        type: "select",
        badge: true,
        options: ["requested", "in progress", "done"],
      },
    ],
  },
  {
    slug: "coding",
    titleKey: "coding",
    emptyKey: "emptyCoding",
    title: "AI Coding",
    table: "ai_coding_requests",
    headlineKey: "title",
    fields: [
      { key: "title", label: "Title", type: "text", required: true },
      { key: "description", label: "Description", type: "textarea", full: true },
      {
        key: "language",
        label: "Language",
        type: "text",
        badge: true,
        placeholder: "e.g. Python, TypeScript, Go",
      },
      {
        key: "status",
        label: "Status",
        type: "select",
        badge: true,
        options: ["requested", "in progress", "done", "archived"],
      },
    ],
  },
  {
    slug: "data-analysis",
    titleKey: "dataAnalysis",
    emptyKey: "emptyDataAnalysis",
    title: "Data Analysis",
    table: "ai_data_analysis_requests",
    headlineKey: "title",
    fields: [
      { key: "title", label: "Title", type: "text", required: true },
      { key: "description", label: "Description", type: "textarea", full: true },
      {
        key: "data_source",
        label: "Data Source",
        type: "text",
        placeholder: "e.g. CSV export, Stripe, Google Analytics",
      },
      { key: "findings", label: "Findings", type: "textarea", full: true },
      {
        key: "status",
        label: "Status",
        type: "select",
        badge: true,
        options: ["requested", "in progress", "done", "archived"],
      },
    ],
  },
  {
    slug: "presentations",
    titleKey: "presentations",
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
    title: "Presentation Notes",
    table: "ai_presentations",
    emptyKey: "emptyPresentationNotes",
    headlineKey: "title",
    fields: [
      { key: "title", label: "Title", type: "text", required: true },
      { key: "description", label: "Description", type: "textarea", full: true },
      { key: "slide_count", label: "Slide Count", type: "number", badge: true },
      {
        key: "status",
        label: "Status",
        type: "select",
        badge: true,
        options: ["draft", "in review", "final", "archived"],
      },
    ],
  },
  {
    slug: "campaigns",
    titleKey: "campaigns",
    emptyKey: "emptyCampaigns",
    title: "Marketing Campaigns",
    table: "ai_campaigns",
    headlineKey: "name",
    fields: [
      { key: "name", label: "Name", type: "text", required: true },
      { key: "description", label: "Description", type: "textarea", full: true },
      {
        key: "channel",
        label: "Channel",
        type: "select",
        badge: true,
        options: ["email", "social", "paid ads", "content", "seo", "event", "other"],
      },
      { key: "budget", label: "Budget", type: "number", badge: true },
      {
        key: "status",
        label: "Status",
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
