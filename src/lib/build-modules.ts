import type { ModuleConfig } from "@/lib/modules";

// "Build" modules — AI Agents, Websites, Apps, Images, Videos. Same
// RLS/CRUD/search/sort/export pattern as the 13 business modules
// (lib/modules.ts), reusing the same generic list/form/row components, but
// kept in a separate array on purpose: these are NOT added to
// CLASSIFIER_MODULES (lib/classifier-modules.ts), so Create Anything's
// free-text routing is unaffected. Each is purely a tracking/log table for
// now — no real AI generation happens yet, matching the "Coming Soon" /
// "Future Vision" framing on the public roadmap page.
export const BUILD_MODULES: ModuleConfig[] = [
  {
    slug: "agents",
    title: "AI Agents",
    table: "ai_agents",
    headlineKey: "name",
    creditCost: 40,
    countCapCapability: "maxAiAgents",
    fields: [
      { key: "name", label: "Name", type: "text", required: true },
      { key: "description", label: "Goal / Description", type: "textarea", full: true },
      {
        key: "status",
        label: "Status",
        type: "select",
        badge: true,
        options: ["planned", "active", "paused", "archived"],
      },
    ],
  },
  {
    slug: "websites",
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
    title: "Presentations",
    table: "ai_presentations",
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
