import type { ModuleConfig } from "@/lib/modules";

// TRACKING modules — Website plans, App notes, Image notes and the rest.
// Every entry in this array is a LOG: a table of rows the user types by
// hand, with no AI call anywhere in it. That is not a comment, it is the
// definition the sidebar gate reads — scripts/tests/sidebar-naming.test.mjs
// takes "appears in this file" to mean "produces nothing", files every
// slug here under Tracking, and requires each one's empty state to name
// the thing it will not do.
//
// TWO ENTRIES LEFT THIS FILE IN V4 #19 + #20. `coding` and `data-analysis`
// were trackers and are now tools: /dashboard/coding runs five real
// operations through lib/coding/operations.ts, and /dashboard/data-analysis
// parses an uploaded spreadsheet, profiles it and charts it. Neither is a
// CRUD table any more, so neither belongs in a registry whose whole
// meaning is "this produces nothing" — and the gate now checks that
// claim MECHANICALLY, in both directions, rather than trusting the
// membership: a module here must have no producing route, and a module
// under Build must have one.
//
// Their old tables (ai_coding_requests, ai_data_analysis_requests) are
// untouched, still in the GDPR export, and their rows still reachable —
// the coding notes were imported into code_sessions, and the analysis
// notes are listed on the new page. See the 20260902 migration.
//
// Same
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
    // NO creditCost. It was 100 — EUR 2.00 on Starter, a tenth of that
    // plan's entire monthly allowance — charged for inserting a row the
    // user typed by hand. The header of this file says what every entry in
    // it is: "a table of rows the user types by hand, with no AI call
    // anywhere in it", and scripts/tests/sidebar-naming.test.mjs proves
    // that mechanically for every slug here. Nothing was generated,
    // nothing was spent on the user's behalf, and the form never named a
    // price before the click.
    //
    // The number was almost certainly written for the AI generation the
    // sidebar hint used to promise ("Describe an app and get a real one
    // built"), which does not exist. When it does, it charges the way
    // every other AI route in this app charges — reserve against an
    // estimate, settle against real usage — not a flat fee for an INSERT.
    //
    // minPlanSlug stays: which plans may open the page is a product
    // decision, unrelated to what a row costs.
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
    // NO creditCost — same as `websites` above, and worse: 300 credits is
    // EUR 5.00 on Growth, a tenth of that plan's month, for one hand-typed
    // note. See the note on `websites`.
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
