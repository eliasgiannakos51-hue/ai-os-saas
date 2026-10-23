// ALL TOOLS, THE FINAL GRID (the owner's message "ALL TOOLS: ΤΟ ΤΕΛΙΚΟ
// GRID", 2026-10-23): exactly seventeen tools, in five groups, in this
// order, under these names and these lines. Everything the grid showed
// before is gone from it; nothing behind it was deleted — every old tool
// is listed in HIDDEN_FROM_ALL_TOOLS below and still opens at its address.
//
// A TOOL THAT DOES NOT WORK DOES NOT APPEAR (the owner's rule, 2026-10-05
// and again 2026-10-23). The registry holds all seventeen so the order and
// the wording are decided once, but only an entry with `ready: true` is
// drawn, and an entry with `needs` is drawn only when the server says that
// thing is present (see availableTools). An entry that is not ready says
// what it is waiting for in `waitingFor`; the day it works, one line
// changes here and its square appears for everyone.
//
// Pure, and imports nothing from lib/flags/flags.ts (that reads the
// database) because the browser loads this file.
// scripts/tests/all-tools.test.mjs holds the registry both ways against
// the sidebar's tools and against the pages that exist.

export type AllToolsGroupKey = "record" | "ask" | "make" | "runAlone" | "organise";

export type AllToolsNameKey =
  | "myStuff" | "connect" | "analyze" | "research" | "rebuild" | "site" | "document" | "image"
  | "video" | "films" | "editing" | "avatars" | "coding" | "agents" | "automations" | "iowork" | "projects"
  // Names kept for tools that left the grid: other screens still read them
  // (components/analyze/analyze-shell.tsx reads names.files).
  | "files" | "slides" | "posts" | "goals" | "meetings" | "library" | "memory" | "finances" | "sales" | "trading" | "games";

/** Something outside the code a tool cannot work without. */
export type AllToolsNeed = "imageKey";

export type AllToolsEntry = {
  name: AllToolsNameKey;
  group: AllToolsGroupKey;
  /** Where the tool opens — the address it has, or will have. */
  href: string;
  /** Drawn at all. False means the tool is not finished end to end. */
  ready: boolean;
  /** Drawn only when the server finds this present. */
  needs?: AllToolsNeed;
  /** Why it is not drawn, when it is not ready (a sentence). */
  waitingFor?: string;
};

export const ALL_TOOLS: readonly AllToolsEntry[] = [
  // 1. ΚΑΤΑΓΡΑΨΕ
  { name: "myStuff", group: "record", href: "/dashboard/my-stuff", ready: true },
  {
    name: "connect", group: "record", href: "/dashboard/integrations", ready: false,
    waitingFor: "Phase 2, first: Connect built whole, with MCP — until then the Connections page stays reachable from Settings",
  },
  // 2. ΡΩΤΑ
  { name: "analyze", group: "ask", href: "/dashboard/data-analysis", ready: true },
  { name: "research", group: "ask", href: "/dashboard/deep-research", ready: true },
  // 3. ΦΤΙΑΞΕ
  {
    name: "rebuild", group: "make", href: "/dashboard/rebuild", ready: false,
    waitingFor: "Phase 2, second: not built yet",
  },
  { name: "site", group: "make", href: "/dashboard/website-builder", ready: true },
  { name: "document", group: "make", href: "/dashboard/documents", ready: true },
  { name: "image", group: "make", href: "/dashboard/images", ready: true, needs: "imageKey" },
  {
    name: "video", group: "make", href: "/dashboard/videos", ready: false,
    waitingFor: "Phase 2, third: needs a video provider key from the owner; /dashboard/videos is still the placeholder list",
  },
  {
    name: "films", group: "make", href: "/dashboard/films", ready: false,
    waitingFor: "Phase 2, fifth: needs the Video tool and a provider key from the owner",
  },
  {
    name: "editing", group: "make", href: "/dashboard/editing", ready: false,
    waitingFor: "Phase 2, fourth: not built yet",
  },
  {
    name: "avatars", group: "make", href: "/dashboard/avatars", ready: false,
    waitingFor: "Phase 2, sixth: needs an avatar provider key from the owner",
  },
  { name: "coding", group: "make", href: "/dashboard/coding", ready: true },
  // 4. ΤΡΕΞΕ ΜΟΝΟ ΤΟΥ
  { name: "agents", group: "runAlone", href: "/dashboard/agents", ready: true },
  { name: "automations", group: "runAlone", href: "/dashboard/automation", ready: true },
  {
    name: "iowork", group: "runAlone", href: "/dashboard/iowork", ready: false,
    waitingFor: "Phase 2, last: needs the owner's approval of the security plan and a desktop app",
  },
  // 5. ΟΡΓΑΝΩΣΕ
  { name: "projects", group: "organise", href: "/dashboard/projects", ready: true },
];

/** The five headings, in the order they are drawn. */
export const ALL_TOOLS_GROUP_ORDER: readonly AllToolsGroupKey[] = ["record", "ask", "make", "runAlone", "organise"];

/** What the server found present, for availableTools. */
export type AllToolsPresence = { imageKey: boolean };

/** The tools to draw: ready, and with whatever they need present. */
export function availableTools(presence: AllToolsPresence): readonly AllToolsEntry[] {
  return ALL_TOOLS.filter((t) => t.ready && (!t.needs || presence[t.needs]));
}

export const ALL_TOOLS_GROUPS: readonly { key: AllToolsGroupKey; hrefs: readonly string[] }[] = ALL_TOOLS_GROUP_ORDER.map((key) => ({
  key,
  hrefs: ALL_TOOLS.filter((t) => t.group === key).map((t) => t.href),
}));

/** The name key of each tool, by address. */
export const ALL_TOOLS_NAMES: Readonly<Record<string, AllToolsNameKey>> = Object.fromEntries(ALL_TOOLS.map((t) => [t.href, t.name]));

/**
 * Hidden from All tools, each with the reason. NOTHING HERE IS REMOVED:
 * every one still opens at its own address, from the search (⌘K) and,
 * where it has one, from the sidebar or Settings. The tools of the final
 * grid are not in this table — they are in ALL_TOOLS above.
 */
export const HIDDEN_FROM_ALL_TOOLS: Readonly<Record<string, string>> = {
  "/dashboard/presentations":
    "Slides is not among the seventeen of the final grid (2026-10-23); the page, its data and its address are unchanged, and the sidebar's own Slides row is untouched",
  "/dashboard/posts":
    "Posts is not among the seventeen of the final grid; unchanged otherwise, same as Slides above",
  "/dashboard/meetings":
    "Meetings is not among the seventeen of the final grid; unchanged otherwise, same as Slides above",
  "/dashboard/timeline":
    "the Library is not among the seventeen of the final grid; unchanged otherwise, same as Slides above",
  "/dashboard/files":
    "Files merged into Analyze 2026-10-22: one square, at /dashboard/data-analysis, reads both data files and documents (components/analyze/analyze-shell.tsx). This address redirects there (carrying ?record=)",
  "/dashboard/ai-memory":
    "Memory is not among the seventeen of the final grid; unchanged otherwise, same as Slides above",
  "/dashboard/finance":
    "Finances is not among the seventeen of the final grid; unchanged otherwise, same as Slides above — its data is read by My Stuff, never moved",
  "/dashboard/sales":
    "Sales is not among the seventeen of the final grid; unchanged otherwise, same as Slides above — its data is read by My Stuff, never moved",
  "/dashboard/trading":
    "Trading is not among the seventeen of the final grid; unchanged otherwise, same as Slides above — its data is read by My Stuff, never moved",
  "/dashboard/mission":
    "Goals is inside Projects in the final grid (2026-10-23: \"οι στόχοι μέσα του\"); the Goals page and address are unchanged, same as Slides above",
  "/dashboard/predictions":
    "the name promises forecasts; today it finds patterns in the account's own rows, with the sample each rests on, and forecasts nothing",
  "/dashboard/games":
    "Games is not among the seventeen of the final grid (2026-10-23); the page keeps its own switch (games) and opens at its address",
  "/dashboard/chat":
    "Ask me is a row of the sidebar itself (MASTER 14.1), so a square here would be a second door to the same room",
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
    "not among the tools in the final grid; it opens at its address and from the search",
};

export function allToolsGroupOf(href: string): AllToolsGroupKey | null {
  return ALL_TOOLS.find((t) => t.href === href)?.group ?? null;
}
