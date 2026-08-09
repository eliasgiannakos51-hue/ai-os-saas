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
  "Website Plans": "websites",
  "Website Builder": "websiteBuilder",
  Apps: "apps",
  Images: "images",
  Videos: "videos",
  "AI Coding": "coding",
  "Data Analysis": "dataAnalysis",
  Documents: "documents",
  Presentations: "presentations",
  Campaigns: "campaigns",
  Analytics: "analytics",
  Finance: "finance",
  Marketing: "content",
  CRM: "sales",
  Products: "products",
  Knowledge: "research",
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
