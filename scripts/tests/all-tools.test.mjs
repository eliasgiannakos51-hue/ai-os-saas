// ALL TOOLS IS THE DESIGN'S: BIG SQUARES IN FOUR GROUPS, A SEARCH THAT
// KNOWS SYNONYMS, A PIN ON EACH, AND NO «BETA» ANYWHERE.
//
// docs/CONTEXT.md, ΣΥΣΤΗΜΑ DESIGN §6 (2026-10-05): 1:1 squares, four in a
// row on a computer and two on a phone; a 28px icon top left, a small pin
// top right, the name and one plain line at the bottom; groups Make, Ask,
// Organise, Business; a search on top; no beta tag, so what is not working
// is not shown. WHICH tools is the owner's rule of 2026-10-05 (NEEDS 19),
// in src/lib/nav/all-tools.ts — held here BOTH ways against the tools the
// grid can draw, for a member and for the owner. Since 2026-10-07 (MASTER
// Μέρος 14.1) that is exactly the tools 14.1 names, each under its
// one-word name, with Document hidden while it only keeps notes and
// nothing from the Settings block — which is reached from Settings.
//
// The search is RUN — the palette's own matcher over the same candidates
// the grid builds (the grid's line that builds them is checked to be
// that line). BUILD-SPECS 2.4 scenario 10: "slides" finds Presentations.
//
// Run: node scripts/tests/all-tools.test.mjs
import { readFileSync } from "node:fs";
import { stripComments } from "../check-mutation-markers.mjs";
import { loadTs } from "./load-ts.mjs";
import { groupBlocks } from "./lib/sidebar-source.mjs";

let pass = 0;
const failures = [];
function check(name, cond, detail) {
  if (cond) {
    pass++;
    console.log(`  PASS  ${name}`);
  } else {
    failures.push(name);
    console.log(`  FAIL  ${name}${detail ? "\n        " + detail : ""}`);
  }
}
const LOCALES = ["el", "en", "de", "fr", "es", "it", "pt", "ja", "zh", "ar"];
const messages = Object.fromEntries(LOCALES.map((l) => [l, JSON.parse(readFileSync(`messages/${l}.json`, "utf8"))]));
const grid = stripComments(readFileSync("src/components/tools/tools-grid.tsx", "utf8"));

// The drawn tools, parsed from lib/sidebar-nav.ts (it imports fifty
// icons, so it is read rather than loaded) and filtered by the real
// sidebarGroups(). The Settings block is not drawn on All tools (MASTER
// 14.1), so it is not in the population.
const navSrc = readFileSync("src/lib/sidebar-nav.ts", "utf8");
const modules = await loadTs("src/lib/modules.ts");
const { sidebarGroups } = await loadTs("src/lib/sidebar-visibility.ts");
const parsed = groupBlocks(navSrc).map((mark) => ({
  heading: mark.heading,
  items: mark.body.split(/href:\s*/).slice(1).map((chunk) => {
    const head = chunk.split(/\n\s*\{/)[0];
    const literal = chunk.match(/^["'`]([^"'`]+)["'`]/)?.[1] ?? null;
    const constant = chunk.match(/^([A-Z_]+)\.href/)?.[1] ?? null;
    return {
      href: literal ?? (constant ? modules[constant]?.href ?? constant : null),
      label: chunk.match(/label:\s*["'`]([^"'`]+)["'`]/)?.[1] ?? chunk.match(/label:\s*([A-Z_]+)\.label/)?.[1] ?? "?",
      hidden: /hidden:\s*true/.test(head),
      notBuilt: /notBuilt:\s*true/.test(head),
      ownerOnly: /ownerOnly:\s*true/.test(head),
      retired: /retired:\s*["'`+]/.test(head) || /retired:\s*$/m.test(head) ? "declared" : undefined,
    };
  }),
}));
const drawnFor = (isOwner) => sidebarGroups(parsed, isOwner);
const drawn = drawnFor(false).filter((g) => g.heading !== "Settings");
const allDrawn = drawnFor(false).flatMap((g) => g.items);

console.log("== 0. the population ==");
check(`the sidebar's tools were read (${allDrawn.length} in ${drawn.length} groups and Settings)`, allDrawn.length >= 20 && drawn.length >= 4);

console.log("\n== 0b. every tool is in exactly one group, or hidden with a reason ==");
const { ALL_TOOLS_GROUPS, HIDDEN_FROM_ALL_TOOLS, SWITCH_ONLY_ITEMS } = await loadTs("src/lib/nav/all-tools.ts");
const grouped = ALL_TOOLS_GROUPS.flatMap((g) => g.hrefs);
const hidden = Object.keys(HIDDEN_FROM_ALL_TOOLS);
check("the four groups, in the design's order", ALL_TOOLS_GROUPS.map((g) => g.key).join(",") === "make,ask,organise,business");
// THE POPULATION IS WHAT THE GRID CAN DRAW: the owner's view, which is
// every member tool plus the owner-only ones, minus the Settings block.
// ...and the tools with no sidebar row, drawn only behind their switch
// (lib/nav/all-tools.ts SWITCH_ONLY_ITEMS, Games).
const switchOnly = Object.keys(SWITCH_ONLY_ITEMS);
const ownerTools = [...drawnFor(true).filter((g) => g.heading !== "Settings").flatMap((g) => g.items.map((i) => i.href)), ...switchOnly];
const memberTools = drawnFor(false).filter((g) => g.heading !== "Settings").flatMap((g) => g.items.map((i) => i.href));
check(`the population was read (${ownerTools.length} for the owner, ${memberTools.length} for a member)`, ownerTools.length >= memberTools.length && memberTools.length >= 20);
const unplaced = ownerTools.filter((h) => !grouped.includes(h) && !hidden.includes(h));
check("every tool the grid can draw is in a group or hidden on purpose", unplaced.length === 0, unplaced.join(", "));
const phantom = [...grouped, ...hidden].filter((h) => !ownerTools.includes(h));
check("...and every href in all-tools.ts is a tool the grid can draw (no stale entry)", phantom.length === 0, phantom.join(", "));
const twice = grouped.filter((h, i) => grouped.indexOf(h) !== i || hidden.includes(h));
check("...in exactly one place: no tool in two groups, none both grouped and hidden", twice.length === 0, twice.join(", "));
const bare = hidden.filter((h) => String(HIDDEN_FROM_ALL_TOOLS[h] ?? "").trim().length < 20);
check("...and every hidden tool says why, in a sentence", bare.length === 0, bare.join(", "));
check(
  "the grid draws the tools through those groups, and nothing else",
  /return ALL_TOOLS_GROUPS\.map\(/.test(grid) && /groupHrefs\(g, switchedOn\)\.map\(\(h\) => byHref\.get\(h\)\)/.test(grid)
);

// A HIDDEN TOOL THAT COMES BACK WITH ITS SWITCH (package 14: Document).
{
  const { SHOWN_BY_SWITCH, groupHrefs } = await loadTs("src/lib/nav/all-tools.ts");
  const { FLAGS } = await loadTs("src/lib/flags/flags.ts").catch(() => ({ FLAGS: null }));
  const flagsSrc = readFileSync("src/lib/flags/flags.ts", "utf8");
  const switched = Object.entries(SHOWN_BY_SWITCH);
  check(`a tool shown by its switch is hidden without it, with its reason (${switched.length})`, switched.length >= 1 && switched.every(([h]) => hidden.includes(h)));
  check("...its switch is a declared one", switched.every(([, s]) => new RegExp(`\\n  (?:"${s.flag}"|${s.flag}): "`).test(flagsSrc)) && (FLAGS === null || switched.every(([, s]) => s.flag in FLAGS)));
  check("a tool with no sidebar row is drawn only behind a switch, never in a group", switchOnly.every((h) => h in SHOWN_BY_SWITCH && !grouped.includes(h)) && /for \(const \[href, item\] of Object\.entries\(SWITCH_ONLY_ITEMS\)\) if \(!byHref\.has\(href\)\) byHref\.set\(href, \{ href, \.\.\.item, icon: SWITCH_ONLY_ICONS\[href\] \?\? LayoutGrid \}\);/.test(grid) && switchOnly.every((h) => new RegExp(`"${h.replace(/\//g, "\\/")}": [A-Z_]+_ICON`).test(grid)));
  const make = ALL_TOOLS_GROUPS.find((g) => g.key === "make");
  const ask = ALL_TOOLS_GROUPS.find((g) => g.key === "ask");
  check("...with the switch on, it is drawn in its own group, after the group's tools", JSON.stringify(groupHrefs(make, ["/dashboard/documents"])) === JSON.stringify([...make.hrefs, "/dashboard/documents"]));
  check("...and in no other group", !groupHrefs(ask, ["/dashboard/documents"]).includes("/dashboard/documents"));
  check("...and an href that is not switched cannot ride in on the list", JSON.stringify(groupHrefs(make, ["/dashboard/predictions"])) === JSON.stringify([...make.hrefs]));
  const toolsPage = stripComments(readFileSync("src/app/dashboard/tools/page.tsx", "utf8"));
  check("the page asks each switch for this person, and hands the grid what is on", /for \(const \[href, \{ flag \}\] of Object\.entries\(SHOWN_BY_SWITCH\)\)/.test(toolsPage) && /await isFeatureOn\(flag, user\)/.test(toolsPage) && /switchedOn=\{switchedOn\}/.test(toolsPage));
}
check("...and no Settings block: Settings, Integrations and Help are reached from Settings (MASTER 14.1)",
  !/SETTINGS_GROUP|\.\.\.settings\b/.test(grid));

const settingsPage = stripComments(readFileSync("src/app/dashboard/settings/page.tsx", "utf8"));
const settingsHrefs = Object.fromEntries(["/dashboard/integrations", "/help", "/dashboard/team"].map((h) => [h, new RegExp(`\\{ href: "${h.replace(/\//g, "\\/")}", label: tKey\\("sidebar\\.items\\.`).test(settingsPage)]));
check("...and Settings links to each of them, so nothing is lost", Object.values(settingsHrefs).every(Boolean), JSON.stringify(settingsHrefs));
check("...under a heading worded in every locale", /t\("places\.title"\)/.test(settingsPage) && LOCALES.every((l) => typeof messages[l].settings?.places?.title === "string" && messages[l].settings.places.title.length > 0));

console.log("\n== 0c. exactly the tools MASTER 14.1 names, each under its one-word name ==");
const { ALL_TOOLS_NAMES } = await loadTs("src/lib/nav/all-tools.ts");
// MASTER 14.1, word for word: «Site, Document, Slides, Posts, Research,
// Analyze, Files, Automations, Projects, Goals, Meetings, Finances, Sales,
// Trading, Library, Memory». Document is the one hidden today (below).
const MASTER_14_1 = ["Site", "Document", "Slides", "Posts", "Research", "Analyze", "Files", "Automations", "Projects", "Goals", "Meetings", "Finances", "Sales", "Trading", "Library", "Memory"];
const enNames = messages.en.dashboard?.tools?.names ?? {};
const shownNames = grouped.map((h) => enNames[ALL_TOOLS_NAMES[h]]);
const expected = MASTER_14_1.filter((n) => n !== "Document");
check(`every grouped tool has a one-word name (${grouped.length} squares)`, grouped.every((h) => ALL_TOOLS_NAMES[h]), grouped.filter((h) => !ALL_TOOLS_NAMES[h]).join(", "));
check("...and the English names are exactly 14.1's list, Document aside",
  [...shownNames].sort().join(",") === [...expected].sort().join(","), `shown ${shownNames.join(", ")}`);
{
  const { SHOWN_BY_SWITCH } = await loadTs("src/lib/nav/all-tools.ts");
  check("...and no name is given to a tool that is never shown", Object.keys(ALL_TOOLS_NAMES).every((h) => grouped.includes(h) || h in SHOWN_BY_SWITCH));
}
check("Document is hidden, with the reason 14.1 gives (notes only)", /notes/.test(HIDDEN_FROM_ALL_TOOLS["/dashboard/documents"] ?? ""));
for (const l of LOCALES) {
  const n = messages[l].dashboard?.tools?.names ?? {};
  const keys = Object.values(ALL_TOOLS_NAMES);
  const bad = keys.filter((k) => typeof n[k] !== "string" || n[k].trim() === "" || /\s/.test(n[k].trim()));
  check(`${l}: every square's name is one word`, bad.length === 0, bad.map((k) => `${k}=${JSON.stringify(n[k])}`).join(", "));
}
check("the square draws the one-word name, and falls back to the sidebar's only for a tool without one",
  /const label = \(item: SidebarItem\) => \(ALL_TOOLS_NAMES\[item\.href\] \? names\[ALL_TOOLS_NAMES\[item\.href\]\] : longLabel\(item\)\);/.test(grid));
check("no «In testing…» line on the page (MASTER 14.1)",
  !/inTesting|In testing/i.test(grid) && LOCALES.every((l) => !/in testing/i.test(JSON.stringify(messages[l].dashboard?.tools ?? {}))));

console.log("\n== 1. the search finds a tool by a word it is not called ==");
const match = await loadTs("src/lib/command-palette-match.ts");
const { ITEM_LABEL_KEYS } = await loadTs("src/lib/sidebar-label-keys.ts");
const { aliasesFor } = await loadTs("src/lib/palette-aliases.ts");
check(
  "the grid builds its candidates the way the palette does, plus the one-word name and the description",
  /candidates: \[label\(item\), longLabel\(item\), item\.label, \.\.\.aliasesFor\(ITEM_LABEL_KEYS\[item\.label\] \?\? "", locale\), hint\(item\)\]/.test(grid) &&
    /filterAndRankCandidates\(/.test(grid)
);
const tools = grouped.map((h) => allDrawn.find((i) => i.href === h)).filter(Boolean);
const search = (locale, query) => {
  const m = messages[locale].sidebar;
  const names = messages[locale].dashboard.tools.names;
  return match.filterAndRankCandidates(
    tools.map((item) => {
      const key = ITEM_LABEL_KEYS[item.label];
      const long = key ? m.items[key] : item.label;
      return {
        item,
        candidates: [ALL_TOOLS_NAMES[item.href] ? names[ALL_TOOLS_NAMES[item.href]] : long, long, item.label, ...aliasesFor(key ?? "", locale), m.hints?.[key] ?? ""],
      };
    }),
    query
  );
};
const hrefsOf = (r) => r.map((i) => i.href);
check('"slides" finds Presentations, in English', hrefsOf(search("en", "slides"))[0] === "/dashboard/presentations", hrefsOf(search("en", "slides")).join(", "));
check('...and in Greek, where the English synonyms still count', hrefsOf(search("el", "slides")).includes("/dashboard/presentations"));
check('"παρουσ" finds it by its Greek name', hrefsOf(search("el", "παρουσ")).includes("/dashboard/presentations"));
check('"site" finds Site', hrefsOf(search("en", "site"))[0] === "/dashboard/website-builder", hrefsOf(search("en", "site")).join(", "));
check('"ιστότ" finds it by its one-word Greek name', hrefsOf(search("el", "ιστότ")).includes("/dashboard/website-builder"));
check("a word that is nothing finds nothing", search("en", "qqzzxx").length === 0);
check(`an empty search is every square, in order (${tools.length})`, search("en", "").length === tools.length && tools.length === grouped.length);
for (const l of LOCALES) {
  const t = messages[l].dashboard?.tools ?? {};
  check(`${l}: the search, its label, the empty result and the four group headings are worded`,
    ["search", "searchLabel"].every((k) => typeof t[k] === "string" && t[k].length > 0) && /\{query\}/.test(t.noMatch ?? "") &&
      ["make", "ask", "organise", "business"].every((k) => typeof t.groups?.[k] === "string" && t.groups[k].length > 0));
}

console.log("\n== 2. the square: 1:1, a 28px icon, the name and one line, nothing cut ==");
check("each square is a link to its tool", /<Link\s+href=\{item\.href\}/.test(grid));
check("...1:1, on the card radius and surface, its edge lit on hover",
  /aspect-square[^"]*rounded-card[^"]*border border-border[^"]*bg-panel[^"]*hover:border-foreground/.test(grid));
check("...with a 28px icon", /<Icon className="h-7 w-7[^"]*" aria-hidden="true" \/>/.test(grid));
check("...its name, and the plain line under it", /\{name\}/.test(grid) && /\{description && <span[^>]*>\{description\}<\/span>\}/.test(grid) && /const name = label\(item\);/.test(grid));
check("no name is cut with an ellipsis", !/\btruncate\b|line-clamp|text-ellipsis/.test(grid));
check("four in a row on a computer, two on a phone", /grid grid-cols-2 gap-3 lg:grid-cols-4/.test(grid));
check("the groups are headed by their translated names",
  ["make", "ask", "organise", "business"].every((k) => new RegExp(`${k}: t\\("groups\\.${k}"\\)`).test(grid)) && /heading: headings\[g\.key\]/.test(grid));

console.log("\n== 3. the pin: the one way to put a tool in the sidebar at once ==");
check("a 44px pin on the square, its state announced", /data-testid="tool-pin"/.test(grid) && /aria-pressed=\{isPinned\}/.test(grid) && /h-11 w-11/.test(grid));
check("...writing through the sidebar's own route", /fetch\("\/api\/nav\/recent-tools"/.test(grid) && /JSON\.stringify\(\{ action, href \}\)/.test(grid));
check("...and a failed write puts the pin back and says so", /setPins\(before\)/.test(grid) && /addToast\(/.test(grid));
check("Chat and Coding (never in Recent tools), Settings and Help have no pin",
  /const canPin = !NEVER_RECENT\.includes\(item\.href\) && !item\.href\.startsWith\("\/help"\) && item\.href !== "\/dashboard\/settings";/.test(grid) && /\{canPin && \(/.test(grid));
const page = stripComments(readFileSync("src/app/dashboard/tools/page.tsx", "utf8"));
check("the page hands the grid this person's pins", /pinned=\{readRecentPrefs\(user\.user_metadata\)\.pinned\}/.test(page));

console.log("\n== 4. no «beta», anywhere on the page ==");
check("the grid draws no tag", !/isBetaTool|BETA_TOOLS|bg-tag|\bbeta\b/i.test(grid));
const betaLeft = LOCALES.filter((l) => "beta" in (messages[l].dashboard?.tools ?? {}) || "betaHint" in (messages[l].dashboard?.tools ?? {}));
check("...and no locale still carries the tag's words", betaLeft.length === 0, betaLeft.join(", "));

console.log(failures.length === 0 ? `\nALL PASS: ${pass} passed, 0 failed` : `\n${failures.length} FAILED, ${pass} passed`);
process.exit(failures.length === 0 ? 0 : 1);
