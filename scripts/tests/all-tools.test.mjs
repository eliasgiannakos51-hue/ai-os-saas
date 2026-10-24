// ALL TOOLS IS THE OWNER'S FINAL GRID (2026-10-23): SEVENTEEN TOOLS IN FIVE
// GROUPS, ONLY THOSE THAT WORK DRAWN, A SEARCH THAT KNOWS SYNONYMS, A PIN
// WHERE THE SIDEBAR CAN TAKE ONE, AND NO «BETA» ANYWHERE.
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
// that line). BUILD-SPECS 2.4 scenario 10 was "slides" finds
// Presentations; Presentations left the grid 2026-10-22, so the search
// below runs the same mechanism against "research" instead.
//
// Run: node scripts/tests/all-tools.test.mjs
import { existsSync, readFileSync } from "node:fs";
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

console.log("\n== 0b. the registry: seventeen tools, five groups, in the owner's order ==");
const { ALL_TOOLS, ALL_TOOLS_GROUP_ORDER, ALL_TOOLS_GROUPS, ALL_TOOLS_NAMES, HIDDEN_FROM_ALL_TOOLS, availableTools } = await loadTs("src/lib/nav/all-tools.ts");
const registryHrefs = ALL_TOOLS.map((t) => t.href);
const hidden = Object.keys(HIDDEN_FROM_ALL_TOOLS);
const OWNER_LIST = [
  ["record", "myStuff", "My Stuff", "Everything you've made, in one place"],
  ["record", "connect", "Connect", "Bring your other apps in"],
  ["ask", "analyze", "Analyze", "Files, links and videos, explained"],
  ["ask", "research", "Deep Research", "A sourced report on any topic"],
  ["make", "rebuild", "Rebuild", "Build your own version of any app"],
  ["make", "site", "Site", "A website from a description"],
  ["make", "document", "Document", "Documents, slides and sheets"],
  ["make", "image", "Image", "Images from a description"],
  ["make", "video", "Video", "A video clip from a description"],
  ["make", "films", "Films", "A whole film from a script"],
  ["make", "editing", "Editing", "Edit videos and photos with words"],
  ["make", "avatars", "Avatars", "A presenter who says your text"],
  ["make", "coding", "Coding", "Code with your GitHub projects"],
  ["runAlone", "agents", "Agents", "They work while you don't"],
  ["runAlone", "automations", "Automations", "Tasks that run on their own"],
  ["runAlone", "iowork", "iowork", "Works on your computer, makes your files"],
  ["organise", "projects", "Projects", "Everything for one goal, together"],
];
check("the registry is exactly the owner's seventeen, in his order, each in his group",
  ALL_TOOLS.length === 17 && OWNER_LIST.every(([g, k], i) => ALL_TOOLS[i].name === k && ALL_TOOLS[i].group === g),
  ALL_TOOLS.map((t) => `${t.group}/${t.name}`).join(", "));
check("...five groups, in the owner's order", ALL_TOOLS_GROUP_ORDER.join(",") === "record,ask,make,runAlone,organise" && ALL_TOOLS_GROUPS.map((g) => g.key).join(",") === "record,ask,make,runAlone,organise");
check("...each address once", new Set(registryHrefs).size === 17);
const enNames = messages.en.dashboard.tools.names;
const enLines = messages.en.dashboard.tools.lines;
check("the English names are the owner's, word for word", OWNER_LIST.every(([, k, name]) => enNames[k] === name), OWNER_LIST.filter(([, k, name]) => enNames[k] !== name).map(([, k]) => `${k}=${enNames[k]}`).join(", "));
check("...and the English lines are the owner's, word for word", OWNER_LIST.every(([, k, , line]) => enLines[k] === line), OWNER_LIST.filter(([, k, , line]) => enLines[k] !== line).map(([, k]) => `${k}=${enLines[k]}`).join(", "));
check("ALL_TOOLS_NAMES reads the registry", Object.entries(ALL_TOOLS_NAMES).length === 17 && ALL_TOOLS.every((t) => ALL_TOOLS_NAMES[t.href] === t.name));

// A TOOL THAT DOES NOT WORK DOES NOT APPEAR: ready means the page exists;
// not ready means it says what it waits for, and a page that is not there.
const notReady = ALL_TOOLS.filter((t) => !t.ready);
const ready = ALL_TOOLS.filter((t) => t.ready);
// A module served by app/dashboard/[module]/page.tsx has no folder of its own.
const moduleHrefs = new Set(modules.MODULES.map((m) => `/dashboard/${m.slug}`));
const hasPage = (href) => existsSync(`src/app${href}/page.tsx`) || moduleHrefs.has(href);
const missingPage = ready.filter((t) => !hasPage(t.href));
check(`every ready tool has its page (${ready.length} ready)`, missingPage.length === 0, missingPage.map((t) => t.href).join(", "));
const placeholders = ready.filter((t) => existsSync(`src/app${t.href}/page.tsx`) && /BuildModulePage/.test(readFileSync(`src/app${t.href}/page.tsx`, "utf8")));
check("no ready tool is a placeholder: none of their pages is the empty BuildModulePage list", placeholders.length === 0, placeholders.map((t) => t.href).join(", "));
check(`every tool that is not ready says what it waits for, in a sentence (${notReady.length} waiting)`, notReady.every((t) => String(t.waitingFor ?? "").trim().length >= 20), notReady.filter((t) => !t.waitingFor).map((t) => t.name).join(", "));
check("...and the ones that cannot work yet are exactly the unbuilt: Video, Films, Editing, Avatars, iowork, unless a later round built them",
  notReady.every((t) => ["video", "films", "editing", "avatars", "iowork"].includes(t.name)), notReady.map((t) => t.name).join(", "));
// The drawn list is a function of what is ready and present, nothing else.
const withKey = availableTools({ imageKey: true }).map((t) => t.name);
const withoutKey = availableTools({ imageKey: false }).map((t) => t.name);
check("Image is drawn with its Gemini key and not without it", withKey.includes("image") && !withoutKey.includes("image"));
check("...and without the key it is the only tile that goes", withKey.filter((n) => !withoutKey.includes(n)).join(",") === "image");
check("nothing that is not ready is ever drawn", availableTools({ imageKey: true }).every((t) => t.ready));

console.log("\n== 0c. every other tool is hidden, with a reason, and nothing is lost ==");
const rowless = ["/dashboard/my-stuff", "/dashboard/games"];
const ownerTools = [...drawnFor(true).filter((g) => g.heading !== "Settings").flatMap((g) => g.items.map((i) => i.href)), ...rowless];
const memberTools = drawnFor(false).filter((g) => g.heading !== "Settings").flatMap((g) => g.items.map((i) => i.href));
check(`the population was read (${ownerTools.length} for the owner, ${memberTools.length} for a member)`, ownerTools.length >= memberTools.length && memberTools.length >= 20);
const unplaced = ownerTools.filter((h) => !registryHrefs.includes(h) && !hidden.includes(h));
check("every tool the sidebar can show is in the registry or hidden on purpose", unplaced.length === 0, unplaced.join(", "));
const phantom = hidden.filter((h) => !ownerTools.includes(h));
check("...and every hidden address is a tool that exists (no stale entry)", phantom.length === 0, phantom.join(", "));
const twice = hidden.filter((h) => registryHrefs.includes(h));
check("...in exactly one place: none both in the registry and hidden", twice.length === 0, twice.join(", "));
const bare = hidden.filter((h) => String(HIDDEN_FROM_ALL_TOOLS[h] ?? "").trim().length < 20);
check("...and every hidden tool says why, in a sentence", bare.length === 0, bare.join(", "));
const lostPages = hidden.filter((h) => !hasPage(h));
check("...and every hidden tool still opens at its address (its page is there)", lostPages.length === 0, lostPages.join(", "));
check("the grid draws the tools through the registry, and nothing else",
  /ALL_TOOLS\.filter\(\(tool\) => tool\.group === key && shown\.includes\(tool\.href\)\)/.test(grid) && /ALL_TOOLS_GROUP_ORDER\.map\(\(key\) =>/.test(grid));
check("...and no Settings block: Settings, Integrations and Help are reached from Settings (MASTER 14.1)",
  !/SETTINGS_GROUP|\.\.\.settings\b/.test(grid));
const settingsPage = stripComments(readFileSync("src/app/dashboard/settings/page.tsx", "utf8"));
const settingsHrefs = Object.fromEntries(["/dashboard/integrations", "/help", "/dashboard/team"].map((h) => [h, new RegExp(`\\{ href: "${h.replace(/\//g, "\\/")}", label: tKey\\("sidebar\\.items\\.`).test(settingsPage)]));
check("...and Settings links to each of them, so nothing is lost", Object.values(settingsHrefs).every(Boolean), JSON.stringify(settingsHrefs));
check("...under a heading worded in every locale", /t\("places\.title"\)/.test(settingsPage) && LOCALES.every((l) => typeof messages[l].settings?.places?.title === "string" && messages[l].settings.places.title.length > 0));

console.log("\n== 0d. no switch decides a tile: the page asks the server for keys, not for switches ==");
const toolsPage = stripComments(readFileSync("src/app/dashboard/tools/page.tsx", "utf8"));
check("the page does not read a feature switch", !/isFeatureOn|isFlagKey/.test(toolsPage));
check("...it hands the grid the tools that work, with the Gemini key's presence the only input",
  /availableTools\(\{ imageKey: Boolean\(imageApiKey\(\)\) \}\)\.map\(\(tool\) => tool\.href\)/.test(toolsPage) && /shown=\{shown\}/.test(toolsPage));
const flagsSrc = readFileSync("src/lib/flags/flags.ts", "utf8");
const flagKeys = [...(flagsSrc.match(/export const FLAGS = \{([\s\S]*?)\} as const;/)?.[1] ?? "").matchAll(/^\s*"?([a-z0-9-]+)"?:/gm)].map((m) => m[1]);
const OPENED_2026_10_23 = ["my-stuff", "document-writer", "image-studio", "automations", "flows", "tool-shell", "analysis-provenance", "site-pages", "research-slides"];
check(`the switches were read (${flagKeys.length})`, flagKeys.length >= 5);
check("the switches that hid a ready tool from ordinary users are gone (owner, 2026-10-23: for everybody, without switches)",
  OPENED_2026_10_23.every((k) => !flagKeys.includes(k)), OPENED_2026_10_23.filter((k) => flagKeys.includes(k)).join(", "));
check("...and no tile of the final grid names a switch", !/flag:/.test(readFileSync("src/lib/nav/all-tools.ts", "utf8").replace(/\/\/.*$/gm, "")));

console.log("\n== 0e. names and lines, worded in every language ==");
// "My Stuff" and "Deep Research" are two words by the owner's own list, so
// a name is held to three words, not one (it was one word under MASTER 14.1).
for (const l of LOCALES) {
  const n = messages[l].dashboard?.tools?.names ?? {};
  const bad = ALL_TOOLS.map((t) => t.name).filter((k) => typeof n[k] !== "string" || n[k].trim() === "" || n[k].trim().split(/\s+/).length > 3);
  check(`${l}: every tool has its name, at most three words`, bad.length === 0, bad.map((k) => `${k}=${JSON.stringify(n[k])}`).join(", "));
}
check("the tile draws the translated name, and falls back to the sidebar's only for a tool without one",
  /const label = \(item: SidebarItem\) => \{ const k = nameKey\(item\.href\); return k \? names\[k\] : longLabel\(item\); \};/.test(grid) &&
    /const nameKey = \(href: string\): AllToolsNameKey \| undefined => ALL_TOOLS\.find\(\(tool\) => tool\.href === href\)\?\.name;/.test(grid));
check("no «In testing…» line on the page (MASTER 14.1)",
  !/inTesting|In testing/i.test(grid) && LOCALES.every((l) => !/in testing/i.test(JSON.stringify(messages[l].dashboard?.tools ?? {}))));
// MASTER 14.1: «Μεγάλα τετράγωνα: εικονίδιο, όνομα μίας λέξης, μία γραμμή».
// LINE_MAX characters fit three lines of the narrowest square.
const LINE_MAX = 60;
const lineKeys = ALL_TOOLS.map((t) => t.name);
// PAUSED, NOT GONE: the tools that left the grid keep their names and lines
// (Files is read by components/analyze/analyze-shell.tsx).
const LEFT_THE_GRID = ["slides", "posts", "meetings", "library", "memory", "finances", "sales", "trading", "goals", "files", "games"];
for (const l of LOCALES) {
  const lines = messages[l].dashboard?.tools?.lines ?? {};
  const bad = lineKeys.filter((k) => typeof lines[k] !== "string" || lines[k].trim() === "" || lines[k].length > LINE_MAX);
  check(`${l}: every tile has its one line, short enough to stay one line (≤ ${LINE_MAX})`, bad.length === 0,
    bad.map((k) => `${k}=${JSON.stringify(lines[k])}`).join(", "));
  const g = messages[l].dashboard?.tools?.groups ?? {};
  check(`${l}: the five headings are worded, and no old heading is left`,
    ["record", "ask", "make", "runAlone", "organise"].every((k) => typeof g[k] === "string" && g[k].length > 0) && Object.keys(g).length === 5, Object.keys(g).join(","));
}
check("the Greek headings are the owner's own words", ["Κατάγραψε", "Ρώτα", "Φτιάξε", "Τρέξε μόνο του", "Οργάνωσε"].every((w, i) =>
  messages.el.dashboard.tools.groups[["record", "ask", "make", "runAlone", "organise"][i]].toLowerCase() === w.toLowerCase()));
check("...no line is kept for a name that is neither on the grid nor one that left it",
  Object.keys(messages.en.dashboard.tools.lines ?? {}).every((k) => lineKeys.includes(k) || LEFT_THE_GRID.includes(k)));
check("the tile draws its own line, and the sidebar's longer hint only for a tool without one",
  /const hint = \(item: SidebarItem\) => \{ const k = nameKey\(item\.href\); return k \? lines\[k\] : sidebarHint\(item\); \};/.test(grid) &&
    lineKeys.every((k) => grid.includes(`${k}: t("lines.${k}")`)));
check("...and every name is read through a literal key", lineKeys.every((k) => grid.includes(`${k}: t("names.${k}")`)));

console.log("\n== 1. the search finds a tool by a word it is not called ==");
const match = await loadTs("src/lib/command-palette-match.ts");
const { ITEM_LABEL_KEYS } = await loadTs("src/lib/sidebar-label-keys.ts");
const { aliasesFor } = await loadTs("src/lib/palette-aliases.ts");
check(
  "the grid builds its candidates the way the palette does, plus the one-word name and the description",
  /candidates: \[label\(item\), longLabel\(item\), item\.label, \.\.\.aliasesFor\(ITEM_LABEL_KEYS\[item\.label\] \?\? "", locale\), hint\(item\), sidebarHint\(item\)\]/.test(grid) &&
    /filterAndRankCandidates\(/.test(grid)
);
const grouped = ready.map((t) => t.href);
const tools = grouped.map((h) => allDrawn.find((i) => i.href === h)).filter(Boolean);
const search = (locale, query) => {
  const m = messages[locale].sidebar;
  const names = messages[locale].dashboard.tools.names;
  const lines = messages[locale].dashboard.tools.lines;
  return match.filterAndRankCandidates(
    tools.map((item) => {
      const key = ITEM_LABEL_KEYS[item.label];
      const long = key ? m.items[key] : item.label;
      return {
        item,
        candidates: [ALL_TOOLS_NAMES[item.href] ? names[ALL_TOOLS_NAMES[item.href]] : long, long, item.label, ...aliasesFor(key ?? "", locale), lines[ALL_TOOLS_NAMES[item.href]] ?? "", m.hints?.[key] ?? ""],
      };
    }),
    query
  );
};
const hrefsOf = (r) => r.map((i) => i.href);
// PRESENTATIONS LEFT THE GRID 2026-10-22 — "slides" must find nothing
// drawn here any more; the search is only ever run over `tools`
// (built from `grouped`, which no longer includes it), so this is the
// shape that removal is SUPPOSED to produce, not a regression.
check('"slides" no longer finds anything drawn here (Presentations left the grid 2026-10-22)', !hrefsOf(search("en", "slides")).includes("/dashboard/presentations"));
check('"research" finds Deep Research, in English', hrefsOf(search("en", "research"))[0] === "/dashboard/deep-research", hrefsOf(search("en", "research")).join(", "));
check('...and "investigate" finds it too, an alias with no Greek label anywhere near it', hrefsOf(search("en", "investigate")).includes("/dashboard/deep-research"));
check('...and in Greek, where the English alias still counts', hrefsOf(search("el", "investigate")).includes("/dashboard/deep-research"));
check('"βαθι" finds it by its Greek name ("Βαθιά έρευνα")', hrefsOf(search("el", "βαθι")).includes("/dashboard/deep-research"));
check('"site" finds Site', hrefsOf(search("en", "site"))[0] === "/dashboard/website-builder", hrefsOf(search("en", "site")).join(", "));
check('"ιστότ" finds it by its one-word Greek name', hrefsOf(search("el", "ιστότ")).includes("/dashboard/website-builder"));
check("a word that is nothing finds nothing", search("en", "qqzzxx").length === 0);
check(`an empty search is every ready tool that has a sidebar row, in order (${tools.length})`, search("en", "").length === tools.length && tools.length >= 6);
for (const l of LOCALES) {
  const t = messages[l].dashboard?.tools ?? {};
  check(`${l}: the search, its label and the empty result are worded`,
    ["search", "searchLabel"].every((k) => typeof t[k] === "string" && t[k].length > 0) && /\{query\}/.test(t.noMatch ?? ""));
}

console.log("\n== 2. the square: smaller, icon and name on one row, nothing cut ==");
check("each square is a link to its tool", /<Link\s+href=\{item\.href\}/.test(grid));
check("...on the card radius and surface, its edge lit on hover (2026-10-22: no longer 1:1)",
  /rounded-card[^"]*border border-border[^"]*bg-panel[^"]*hover:border-foreground/.test(grid) && !/aspect-square/.test(grid));
check("...icon and name share one row", /<Icon className="h-5 w-5 shrink-0[^"]*" aria-hidden="true" \/>/.test(grid) && /items-center gap-2"[\s\S]{0,80}<Icon /.test(grid));
check("...its name, and the plain line under it", /\{name\}/.test(grid) && /\{description && <span[^>]*>\{description\}<\/span>\}/.test(grid) && /const name = label\(item\);/.test(grid));
check("no name is cut with an ellipsis", !/\btruncate\b|line-clamp|text-ellipsis/.test(grid));
check("5-6 in a row on a computer, two on a phone", /grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5 xl:grid-cols-6/.test(grid));
check("the groups are headed by their translated names",
  ["record", "ask", "make", "runAlone", "organise"].every((k) => new RegExp(`${k}: t\\("groups\\.${k}"\\)`).test(grid)) && /heading: headings\[key\]/.test(grid));

console.log("\n== 3. the pin: the one way to put a tool in the sidebar at once ==");
check("a 44px pin on the square, its state announced", /data-testid="tool-pin"/.test(grid) && /aria-pressed=\{isPinned\}/.test(grid) && /h-11 w-11/.test(grid));
check("the pin shows only on hover on a computer (2026-10-22), always on touch",
  /md:opacity-0/.test(grid) && /md:group-hover:opacity-100/.test(grid) && /md:focus-visible:opacity-100/.test(grid));
check("...but a tool already pinned keeps its pin visible on a computer too",
  /isPinned \? "text-foreground" : "text-muted md:opacity-0"/.test(grid));
check("...writing through the sidebar's own route", /fetch\("\/api\/nav\/recent-tools"/.test(grid) && /JSON\.stringify\(\{ action, href \}\)/.test(grid));
check("...and a failed write puts the pin back and says so", /setPins\(before\)/.test(grid) && /addToast\(/.test(grid));
check("Chat and Coding (never in Recent tools), a tool with no visible sidebar row, Settings and Help have no pin",
  /const canPin =\s*mainRows\.has\(item\.href\) && !NEVER_RECENT\.includes\(item\.href\) && !item\.href\.startsWith\("\/help"\) && item\.href !== "\/dashboard\/settings";/.test(grid) && /\{canPin && \(/.test(grid));
const page = stripComments(readFileSync("src/app/dashboard/tools/page.tsx", "utf8"));
check("the page hands the grid this person's pins", /pinned=\{readRecentPrefs\(user\.user_metadata\)\.pinned\}/.test(page));

console.log("\n== 4. no «beta», anywhere on the page ==");
check("the grid draws no tag", !/isBetaTool|BETA_TOOLS|bg-tag|\bbeta\b/i.test(grid));
const betaLeft = LOCALES.filter((l) => "beta" in (messages[l].dashboard?.tools ?? {}) || "betaHint" in (messages[l].dashboard?.tools ?? {}));
check("...and no locale still carries the tag's words", betaLeft.length === 0, betaLeft.join(", "));

console.log(failures.length === 0 ? `\nALL PASS: ${pass} passed, 0 failed` : `\n${failures.length} FAILED, ${pass} passed`);
process.exit(failures.length === 0 ? 0 : 1);
