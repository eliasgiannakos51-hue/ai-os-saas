// Shared translation-key lookup for lib/sidebar-nav.ts's English `heading`/
// `label` strings, used by both Sidebar and CommandPalette so their
// translated display never drifts apart. The underlying strings stay
// English (state keys, search matching) — only the rendered label goes
// through messages/*.json's sidebar.items.
export const GROUP_HEADING_KEYS: Record<string, string> = {
  Workspace: "workspace",
  Build: "build",
  Business: "business",
  Strategy: "strategy",
  Operations: "operations",
  Marketplace: "marketplace",
  Settings: "settings",
};

export const ITEM_LABEL_KEYS: Record<string, string> = {
  Home: "home",
  "Ionexa Chat": "chat",
  Timeline: "timeline",
  "Mission Control": "missionControl",
  "Weekly Reflection": "reflection",
  "AI Memory": "memory",
  Settings: "settings",
  Team: "team",
  "AI Agents": "agents",
  Websites: "websites",
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
  Automation: "automation",
  Marketplace: "marketplace",
};
