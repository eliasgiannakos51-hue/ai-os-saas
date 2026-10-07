// ALL TOOLS, AS THE DESIGN GROUPS THEM (ΣΥΣΤΗΜΑ DESIGN §6, 2026-10-05):
// Make, Ask, Organise, Business — four headings, big squares, no «beta».
// Since 2026-10-07, exactly the tools MASTER Μέρος 14.1 names, with its
// one-word names, and nothing from Settings.
//
// WHAT IS SHOWN IS THE OWNER'S RULE (NEEDS 19, decided 2026-10-05): a tool
// is shown when it does its main job end to end today, even if it does
// not yet pass every BUILD-SPECS scenario. It is hidden when it is only a
// screen, when it produces nothing, or when its NAME promises something it
// does not do. A hidden tool comes back when it works; its page still opens
// by its address, so nothing anybody has is taken away.
//
// The sidebar's own groups (lib/sidebar-nav.ts) are untouched: the palette
// and the gates on that list still read it. This file only says where each
// of those tools sits on the All tools page, and the gate
// (scripts/tests/all-tools.test.mjs) holds that every visible tool is in
// exactly one group here or hidden here with a reason — both ways.

export type AllToolsGroupKey = "make" | "ask" | "organise" | "business";

export const ALL_TOOLS_GROUPS: readonly { key: AllToolsGroupKey; hrefs: readonly string[] }[] = [
  {
    key: "make",
    hrefs: ["/dashboard/website-builder", "/dashboard/presentations", "/dashboard/posts"],
  },
  {
    key: "ask",
    hrefs: ["/dashboard/deep-research", "/dashboard/data-analysis", "/dashboard/files"],
  },
  {
    key: "organise",
    hrefs: [
      "/dashboard/automation",
      "/dashboard/projects",
      "/dashboard/mission",
      "/dashboard/meetings",
      "/dashboard/timeline",
      "/dashboard/ai-memory",
    ],
  },
  {
    key: "business",
    hrefs: ["/dashboard/finance", "/dashboard/sales", "/dashboard/trading"],
  },
];

/**
 * THE ONE-WORD NAME ON EACH SQUARE (MASTER Μέρος 14.1, 2026-10-07: «Μεγάλα
 * τετράγωνα: εικονίδιο, όνομα μίας λέξης, μία γραμμή», and the names it
 * lists). The value is the key under dashboard.tools.names in
 * messages/*.json; the grid reads it through a literal map, so the
 * message slicer can bound it. "Mine" is Library and "What it remembers"
 * is Memory from here on.
 */
export const ALL_TOOLS_NAMES: Readonly<Record<string, AllToolsNameKey>> = {
  "/dashboard/website-builder": "site",
  "/dashboard/presentations": "slides",
  "/dashboard/posts": "posts",
  "/dashboard/deep-research": "research",
  "/dashboard/data-analysis": "analyze",
  "/dashboard/files": "files",
  "/dashboard/automation": "automations",
  "/dashboard/projects": "projects",
  "/dashboard/mission": "goals",
  "/dashboard/meetings": "meetings",
  "/dashboard/timeline": "library",
  "/dashboard/ai-memory": "memory",
  "/dashboard/finance": "finances",
  "/dashboard/sales": "sales",
  "/dashboard/trading": "trading",
};

export type AllToolsNameKey =
  | "site" | "slides" | "posts" | "research" | "analyze" | "files" | "automations" | "projects"
  | "goals" | "meetings" | "library" | "memory" | "finances" | "sales" | "trading";

/**
 * Hidden from All tools, each with the reason. NOTHING HERE IS REMOVED:
 * every one still opens at its own address, from the search (⌘K) and,
 * where 14.1 says so, from Settings or the sidebar.
 */
export const HIDDEN_FROM_ALL_TOOLS: Readonly<Record<string, string>> = {
  "/dashboard/predictions":
    "the name promises forecasts; today it finds patterns in the account's own rows, with the sample each rests on, and forecasts nothing",
  "/dashboard/documents":
    "today it keeps notes the person writes and does not write a document with AI, which its name promises (MASTER 14.1: hidden until it does)",
  "/dashboard/chat":
    "Ask me is a row of the sidebar itself (MASTER 14.1), so a square here would be a second door to the same room",
  "/dashboard/coding":
    "Coding is a row of the sidebar itself (MASTER 14.1), so a square here would be a second door to the same room",
  "/dashboard/voice":
    "Voice is the microphone in every field (MASTER 14.1), not a tool of its own; the page still opens from Settings and the search",
  "/dashboard/search":
    "Search my records is the search itself (⌘K and the field on Home), not a square (MASTER 14.1)",
  "/dashboard/activity":
    "Activity is reached from the search (MASTER 14.1); its page and every card on it still open at its address",
  "/dashboard/reflection":
    "Your week becomes a message inside Goals (MASTER 14.1); until it does, it opens at its own address and from the search",
  "/dashboard/team":
    "Team belongs to Settings (MASTER 14.1), where the plan that includes it is managed; it still opens at its address",
  "/dashboard/business-health":
    "not among the tools the owner listed as staying in All tools (MASTER 14.1); it opens at its address and from the search",
};

export function allToolsGroupOf(href: string): AllToolsGroupKey | null {
  return ALL_TOOLS_GROUPS.find((g) => g.hrefs.includes(href))?.key ?? null;
}
