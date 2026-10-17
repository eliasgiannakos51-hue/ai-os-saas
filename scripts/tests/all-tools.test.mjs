// ALL TOOLS IS THE DESIGN'S: BIG SQUARES IN FOUR GROUPS, A SEARCH THAT
// KNOWS SYNONYMS, A PIN ON EACH, AND NO «BETA» ANYWHERE.
//
// docs/CONTEXT.md, ΣΥΣΤΗΜΑ DESIGN §6 (2026-10-05): 1:1 squares, four in a
// row on a computer and two on a phone; a 28px icon top left, a small pin
// top right, the name and one plain line at the bottom; groups Make, Ask,
// Organise, Business; a search on top; no beta tag, so what is not working
// is not shown. WHICH tools is the owner's rule of 2026-10-05 (NEEDS 19),
// in src/lib/nav/all-tools.ts — held here BOTH ways against the tools the
// grid can draw, for a member and for the owner.
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
// sidebarGroups(), tools first and the Settings block last — the order
// the grid draws them.
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
const settingsAt = parsed.findIndex((g) => g.heading === "Settings");
const ordered = [...parsed.filter((_, i) => i !== settingsAt), parsed[settingsAt]].filter(Boolean);
const drawnFor = (isOwner) => sidebarGroups(ordered, isOwner);
const drawn = drawnFor(false);
const tools = drawn.flatMap((g) => g.items);

console.log("== 0. the population ==");
check(`the drawn tools were read (${tools.length} in ${drawn.length} groups)`, tools.length >= 20 && drawn.length >= 4);
check("the Settings block is drawn last", drawn[drawn.length - 1]?.heading === "Settings");

console.log("\n== 0b. every tool is in exactly one group, or hidden with a reason ==");
const { ALL_TOOLS_GROUPS, HIDDEN_FROM_ALL_TOOLS } = await loadTs("src/lib/nav/all-tools.ts");
const grouped = ALL_TOOLS_GROUPS.flatMap((g) => g.hrefs);
const hidden = Object.keys(HIDDEN_FROM_ALL_TOOLS);
check("the four groups, in the design's order", ALL_TOOLS_GROUPS.map((g) => g.key).join(",") === "make,ask,organise,business");
// THE POPULATION IS WHAT THE GRID CAN DRAW: the owner's view, which is
// every member tool plus the owner-only ones, minus the Settings block.
const ownerTools = drawnFor(true).filter((g) => g.heading !== "Settings").flatMap((g) => g.items.map((i) => i.href));
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
  "the grid draws the tools through those groups, and the Settings block after them",
  /ALL_TOOLS_GROUPS\.map\(/.test(grid) && /g\.hrefs\.map\(\(h\) => byHref\.get\(h\)\)/.test(grid) && /\[\.\.\.tools, \.\.\.settings\]/.test(grid)
);

console.log("\n== 1. the search finds a tool by a word it is not called ==");
const match = await loadTs("src/lib/command-palette-match.ts");
const { ITEM_LABEL_KEYS } = await loadTs("src/lib/sidebar-label-keys.ts");
const { aliasesFor } = await loadTs("src/lib/palette-aliases.ts");
check(
  "the grid builds its candidates the way the palette does, plus the description",
  /candidates: \[label\(item\), item\.label, \.\.\.aliasesFor\(ITEM_LABEL_KEYS\[item\.label\] \?\? "", locale\), hint\(item\)\]/.test(grid) &&
    /filterAndRankCandidates\(/.test(grid)
);
const search = (locale, query) => {
  const m = messages[locale].sidebar;
  return match.filterAndRankCandidates(
    tools.map((item) => {
      const key = ITEM_LABEL_KEYS[item.label];
      return {
        item,
        candidates: [key ? m.items[key] : item.label, item.label, ...aliasesFor(key ?? "", locale), m.hints?.[key] ?? ""],
      };
    }),
    query
  );
};
const hrefsOf = (r) => r.map((i) => i.href);
check('"slides" finds Presentations, in English', hrefsOf(search("en", "slides"))[0] === "/dashboard/presentations", hrefsOf(search("en", "slides")).join(", "));
check('...and in Greek, where the English synonyms still count', hrefsOf(search("el", "slides")).includes("/dashboard/presentations"));
check('"παρουσ" finds it by its Greek name', hrefsOf(search("el", "παρουσ")).includes("/dashboard/presentations"));
check("a word that is nothing finds nothing", search("en", "qqzzxx").length === 0);
check("an empty search is every tool, in order", search("en", "").length === tools.length);
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
