// ALL TOOLS, THE FINAL GRID — EVERY SQUARE (the owner's message "ALL TOOLS:
// ΟΛΑ ΤΑ ΤΕΤΡΑΓΩΝΑ", 2026-10-24): 24 big tiles in 5 groups, in this order,
// plus a 6th group (Learn) that carries only small ready-made jobs — no big
// tile of its own. A 25th tile, 3D, joined the "make" group 2026-10-31
// (owner's "23. 3D: ΝΕΟ ΕΡΓΑΛΕΙΟ", right after Image). Replaces the
// 17-tile round of 2026-10-23
// ("ALL TOOLS: ΤΟ ΤΕΛΙΚΟ GRID"): the 12 that worked then stay exactly as
// they were (same hrefs, same names), and 12 more join — some because they
// already worked end to end and only needed a switch removed (Meetings,
// Slides, Posts, Games), one newly built (Translate), and the rest as
// Coming Soon tiles (§3 below) because they are not built yet.
//
// A TOOL THAT DOES NOT WORK STILL GETS A TILE NOW — the one rule this round
// changes from 2026-10-23's "a tool that does not work does not appear".
// `ready: false` no longer hides the tile; it switches its own page from
// the real tool to components/tools/coming-soon-shell.tsx (a small
// «Σύντομα» mark, the same design, field disabled, a Notify-me button —
// never a provider call, never a charge). `waitingFor` is read by nobody
// in the UI any more — it stays as the honest record of what blocks it,
// for `docs/NEEDS-FROM-ELIAS.md` and for whoever reads this file next.
//
// Pure, and imports nothing from lib/flags/flags.ts (that reads the
// database) because the browser loads this file.
// scripts/tests/all-tools.test.mjs holds the registry both ways against
// the sidebar's tools and against the pages that exist.

export type AllToolsGroupKey = "record" | "ask" | "make" | "runAlone" | "organise" | "learn";

export type AllToolsNameKey =
  | "myStuff" | "connect" | "meetings" | "analyze" | "research" | "translate"
  | "rebuild" | "site" | "apps" | "games" | "document" | "slides" | "posts"
  | "image" | "threeD" | "video" | "films" | "editing" | "avatars" | "audio" | "coding"
  | "agents" | "automations" | "iowork" | "projects"
  // Kept so other screens can still read a name/line that is no longer a
  // tile of its own (components/analyze/analyze-shell.tsx reads
  // names.files for its work pane's title).
  | "files" | "goals" | "library" | "memory" | "finances" | "sales" | "trading";

/** Something outside the code a tool cannot work without. */
export type AllToolsNeed = "imageKey";

export type AllToolsEntry = {
  name: AllToolsNameKey;
  group: AllToolsGroupKey;
  /** Where the tool opens. For a `ready: false` entry this is a NEW
   *  address when an old, unrelated feature already used the natural one
   *  (Apps, Video — see the note below each), so nothing existing is
   *  overwritten. */
  href: string;
  /** Drawn as the real tool. False draws the SAME tile with a «Σύντομα»
   *  mark, and the address renders components/tools/coming-soon-shell.tsx
   *  instead — never hidden, never a provider call, never a charge. */
  ready: boolean;
  /** Drawn only when the server finds this present (Image: the key). */
  needs?: AllToolsNeed;
  /** Why it is not ready (a sentence) — read by nobody in the UI; kept
   *  for docs/NEEDS-FROM-ELIAS.md and for whoever builds it next. */
  waitingFor?: string;
};

export const ALL_TOOLS: readonly AllToolsEntry[] = [
  // 1. ΚΑΤΑΓΡΑΨΕ
  { name: "myStuff", group: "record", href: "/dashboard/my-stuff", ready: true },
  // CONNECT, built whole 2026-10-26: an app is connected by its address (MCP
  // over HTTPS) with an optional token, needing nothing from the owner; the
  // Google and Slack cards on the same page appear only where their OAuth
  // apps are set up. Chat does not use these apps yet.
  { name: "connect", group: "record", href: "/dashboard/integrations", ready: true },
  // MEETINGS: already built (MASTER 16, package 17) — recording to
  // transcript, summary and actions; only `meeting-goal` (actions become a
  // goal's steps) was ever behind its own switch, which stays, as a
  // sub-feature, not a reason to hide the tile.
  { name: "meetings", group: "record", href: "/dashboard/meetings", ready: true },
  // 2. ΡΩΤΑ
  { name: "analyze", group: "ask", href: "/dashboard/data-analysis", ready: true },
  { name: "research", group: "ask", href: "/dashboard/deep-research", ready: true },
  // TRANSLATE: not a tool of its own yet — the `translate` switch still
  // gates the Translate button embedded inside Documents and the Site
  // builder, and that is the only place it lives. /dashboard/translate is
  // a new address (nothing existing used it) carrying the Coming Soon
  // screen until a free-standing paste-text-pick-a-language tool is built.
  {
    name: "translate", group: "ask", href: "/dashboard/translate", ready: false,
    waitingFor: "not built as its own tool — today it is only the Translate button inside Documents (src/components/documents/documents-shell.tsx) and the Site builder (src/app/dashboard/website-builder/page.tsx), both behind the `translate` switch",
  },
  // 3. ΦΤΙΑΞΕ
  { name: "rebuild", group: "make", href: "/dashboard/rebuild", ready: true },
  { name: "site", group: "make", href: "/dashboard/website-builder", ready: true },
  // APPS: "an app that saves data, from a description" is not built — the
  // owner named it as the expected Coming Soon example. /dashboard/apps
  // ALREADY EXISTS as a different, older feature (a hidden sidebar row, a
  // manually-typed tracker of app ideas — src/lib/modules.ts,
  // BuildModulePage) with its own rows in the database; giving this new
  // tile that same address would silently replace a reachable feature's
  // screen with Coming Soon. So this tile's address is new
  // (/dashboard/app-builder) and /dashboard/apps is untouched, still
  // reachable, listed in HIDDEN_FROM_ALL_TOOLS below.
  {
    name: "apps", group: "make", href: "/dashboard/app-builder", ready: false,
    waitingFor: "not built: a real generator (screens, saved data, a working form/list) rather than the manually-typed tracker /dashboard/apps already is",
  },
  // GAMES: already built (MASTER 16, package 26); only the switch `games`
  // (owner+test-account only) stood between it and everyone, removed
  // 2026-10-24.
  { name: "games", group: "make", href: "/dashboard/games", ready: true },
  // DOCUMENT: line changed from "Documents, slides and sheets" to
  // "Documents and sheets" — Slides is its own tile now.
  { name: "document", group: "make", href: "/dashboard/documents", ready: true },
  // SLIDES: already built (the "presentations" page, MASTER 16 package 13
  // and earlier); only the switch `tool-shell` stood in front of it
  // (removed 2026-10-23 along with the other nine).
  { name: "slides", group: "make", href: "/dashboard/presentations", ready: true },
  // POSTS: already built, same reason as Slides.
  { name: "posts", group: "make", href: "/dashboard/posts", ready: true },
  { name: "image", group: "make", href: "/dashboard/images", ready: true, needs: "imageKey" },
  // 3D: brand new tool (the owner's "23. 3D: ΝΕΟ ΕΡΓΑΛΕΙΟ", 2026-10-31) —
  // the 25th tile, the owner's own piece 8 ("Τετράγωνο «3D» στο All
  // tools, στην ομάδα «Φτιάξε», μετά το Image"), added as a Σύντομα tile
  // now (same bootstrap every other half-built tool on this list gets)
  // so it is registered and reachable at all; it flips to `ready: true`
  // only once every piece of the directive passes.
  {
    name: "threeD", group: "make", href: "/dashboard/3d", ready: false,
    waitingFor: "the screen is built behind the '3d-tool' switch (Κομμάτι 2, docs/3D-PROVIDERS.md) but stays Σύντομα here until every piece passes — no photo-to-3D provider key from the owner yet",
  },
  // VIDEO: same reasoning as Apps — /dashboard/videos already exists as
  // the older manually-typed tracker (hidden sidebar row), so this tile's
  // address is new (/dashboard/video-studio) rather than overwriting it.
  {
    name: "video", group: "make", href: "/dashboard/video-studio", ready: false,
    waitingFor: "needs a video provider key from the owner (Veo, NEEDS-FROM-ELIAS) and the real build",
  },
  {
    name: "films", group: "make", href: "/dashboard/films", ready: false,
    waitingFor: "the screen is built behind the 'films-tool' switch (Κομμάτι 2, docs/FILMS-HONESTY.md) but stays Σύντομα here until every piece passes — pieces 5-9 still need Video/Audio/Editing's own generators, not just their provider keys",
  },
  {
    name: "editing", group: "make", href: "/dashboard/editing", ready: false,
    waitingFor: "the Remotion-engine screen is built behind the 'editing-tool' switch (Κομμάτι 2, docs/EDITING-REMOTION.md) but stays Σύντομα here until every piece of the owner's directive passes, same as every other half-built tool on this tile",
  },
  {
    name: "avatars", group: "make", href: "/dashboard/avatars", ready: false,
    waitingFor: "needs an avatar provider key from the owner (HeyGen, NEEDS-FROM-ELIAS)",
  },
  {
    name: "audio", group: "make", href: "/dashboard/audio", ready: false,
    waitingFor: "voice-over alone could reuse /dashboard/voice's engine, but podcasts and music are not built, so the combined tool is not ready end to end",
  },
  // CODING: its line stays "Write and fix code" rather than naming GitHub
  // (the owner's explicit instruction) until the GitHub App is set up
  // (NEEDS 11) and the connect/repository picker is visible to everyone.
  { name: "coding", group: "make", href: "/dashboard/coding", ready: true },
  // 4. ΤΡΕΞΕ ΜΟΝΟ ΤΟΥ
  { name: "agents", group: "runAlone", href: "/dashboard/agents", ready: true },
  { name: "automations", group: "runAlone", href: "/dashboard/automation", ready: true },
  {
    name: "iowork", group: "runAlone", href: "/dashboard/iowork", ready: false,
    // The security plan is approved (2026-10-25). What is still missing is
    // the two unanswered questions of its §8 and the signing accounts they
    // decide — docs/IOWORK-TECH.md carries both, with costs.
    waitingFor: "security plan approved; needs the owner's answers on Mac-first vs both and the signing accounts (docs/IOWORK-TECH.md), then signed desktop apps",
  },
  // 5. ΟΡΓΑΝΩΣΕ
  { name: "projects", group: "organise", href: "/dashboard/projects", ready: true },
];

/** The six headings, in the order they are drawn. "learn" carries no big
 *  tile of its own — only small ready-made jobs (lib/nav/quick-jobs.ts),
 *  every one of them opening Chat. */
export const ALL_TOOLS_GROUP_ORDER: readonly AllToolsGroupKey[] = ["record", "ask", "make", "runAlone", "organise", "learn"];

/** What the server found present, for availableTools. */
export type AllToolsPresence = { imageKey: boolean };

/** The tools whose tile is the REAL tool: ready, and with whatever they
 *  need present. Everything else in ALL_TOOLS is still drawn — as a
 *  Coming Soon tile — so this is "which tile is live", not "which tile
 *  is shown". */
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
  "/dashboard/timeline":
    "the Library is not a tile of the final grid (2026-10-23); its data is read by My Stuff, never moved, and the page is unchanged",
  "/dashboard/files":
    "Files merged into Analyze 2026-10-22: one square, at /dashboard/data-analysis, reads both data files and documents (components/analyze/analyze-shell.tsx). This address redirects there (carrying ?record=)",
  "/dashboard/apps":
    "an older, different feature at this same address — a manually-typed tracker of app ideas, not the generator the Apps tile promises (src/lib/modules.ts). It is unchanged and still reachable from the hidden sidebar row and the search; the new tile is /dashboard/app-builder, Coming Soon until it is built",
  "/dashboard/videos":
    "the same situation as /dashboard/apps: the older manually-typed tracker, unchanged, at a different address than the Video tile (/dashboard/video-studio, Coming Soon)",
  "/dashboard/ai-memory":
    "Memory is not a tile of the final grid; it opens from Settings and the search",
  "/dashboard/finance":
    "Finances is not a tile of the final grid; its data is read by My Stuff, never moved, and the page is unchanged",
  "/dashboard/sales":
    "Sales is not a tile of the final grid; its data is read by My Stuff, never moved, and the page is unchanged",
  "/dashboard/trading":
    "Trading is not a tile of the final grid; its data is read by My Stuff, never moved, and the page is unchanged",
  "/dashboard/mission":
    "Goals is inside Projects (2026-10-23: \"οι στόχοι μέσα του\"); the Goals page and address are unchanged",
  "/dashboard/predictions":
    "the name promises forecasts; today it finds patterns in the account's own rows, with the sample each rests on, and forecasts nothing",
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
