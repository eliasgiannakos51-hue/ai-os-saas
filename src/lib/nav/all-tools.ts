// ALL TOOLS, AS THE DESIGN GROUPS THEM. Five headings today — Make, Ask,
// Automate, Organise, Business — big squares, no «beta». A sixth, Learn
// (MASTER Μέρος 20 Α4, owner, 2026-10-14), is not declared below: Α4 gives
// it no "Εργαλεία:" line at all, so it has no square of its own to draw
// until it has ready-work shortcuts to show — the registry Α2 describes,
// which is not built yet. An empty group would render nothing anyway
// (tools-grid.tsx filters groups with zero items), so leaving it out here
// is the same outcome, stated rather than silent.
//
// AUTOMATE IS NEW (Βήμα 4, 2026-10-21): Α4 names it as its own group —
// Βοηθοί, Αυτοματισμοί — where this file had Αυτοματισμοί folded into
// Organise. Αυτοματισμοί (Automations, /dashboard/automation) moves here;
// Βοηθοί has no page yet, so Automate draws one square today, same as
// every other group draws only the tools that exist.
//
// THE OTHER TEN OF Α4's SIXTEEN NAMES — Βίντεο, Ταινίες, Studio, Avatars,
// Ήχος, Έγγραφα, Επιχείρηση — are NOT a rename of a page already in this
// file. Checked by hand before this round: Έγγραφα's own ready-work list
// (Α4) routes "Παρουσίαση", "Βιογραφικό" AND "Υπολογιστικό φύλλο" all to
// one tool, but this product has those as two separately-flagged pages
// today (/dashboard/presentations, /dashboard/documents) whose own
// document-writer flag never mentions slides — a real merge-or-not
// decision, not something this file can infer. And /dashboard/business-health,
// the one page whose name is close to "Επιχείρηση", is owner-only
// (`isAdminEmail(...) ?? notFound()`) — every signed-in customer who
// clicked that tile would get a 404, which is the one thing NEEDS 19's own
// rule exists to prevent. Left unmapped rather than guessed; see
// docs/PROGRESS.md, 2026-10-21, for the full list and what unblocks each.
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

export type AllToolsGroupKey = "make" | "ask" | "automate" | "organise" | "business";

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
    key: "automate",
    hrefs: ["/dashboard/automation"],
  },
  {
    key: "organise",
    hrefs: [
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
 * messages/*.json, and under dashboard.tools.lines for the one line under
 * it — short enough to keep the square a square on a 390px phone, where
 * the sidebar's longer hints made two of them taller than wide (measured
 * 2026-10-08, scripts/tests/all-tools-empty-chat-edges.prodtest.mjs). The
 * grid reads both through literal maps, so the message slicer can bound
 * them. "What it remembers" is Memory from here on, and the row that
 * was "Mine" is called the Library everywhere since 2026-10-14
 * (sidebar.items.mine, scripts/tests/library.test.mjs §7).
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
  { href: "/dashboard/integrations", group: "organise", flag: "connections", name: "connections" },
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
