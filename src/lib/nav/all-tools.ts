// ALL TOOLS, AS THE DESIGN GROUPS THEM. Six headings, big squares, no
// «beta»: Make, Ask, Automate, Organise, Business, Learn (the owner's
// critical message, 2026-10-22 — Automate and Learn are new; Automation
// and Connections moved out of Organise into Automate, and Research and
// Memory moved out of Ask into Learn). Since 2026-10-07, exactly the
// tools MASTER Μέρος 14.1 names, with its one-word names, and nothing
// from Settings.
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

export type AllToolsGroupKey = "make" | "ask" | "automate" | "organise" | "business" | "learn";

// SLIDES, POSTS, MEETINGS, LIBRARY, MEMORY, FINANCES, SALES AND TRADING
// LEFT THIS GRID ON 2026-10-22 (the owner's message right after #332):
// their hrefs are gone from the groups below and added to
// HIDDEN_FROM_ALL_TOOLS instead — same mechanism as Predictions, Voice
// and the rest of that table. Nothing about the tools themselves moved:
// every route, page, API route, database table and i18n string is
// untouched, and what each of them does is still reachable by typing it
// into Chat. Finance, Sales and Trading were this grid's whole "business"
// group, so that heading no longer renders at all — nothing hidden here
// is a bug, ALL_TOOLS_GROUPS.filter((g) => g.items.length > 0) already
// drops an empty group the same way it always has.
//
// WHAT WOULD BE DELETED, if the owner says so later (not done — see the
// 2026-10-22 entry in docs/PROGRESS.md for the full per-tool list: route,
// component folder, switch if any, and tables).
export const ALL_TOOLS_GROUPS: readonly { key: AllToolsGroupKey; hrefs: readonly string[] }[] = [
  {
    key: "make",
    hrefs: ["/dashboard/website-builder"],
  },
  // DEEP RESEARCH MOVED HERE from "learn" on 2026-10-22 (the owner's
  // follow-up after #334 — "Deep Research πηγαίνει στο Ask"). A rename
  // alone was done in #334; the group reassignment is this line.
  {
    key: "ask",
    hrefs: ["/dashboard/data-analysis", "/dashboard/files", "/dashboard/deep-research"],
  },
  {
    key: "automate",
    hrefs: ["/dashboard/automation"],
  },
  // GOALS LEFT THIS GROUP ON 2026-10-22 (the owner's follow-up after
  // #334 — "Goals μπαίνει μέσα στα Projects"). Its href moved to
  // HIDDEN_FROM_ALL_TOOLS below with a reason; the Projects hub (Μέρος
  // 20Δ §6, not built yet) is where it is meant to surface instead of a
  // square of its own.
  {
    key: "organise",
    hrefs: ["/dashboard/projects"],
  },
  // EMPTY ON PURPOSE since 2026-10-22: Finance, Sales and Trading were
  // this group's only three hrefs, and all three left the grid above.
  // The key stays, in order, so a reader (and the "six groups, in the
  // design's order" check) still sees where Business sat; the grid
  // itself drops an empty group the same way it always has.
  {
    key: "business",
    hrefs: [],
  },
  // EMPTY ON PURPOSE since 2026-10-22 too: Deep Research was this
  // group's only href, and it just moved to "ask" above.
  {
    key: "learn",
    hrefs: [],
  },
];

/**
 * THE ONE-WORD NAME ON EACH SQUARE (MASTER Μέρος 14.1, 2026-10-07: «Μεγάλα
 * τετράγωνα: εικονίδιο, όνομα μίας λέξης, μία γραμμή», and the names it
 * lists). The value is the key under dashboard.tools.names in
 * messages/*.json, and under dashboard.tools.lines for the one line under
 * it — short enough to keep the square a square on a 390px phone, where
 * the sidebar's longer hints made two of them taller than wide (measured
 * 2026-10-08, scripts/tests/all-tools-empty-chat-edges.prodtest.mjs). The
 * grid reads both through literal maps, so the message slicer can bound
 * them. "What it remembers" is Memory from here on, and the row that
 * was "Mine" is called the Library everywhere since 2026-10-14
 * (sidebar.items.mine, scripts/tests/library.test.mjs §7).
 */
// SLIDES, POSTS, MEETINGS, LIBRARY, MEMORY, FINANCES, SALES, TRADING AND
// NOW GOALS LOST THEIR ENTRY HERE TOO, 2026-10-22, for the same reason as
// ALL_TOOLS_GROUPS above — only the ones ALL_TOOLS_GROUPS still draws a
// square for get a one-word name read off this map. Their keyPrefix,
// their names/lines record entry below, and every i18n string for them
// are untouched on purpose (the owner's "don't delete code yet").
export const ALL_TOOLS_NAMES: Readonly<Record<string, AllToolsNameKey>> = {
  "/dashboard/website-builder": "site",
  "/dashboard/deep-research": "research",
  "/dashboard/data-analysis": "analyze",
  "/dashboard/files": "files",
  "/dashboard/automation": "automations",
  "/dashboard/projects": "projects",
};

export type AllToolsNameKey =
  | "site" | "slides" | "posts" | "research" | "analyze" | "files" | "automations" | "projects"
  | "goals" | "meetings" | "library" | "memory" | "finances" | "sales" | "trading"
  | "image" | "connections" | "document" | "games";

/**
 * THE NEW TOOLS, EACH BEHIND ITS OWN SWITCH (MASTER Μέρος 14.1: «Κάθε νέο
 * εργαλείο μπαίνει εδώ μόλις γίνει λειτουργικό: Image, … Connections»).
 * A square here is drawn for exactly the people its switch in
 * lib/flags/flags.ts is on for — the owner and the test account first,
 * everyone once he opens it on /dashboard/system-health — and the page
 * behind it reads the same switch (app/dashboard/images/page.tsx,
 * app/dashboard/integrations/page.tsx, where it is the Connect button).
 * Turning the switch off takes the square away again. `flag` is a plain
 * string so that this file, which the browser loads, imports nothing from
 * lib/flags/flags.ts (it reads the database);
 * scripts/tests/all-tools.test.mjs holds that every one names a switch
 * that exists. Found missing on 2026-10-08: both tools were built
 * (packages 19 and 31) and neither had a square, so opening them to
 * everyone would have left Image reachable only by its address and ⌘K,
 * and Connections only from Settings, where 14.1 put Integrations
 * (app/dashboard/settings/page.tsx).
 */
export const SWITCHED_SQUARES: readonly { href: string; group: AllToolsGroupKey; flag: string; name: AllToolsNameKey }[] = [
  { href: "/dashboard/images", group: "make", flag: "image-studio", name: "image" },
  { href: "/dashboard/integrations", group: "automate", flag: "connections", name: "connections" },
  // Package 14: without its switch the page keeps notes and is hidden
  // below (HIDDEN_FROM_ALL_TOOLS); with it, it writes documents.
  { href: "/dashboard/documents", group: "make", flag: "document-writer", name: "document" },
  // Package 26: no sidebar row at all (SWITCH_ONLY_ITEMS below).
  { href: "/dashboard/games", group: "make", flag: "games", name: "games" },
];

/**
 * A TOOL THAT EXISTS ONLY BEHIND ITS SWITCH (Games, package 26), with no
 * row in the sidebar's config. That config is also the search (⌘K) and
 * the records hub, which read no switch: a row there would be a door to
 * a page that, for everybody the switch does not admit, does not exist.
 * So its square is described here, and All tools draws it through
 * SWITCHED_SQUARES only for those whose switch is on. Pure, like the rest
 * of this file; the grid gives it its icon
 * (components/tools/tools-grid.tsx SWITCH_ONLY_ICONS).
 */
export const SWITCH_ONLY_ITEMS: Readonly<Record<string, { label: string; hintKey: string }>> = {
  "/dashboard/games": { label: "Games", hintKey: "games" },
};

/**
 * Hidden from All tools, each with the reason. NOTHING HERE IS REMOVED:
 * every one still opens at its own address, from the search (⌘K) and,
 * where 14.1 says so, from Settings or the sidebar.
 */
export const HIDDEN_FROM_ALL_TOOLS: Readonly<Record<string, string>> = {
  "/dashboard/presentations":
    "Slides left the grid 2026-10-22 (the owner's message after #332); the page, its data and its address are unchanged, and the sidebar's own Slides row is untouched",
  "/dashboard/posts":
    "Posts left the grid 2026-10-22; unchanged otherwise, same as Slides above",
  "/dashboard/meetings":
    "Meetings left the grid 2026-10-22; unchanged otherwise, same as Slides above",
  "/dashboard/timeline":
    "the Library left the grid 2026-10-22; unchanged otherwise, same as Slides above",
  "/dashboard/ai-memory":
    "Memory left the grid 2026-10-22; unchanged otherwise, same as Slides above",
  "/dashboard/finance":
    "Finances left the grid 2026-10-22, on the way to being replaced by a single records tool (owner's message, not built yet); unchanged otherwise, same as Slides above",
  "/dashboard/sales":
    "Sales left the grid 2026-10-22, on the way to being replaced by a single records tool (owner's message, not built yet); unchanged otherwise, same as Slides above",
  "/dashboard/trading":
    "Trading left the grid 2026-10-22, on the way to being replaced by a single records tool (owner's message, not built yet); unchanged otherwise, same as Slides above",
  "/dashboard/mission":
    "Goals left the grid 2026-10-22 (the owner's follow-up after #334: \"Goals μπαίνει μέσα στα Projects\"), on its way into the Projects hub instead of its own square (Μέρος 20Δ §6, not built yet); unchanged otherwise, same as Slides above",
  "/dashboard/predictions":
    "the name promises forecasts; today it finds patterns in the account's own rows, with the sample each rests on, and forecasts nothing",
  "/dashboard/games":
    "without the switch games the page does not exist (package 26); with it on, its square is drawn under Make (SWITCHED_SQUARES)",
  "/dashboard/documents":
    "without the switch document-writer it keeps notes the person writes and does not write a document with AI, which its name promises (MASTER 14.1: hidden until it does); with the switch on it writes them, and its square is drawn under Make (SWITCHED_SQUARES)",
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
