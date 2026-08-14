// Shared translation-key lookup for lib/sidebar-nav.ts's English `heading`/
// `label` strings, used by both Sidebar and CommandPalette so their
// translated display never drifts apart. The underlying strings stay
// English (state keys, search matching) — only the rendered label goes
// through messages/*.json's sidebar.items.
// EVERY HEADING sidebar-nav.ts ACTUALLY RENDERS, and that is the whole
// point of the list.
//
// It used to map Create / My Business / Track / Insights while
// lib/sidebar-nav.ts rendered Workspace / Build / Business / Strategy —
// four headings with no entry here, so translatedHeading() fell through
// and printed raw English in all ten locales, with correct translations
// sitting unreachable in messages/*.json beside them. The comment that
// stood here described a rename ("Renamed from Build/Business/Strategy")
// that was never made in the file it claimed to describe, which is why
// nobody looking at this map could see anything wrong with it.
//
// A key here that no heading uses is dead, and a heading with no key
// here is untranslated. Both are checked by
// scripts/tests/sidebar-naming.test.mjs rather than by reading.
export const GROUP_HEADING_KEYS: Record<string, string> = {
  Workspace: "workspace",
  // Build now holds only the three things that really generate
  // something: the agent builder, the site builder, and what it
  // published. Everything else moved to Tracking.
  Build: "build",
  Tracking: "tracking",
  Business: "business",
  Strategy: "strategy",
  Operations: "operations",
  Marketplace: "marketplace",
  Settings: "settings",
};

// FIVE ENTRIES WERE MISSING HERE, and the way that showed up is worth
// recording: renaming "Published Sites" in messages/*.json changed
// nothing on screen, because this map had no entry for it and
// translatedLabel() fell through to the English state key. The
// translations existed. Nothing could reach them.
//
// Files, Deep Research, Published Sites, Websites and Integrations were
// all in that state — raw English in all ten locales, in the sidebar, on
// every page. scripts/tests/sidebar-naming.test.mjs now fails on any
// label sidebar-nav.ts renders without a key here.
export const ITEM_LABEL_KEYS: Record<string, string> = {
  Home: "home",
  Files: "files",
  "Deep Research": "deepResearch",
  "Published Sites": "published",
  Websites: "websites",
  Integrations: "integrations",
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
  "Presentation Notes": "presentations",
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
