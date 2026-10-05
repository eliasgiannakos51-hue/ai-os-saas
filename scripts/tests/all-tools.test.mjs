// ALL TOOLS IS THE DESIGN'S: TILES IN GROUPS, A SEARCH THAT KNOWS
// SYNONYMS, A DISCREET BETA TAG, AND ONE DESKTOP SCREEN.
//
// docs/CONTEXT.md, ΣΥΣΤΗΜΑ DESIGN — «ALL TOOLS»; BUILD-SPECS 2.4
// scenarios 9–12: every tool within three presses, "slides" finds
// Presentations, everything on one 1440×900 screen with no scroll, and
// no name cut with an ellipsis. The beta tag's source is
// docs/TOOLS-STATUS.md, held against src/lib/nav/tool-status.ts BOTH ways.
//
// The search is RUN — the palette's own matcher over the same candidates
// the grid builds (the grid's line that builds them is checked to be
// that line). The one-screen figure is ARITHMETIC from the grid's own
// classes and the drawn rows, with the page chrome stated below; the
// browser pass of the site audit (docs/QUEUE.md D.11) measures it.
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
  check(`${l}: the search, its label, the empty result and the beta tag are worded`,
    ["search", "searchLabel", "beta", "betaHint"].every((k) => typeof t[k] === "string" && t[k].length > 0) && /\{query\}/.test(t.noMatch ?? ""));
}

console.log("\n== 2. the tile: icon, name, the description on hover, nothing cut ==");
check("each tile is a link with its icon and its name", /<Link\s+href=\{item\.href\}/.test(grid) && /<Icon className="h-4 w-4 shrink-0 text-muted" aria-hidden="true" \/>/.test(grid) && /\{label\(item\)\}/.test(grid));
check("the description is in a tooltip on hover and focus", /<Tooltip content=\{description\} side="top">/.test(grid));
check("...and read to a screen reader with the name", /\{description && <span className="sr-only">\{description\}<\/span>\}/.test(grid));
check("a tile is a 44px target", /<Link[^>]*\n?[^>]*min-h-\[44px\]/.test(grid) || /min-h-\[44px\] items-center gap-2\.5 rounded-item/.test(grid));
check("no name is cut with an ellipsis", !/\btruncate\b|line-clamp|text-ellipsis/.test(grid));

console.log("\n== 3. beta, from TOOLS-STATUS, both ways ==");
const status = readFileSync("docs/TOOLS-STATUS.md", "utf8");
const betaNames = [...status.matchAll(/^\| ([^|]+?) \| [^|]+ \| beta \|/gm)].map((m) => m[1].trim());
// The table names a tool the way a person does; this is where each name
// meets its screen. A name missing here fails below, so a new beta row
// cannot go untagged.
const NAME_TO_HREF = {
  Site: "/dashboard/website-builder", "Παρουσίαση": "/dashboard/presentations", Posts: "/dashboard/posts",
  "Κώδικας": "/dashboard/coding", Chat: "/dashboard/chat", "Έρευνα": "/dashboard/deep-research",
  "Ανάλυση": "/dashboard/data-analysis", "Προβλέψεις": "/dashboard/predictions", "Φωνή": "/dashboard/voice",
  "Έργα": "/dashboard/projects", "Στόχοι": "/dashboard/mission", "Συναντήσεις": "/dashboard/meetings",
  "Η εβδομάδα μου": "/dashboard/reflection", "Ομάδα": "/dashboard/team", "Αρχεία": "/dashboard/files",
  "Οικονομικά": "/dashboard/finance", "Πωλήσεις": "/dashboard/sales", Trading: "/dashboard/trading",
  "Μνήμη": "/dashboard/ai-memory", "Αυτοματισμοί": "/dashboard/automation", "Βοηθοί": "/dashboard/agents",
};
const { BETA_TOOLS } = await loadTs("src/lib/nav/tool-status.ts");
check(`the table's beta rows were read (${betaNames.length})`, betaNames.length >= 10);
const unmapped = betaNames.filter((n) => !NAME_TO_HREF[n]);
check("every beta row names a screen this gate knows", unmapped.length === 0, unmapped.join(", "));
const shouldBe = new Set(betaNames.map((n) => NAME_TO_HREF[n]).filter(Boolean));
const untagged = [...shouldBe].filter((h) => !BETA_TOOLS.includes(h));
const stale = BETA_TOOLS.filter((h) => !shouldBe.has(h));
check("every beta tool in TOOLS-STATUS carries the tag", untagged.length === 0, untagged.join(", "));
check("...and no tool carries it that TOOLS-STATUS does not call beta", stale.length === 0, stale.join(", "));
check("the tile shows the tag through the same list", /\{isBetaTool\(item\.href\) && \(/.test(grid) && /bg-tag/.test(grid));

console.log("\n== 4. one desktop screen, no scroll (1440×900, arithmetic) ==");
// The grid's own figures, read from its classes.
const cols = Number(grid.match(/xl:grid-cols-(\d+)/)?.[1] ?? 0);
const tile = Number(grid.match(/min-h-\[(\d+)px\] items-center gap-2\.5/)?.[1] ?? 0);
const gap = Number(grid.match(/grid grid-cols-1 gap-(\d+)/)?.[1] ?? 0) * 4;
const groupGap = Number(grid.match(/<div className="mt-5 space-y-(\d+)">/)?.[1] ?? 0) * 4;
const headingH = 16 + Number(grid.match(/<h2 id=\{`tools-\$\{group\.heading\}`\} className="mb-(\d+)/)?.[1] ?? 0) * 4;
// THE CHROME, STATED, not measured: the top bar (64), the page's py-6
// (48), a PageHeader with one line of description (~92), its mt-4 (16),
// the search (44) and its mt-5 (20), and the ⌘K line under the grid
// (mt-6 + one line, 40). Measured in a browser by D.11.
const CHROME = 64 + 48 + 92 + 16 + 44 + 20 + 40;
const body = drawn.reduce((h, g) => {
  const rows = Math.ceil(g.items.length / cols);
  return h + headingH + rows * tile + (rows - 1) * gap;
}, 0) + (drawn.length - 1) * groupGap;
const total = CHROME + body;
console.log(`        ${tools.length} tiles · ${cols} columns · ${drawn.length} groups → ${total}px of 900`);
check("the grid's figures were read", cols > 0 && tile >= 44 && gap > 0 && groupGap > 0 && headingH > 16);
check(`everything fits on a 1440×900 screen (${total}px)`, total <= 900, `${total}px`);
const owner = drawnFor(true).flatMap((g) => g.items).length;
const ownerTotal = CHROME + drawnFor(true).reduce((h, g) => h + headingH + Math.ceil(g.items.length / cols) * tile + (Math.ceil(g.items.length / cols) - 1) * gap, 0) + (drawnFor(true).length - 1) * groupGap;
check(`...and for the owner, who sees ${owner} (${ownerTotal}px)`, ownerTotal <= 900, `${ownerTotal}px`);

console.log(failures.length === 0 ? `\nALL PASS: ${pass} passed, 0 failed` : `\n${failures.length} FAILED, ${pass} passed`);
process.exit(failures.length === 0 ? 0 : 1);
