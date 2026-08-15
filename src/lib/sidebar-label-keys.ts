// Shared translation-key lookup for lib/sidebar-nav.ts's English `heading`/
// `label` strings, used by both Sidebar and CommandPalette so their
// translated display never drifts apart. The underlying strings stay
// English (state keys, search matching) — only the rendered label goes
// through messages/*.json's sidebar.items.
export const GROUP_HEADING_KEYS: Record<string, string> = {
  // Renamed from Build/Business/Strategy: those said what a category was
  // called, not what you do inside it. A user cannot guess that
  // "Strategy" holds their trade log or that "Build" holds Documents.
  Create: "create",
  "My Business": "myBusiness",
  Track: "track",
  Operations: "operations",
  Insights: "insights",
  Marketplace: "marketplace",
  Settings: "settings",
};

// FOUR MODULES USED TO HAVE TWO NAMES EACH. The sidebar said CRM,
// Knowledge, Marketing and Website Plans; the page heading said Sales,
// Research, Content and Websites — the same module, under a different
// word, depending on which one you were looking at. Unified on the name a
// stranger can guess: Sales over the jargon, Research over the vague one,
// Content over the broader one, Websites over the page that is not about
// plans. lib/modules.ts now points at these keys instead of holding its
// own copy, so the two cannot drift apart again.
export const ITEM_LABEL_KEYS: Record<string, string> = {
  Home: "home",
  "Ionexa Chat": "chat",
  Timeline: "timeline",
  Favorites: "favorites",
  "Mission Control": "missionControl",
  "Weekly Reflection": "reflection",
  "AI Memory": "memory",
  Settings: "settings",
  Team: "team",
  "Help Centre": "help",
  "AI Agents": "agents",
  Websites: "websites",
  "Website Builder": "websiteBuilder",
  Apps: "apps",
  Images: "images",
  Videos: "videos",
  "AI Coding": "coding",
  "Data Analysis": "dataAnalysis",
  Documents: "documents",
  "Presentation Notes": "presentations",
  Campaigns: "campaigns",
  Analytics: "analytics",
  Finance: "finance",
  Content: "content",
  Sales: "sales",
  Products: "products",
  Research: "research",
  Learning: "learning",
  Ideas: "ideas",
  Competitors: "competitors",
  Decisions: "decisions",
  Feedback: "feedback",
  Trading: "trading",
  "Trading Workflow": "tradingWorkflow",
  "Product Workflow": "productWorkflow",
  Automation: "automation",
  Marketplace: "marketplace",
};
