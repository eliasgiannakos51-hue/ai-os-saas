// ALL TOOLS, EVERY SQUARE (the owner's message "ALL TOOLS: ΟΛΑ ΤΑ
// ΤΕΤΡΑΓΩΝΑ", 2026-10-24): 24 big tiles in 5 groups plus a 6th group
// (Learn) that carries only small ready-made jobs, every tile drawn now
// — `ready: false` no longer hides a tile, it opens the Coming Soon
// screen instead (components/tools/coming-soon-shell.tsx: a small
// «Σύντομα» mark, the field disabled, a Notify-me button, never a
// provider call, never a charge). Replaces the 17-tile round of
// 2026-10-23, whose "a tool that does not work does not appear" rule
// this round reverses.
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

console.log("\n== 0b. the registry: 24 tiles, 6 groups, in the owner's order ==");
const { ALL_TOOLS, ALL_TOOLS_GROUP_ORDER, ALL_TOOLS_GROUPS, ALL_TOOLS_NAMES, HIDDEN_FROM_ALL_TOOLS, availableTools } = await loadTs("src/lib/nav/all-tools.ts");
const registryHrefs = ALL_TOOLS.map((t) => t.href);
const hidden = Object.keys(HIDDEN_FROM_ALL_TOOLS);
const OWNER_LIST = [
  ["record", "myStuff"], ["record", "connect"], ["record", "meetings"],
  ["ask", "analyze"], ["ask", "research"], ["ask", "translate"],
  ["make", "rebuild"], ["make", "site"], ["make", "apps"], ["make", "games"],
  ["make", "document"], ["make", "slides"], ["make", "posts"], ["make", "image"],
  ["make", "video"], ["make", "films"], ["make", "editing"], ["make", "avatars"],
  ["make", "audio"], ["make", "coding"],
  ["runAlone", "agents"], ["runAlone", "automations"], ["runAlone", "iowork"],
  ["organise", "projects"],
];
check("the registry is exactly the owner's 24, in his order, each in his group",
  ALL_TOOLS.length === 24 && OWNER_LIST.every(([g, k], i) => ALL_TOOLS[i].name === k && ALL_TOOLS[i].group === g),
  ALL_TOOLS.map((t) => `${t.group}/${t.name}`).join(", "));
check("...six groups, in the owner's order, Learn last and carrying no big tile",
  ALL_TOOLS_GROUP_ORDER.join(",") === "record,ask,make,runAlone,organise,learn" &&
    ALL_TOOLS_GROUPS.map((g) => g.key).join(",") === "record,ask,make,runAlone,organise,learn" &&
    ALL_TOOLS_GROUPS.find((g) => g.key === "learn").hrefs.length === 0);
check("...each address once", new Set(registryHrefs).size === 24);
const enNames = messages.en.dashboard.tools.names;
const enLines = messages.en.dashboard.tools.lines;
check("document's line names sheets, not slides (Slides is its own tile now)", /sheet/i.test(enLines.document) && !/slide/i.test(enLines.document));
check("coding's line says «write and fix code», not GitHub (not open to everyone yet)", /write and fix code/i.test(enLines.coding) && !/github/i.test(enLines.coding));

console.log("\n== 0c. a tool that does not work still gets a tile (§3, 2026-10-24) ==");
const notReady = ALL_TOOLS.filter((t) => !t.ready);
const ready = ALL_TOOLS.filter((t) => t.ready);
const moduleHrefs = new Set(modules.MODULES.map((m) => `/dashboard/${m.slug}`));
const hasPage = (href) => existsSync(`src/app${href}/page.tsx`) || moduleHrefs.has(href);
// A target without a folder of its own is served by the dynamic module
// route (app/dashboard/[module]/page.tsx), not app/dashboard/<name>/page.tsx.
const pageFileFor = (href) => (existsSync(`src/app${href}/page.tsx`) ? `src/app${href}/page.tsx` : "src/app/dashboard/[module]/page.tsx");
const missingPage = ALL_TOOLS.filter((t) => !hasPage(t.href));
check(`every one of the 24 tiles — ready or not — has a page at its address (${ALL_TOOLS.length} total)`, missingPage.length === 0, missingPage.map((t) => t.href).join(", "));
check(`every tool that is not ready says what it waits for, in a sentence (${notReady.length} waiting)`, notReady.every((t) => String(t.waitingFor ?? "").trim().length >= 20), notReady.filter((t) => !t.waitingFor).map((t) => t.name).join(", "));
check("...and a not-ready tile's page renders the Coming Soon shell, not the real tool",
  notReady.every((t) => /ComingSoonShell/.test(readFileSync(pageFileFor(t.href), "utf8"))), notReady.filter((t) => !/ComingSoonShell/.test(readFileSync(pageFileFor(t.href), "utf8"))).map((t) => t.name).join(", "));
check("...and a ready tile's page is never the Coming Soon shell",
  ready.every((t) => !/ComingSoonShell/.test(readFileSync(pageFileFor(t.href), "utf8"))), ready.filter((t) => /ComingSoonShell/.test(readFileSync(pageFileFor(t.href), "utf8"))).map((t) => t.name).join(", "));
const withKey = availableTools({ imageKey: true }).map((t) => t.name);
const withoutKey = availableTools({ imageKey: false }).map((t) => t.name);
check("Image is live with its Gemini key and not without it", withKey.includes("image") && !withoutKey.includes("image"));
check("...and without the key it is the only tile that drops out of `availableTools`", withKey.filter((n) => !withoutKey.includes(n)).join(",") === "image");
check("nothing `availableTools` returns is ever a not-ready tile", availableTools({ imageKey: true }).every((t) => t.ready));
check("the tools page hands the grid `live` (which addresses are the real tool), not a hidden/shown filter",
  /availableTools\(\{ imageKey: Boolean\(imageApiKey\(\)\) \}\)\.map\(\(tool\) => tool\.href\)/.test(stripComments(readFileSync("src/app/dashboard/tools/page.tsx", "utf8"))) &&
    /live=\{live\}/.test(stripComments(readFileSync("src/app/dashboard/tools/page.tsx", "utf8"))));
check("the grid draws every registry tile, live or not, through `isLive = liveSet.has(tool.href)`",
  /ALL_TOOLS\.filter\(\(tool\) => tool\.group === key\)/.test(grid) && /const isLive = liveSet\.has\(tool\.href\);/.test(grid) && /\{!isLive &&/.test(grid));

console.log("\n== 0d. every other tool is hidden, with a reason, and nothing is lost ==");
const rowless = ["/dashboard/my-stuff", "/dashboard/games"];
const ownerTools = [...drawnFor(true).filter((g) => g.heading !== "Settings").flatMap((g) => g.items.map((i) => i.href)), ...rowless];
const memberTools = drawnFor(false).filter((g) => g.heading !== "Settings").flatMap((g) => g.items.map((i) => i.href));
check(`the population was read (${ownerTools.length} for the owner, ${memberTools.length} for a member)`, ownerTools.length >= memberTools.length && memberTools.length >= 20);
const unplaced = ownerTools.filter((h) => !registryHrefs.includes(h) && !hidden.includes(h));
check("every tool the sidebar can show is in the registry or hidden on purpose", unplaced.length === 0, unplaced.join(", "));
// Sidebar rows with `hidden: true` (Apps, Videos — the older, different
// features at these same addresses) never reach `drawnFor()`'s output at
// all, for anyone, but they are still real, reachable pages, so they count
// as "exist" for this check too.
const hiddenSidebarHrefs = parsed.flatMap((g) => g.items.filter((i) => i.hidden).map((i) => i.href));
const phantom = hidden.filter((h) => !ownerTools.includes(h) && !hiddenSidebarHrefs.includes(h));
check("...and every hidden address is a tool that exists (no stale entry)", phantom.length === 0, phantom.join(", "));
const twice = hidden.filter((h) => registryHrefs.includes(h));
check("...in exactly one place: none both in the registry and hidden", twice.length === 0, twice.join(", "));
const bare = hidden.filter((h) => String(HIDDEN_FROM_ALL_TOOLS[h] ?? "").trim().length < 20);
check("...and every hidden tool says why, in a sentence", bare.length === 0, bare.join(", "));
const lostPages = hidden.filter((h) => !hasPage(h));
check("...and every hidden tool still opens at its address (its page is there)", lostPages.length === 0, lostPages.join(", "));
check("...and no Settings block on the grid: Settings, Integrations and Help are reached from Settings",
  !/SETTINGS_GROUP|\.\.\.settings\b/.test(grid));

console.log("\n== 0e. no switch decides a tile ==");
const toolsPage = stripComments(readFileSync("src/app/dashboard/tools/page.tsx", "utf8"));
check("the tools page does not read a feature switch", !/isFeatureOn|isFlagKey/.test(toolsPage));
check("...and no tile of the final grid names a switch", !/flag:/.test(readFileSync("src/lib/nav/all-tools.ts", "utf8").replace(/\/\/.*$/gm, "")));

console.log("\n== 0f. names and lines, worded in every language ==");
for (const l of LOCALES) {
  const n = messages[l].dashboard?.tools?.names ?? {};
  const bad = ALL_TOOLS.map((t) => t.name).filter((k) => typeof n[k] !== "string" || n[k].trim() === "" || n[k].trim().split(/\s+/).length > 3);
  check(`${l}: every tool has its name, at most three words`, bad.length === 0, bad.map((k) => `${k}=${JSON.stringify(n[k])}`).join(", "));
}
check("no «In testing…» line on the page", !/inTesting|In testing/i.test(grid) && LOCALES.every((l) => !/in testing/i.test(JSON.stringify(messages[l].dashboard?.tools ?? {}))));
const LINE_MAX = 60;
const lineKeys = ALL_TOOLS.map((t) => t.name);
for (const l of LOCALES) {
  const lines = messages[l].dashboard?.tools?.lines ?? {};
  const bad = lineKeys.filter((k) => typeof lines[k] !== "string" || lines[k].trim() === "" || lines[k].length > LINE_MAX);
  check(`${l}: every tile has its one line, short enough to stay one line (≤ ${LINE_MAX})`, bad.length === 0, bad.map((k) => `${k}=${JSON.stringify(lines[k])}`).join(", "));
  const g = messages[l].dashboard?.tools?.groups ?? {};
  check(`${l}: all six headings are worded`,
    ["record", "ask", "make", "runAlone", "organise", "learn"].every((k) => typeof g[k] === "string" && g[k].length > 0) && Object.keys(g).length === 6, Object.keys(g).join(","));
}
check("the Greek headings are the owner's own words", ["Κατάγραψε", "Ρώτα", "Φτιάξε", "Τρέξε μόνο του", "Οργάνωσε", "Μάθε"].every((w, i) =>
  messages.el.dashboard.tools.groups[["record", "ask", "make", "runAlone", "organise", "learn"][i]].toLowerCase() === w.toLowerCase()));

console.log("\n== 0g. the Coming Soon screen: no field, no charge, a Notify-me button ==");
const comingSoonShell = stripComments(readFileSync("src/components/tools/coming-soon-shell.tsx", "utf8"));
check("the field is disabled, never sends anything", /aria-disabled="true"/.test(comingSoonShell) && !/handleSend|onSubmit/.test(comingSoonShell));
check("the only network call is the Notify subscription, never a provider route", /\/api\/tools\/notify/.test(comingSoonShell) && !/\/api\/(images|videos|audio|chat)\b/.test(comingSoonShell));
for (const l of LOCALES) {
  const cs = messages[l].dashboard?.comingSoon ?? {};
  check(`${l}: the Coming Soon screen's own words are all present`,
    ["badge", "fieldPlaceholder", "line", "notify", "notified", "notifyFailed"].every((k) => typeof cs[k] === "string" && cs[k].length > 0));
}
const examplesNeeded = ["apps", "video", "films", "editing", "avatars", "audio", "translate"];
for (const l of LOCALES) {
  const ex = messages[l].dashboard?.comingSoon?.examples ?? {};
  const bad = examplesNeeded.filter((k) => !ex[k] || Object.keys(ex[k]).length === 0);
  check(`${l}: every not-ready tool with examples on its page has them worded (${examplesNeeded.join(",")})`, bad.length === 0, bad.join(", "));
}
check("iowork's Coming Soon page passes no examples (it has none to show)", /examples=\{\[\]\}|<ComingSoonShell\s+toolKey="iowork"\s+name=\{[^}]+\}\s*\/>/.test(stripComments(readFileSync("src/app/dashboard/iowork/page.tsx", "utf8"))) || !/examples=/.test(stripComments(readFileSync("src/app/dashboard/iowork/page.tsx", "utf8"))));

console.log("\n== 0h. only the 24 big tiles reach the page, each group its own full-width row (the owner's \"ALL TOOLS: ΜΟΝΟ ΤΑ ΚΑΝΟΝΙΚΑ ΤΕΤΡΑΓΩΝΑ\", 2026-10-24) ==");
const defaultBranch = grid.slice(grid.indexOf('<div className="mt-5 flex flex-col gap-6">'));
check("the default (non-search) render draws no quick-job tile",
  defaultBranch.length > 50 && !/\bsmallTile\b/.test(defaultBranch), "smallTile referenced inside the default (non-search) render branch");
check("...and no group shares a row with another: a vertical stack, each section full width",
  /<div className="mt-5 flex flex-col gap-6">/.test(grid), "the groups wrapper must be a vertical stack (flex-col), not a grid that lets sections share a row");
check("...one fixed grid (GRID) used for every group's row and for search results alike",
  /const GRID = "grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5"/.test(grid) &&
    (grid.match(/className=\{GRID\}|\$\{GRID\}/g) ?? []).length >= 2,
  "GRID must be reused, not re-derived per group, or tile widths could drift apart");
check("a name never wraps and is never cut (whitespace-nowrap on the name, no truncate/line-clamp on it)",
  /whitespace-nowrap text-sm font-medium text-foreground/.test(grid) && !/truncate text-sm font-medium|line-clamp[^>]*text-sm font-medium/.test(grid));
check("...the line below it is the one span allowed to truncate, which is what keeps every tile the same height",
  /truncate text-xs text-muted/.test(grid));
check("every tile fills its grid cell (h-full) with the same minimum height, badge and pin absolutely positioned so neither touches the name's own width",
  /className="group relative h-full"/.test(grid) && /min-h-\[88px\]/.test(grid) &&
    /absolute end-2 top-2[^"]*"[\s\S]{0,40}data-testid="tool-tile-badge"|data-testid="tool-tile-badge"[\s\S]{0,200}absolute end-2 top-2/.test(grid));

console.log("\n== 1. the small ready-made jobs (quick-jobs.ts): every one opens a real page, worded everywhere ==");
const { QUICK_JOBS, quickJobHref } = await loadTs("src/lib/nav/quick-jobs.ts");
const jobTargets = new Set(ALL_TOOLS.map((t) => t.href));
jobTargets.add("/dashboard/chat");
jobTargets.add("/dashboard/meetings");
check(`every quick job's href is a real address (${QUICK_JOBS.length} jobs)`, QUICK_JOBS.every((j) => hasPage(j.href) || jobTargets.has(j.href)), QUICK_JOBS.filter((j) => !hasPage(j.href) && !jobTargets.has(j.href)).map((j) => j.id).join(", "));
check("every quick job's group is one of the six", QUICK_JOBS.every((j) => ALL_TOOLS_GROUP_ORDER.includes(j.group)));
check("every quick job's id is unique", new Set(QUICK_JOBS.map((j) => j.id)).size === QUICK_JOBS.length);
for (const l of LOCALES) {
  const qj = messages[l].dashboard?.quickJobs ?? {};
  const bad = QUICK_JOBS.filter((j) => typeof qj[j.id]?.label !== "string" || qj[j.id].label.trim() === "");
  check(`${l}: every quick job has its label`, bad.length === 0, bad.map((j) => j.id).join(", "));
  const badText = QUICK_JOBS.filter((j) => j.param && (typeof qj[j.id]?.text !== "string" || qj[j.id].text.trim() === ""));
  check(`${l}: every quick job with a param has its example text`, badText.length === 0, badText.map((j) => j.id).join(", "));
}
check("quickJobHref carries the text under the job's own param, and falls back to a bare link without one",
  quickJobHref({ href: "/dashboard/chat", param: "ask" }, "hello") === "/dashboard/chat?ask=hello" &&
    quickJobHref({ href: "/dashboard/chat", param: "ask" }, undefined) === "/dashboard/chat" &&
    quickJobHref({ href: "/dashboard/meetings" }, "anything") === "/dashboard/meetings");
// Which param a target page actually reads, read from the page source —
// so a job pointing at the wrong param is caught, not assumed correct.
const PARAM_READS = {
  "/dashboard/data-analysis": "ask", "/dashboard/my-stuff": "ask", "/dashboard/images": "ask",
  "/dashboard/projects": "ask", "/dashboard/games": "ask", "/dashboard/documents": "ask",
  "/dashboard/chat": "ask", "/dashboard/deep-research": "brief", "/dashboard/presentations": "brief",
  "/dashboard/posts": "brief", "/dashboard/website-builder": "brief", "/dashboard/automation": "said",
  "/dashboard/agents": "agent",
};
const wrongParam = QUICK_JOBS.filter((j) => j.param && PARAM_READS[j.href] && PARAM_READS[j.href] !== j.param);
check("every job's param matches what its target page actually reads", wrongParam.length === 0, wrongParam.map((j) => `${j.id}:${j.param}!=${PARAM_READS[j.href]}`).join(", "));
for (const [href, param] of Object.entries(PARAM_READS)) {
  const file = readFileSync(pageFileFor(href), "utf8");
  check(`${href}'s page actually reads ?${param}=`, new RegExp(`searchParams[?.\\w]*\\.${param}`).test(file), href);
}

console.log("\n== 2. the search finds a tool by a word it is not called, big and small together ==");
const match = await loadTs("src/lib/command-palette-match.ts");
const { ITEM_LABEL_KEYS } = await loadTs("src/lib/sidebar-label-keys.ts");
const { aliasesFor } = await loadTs("src/lib/palette-aliases.ts");
check("the grid merges big-tile and small-job candidates into one ranked list",
  /filterAndRankCandidates\(\[\.\.\.bigCandidates, \.\.\.smallCandidates\]\.map\(/.test(grid));
const everyItemByHref = new Map(allDrawn.map((i) => [i.href, i]));
const searchBig = (locale, query) => {
  const names = messages[locale].dashboard.tools.names;
  const lines = messages[locale].dashboard.tools.lines;
  return match.filterAndRankCandidates(
    ALL_TOOLS.map((tool) => {
      const item = everyItemByHref.get(tool.href);
      const key = item ? ITEM_LABEL_KEYS[item.label] : undefined;
      const long = key ? messages[locale].sidebar.items[key] : item?.label ?? "";
      return {
        item: tool,
        candidates: [names[tool.name], long, item?.label ?? "", ...aliasesFor(key ?? "", locale), lines[tool.name] ?? ""],
      };
    }),
    query
  );
};
check('"research" finds Deep Research, in English', searchBig("en", "research").map((t) => t.href)[0] === "/dashboard/deep-research");
check('...and "investigate" finds it too, an alias', searchBig("en", "investigate").map((t) => t.href).includes("/dashboard/deep-research"));
check('"βαθι" finds it by its Greek name', searchBig("el", "βαθι").map((t) => t.href).includes("/dashboard/deep-research"));
check('"site" finds Site', searchBig("en", "site").map((t) => t.href)[0] === "/dashboard/website-builder");
check("a word that is nothing finds nothing", searchBig("en", "qqzzxx").length === 0);
// "cv" still finds the quick job by name in Greek, through its own
// aliases field (lib/nav/quick-jobs.ts) — not lib/palette-aliases.ts,
// whose own gate ties every key to a sidebar item key a quick job has
// none of. This is the one thing a reader can still ask this page for
// the CV job by, now that its tile left the page itself.
const searchSmall = (locale, query) => {
  const jobs = messages[locale].dashboard.quickJobs;
  return match.filterAndRankCandidates(
    QUICK_JOBS.map((job) => ({
      item: job,
      candidates: [jobs[job.id]?.label ?? "", ...(job.aliases?.[locale] ?? [])],
    })),
    query
  );
};
check('"cv" finds the cv job, in Greek, by its own alias', searchSmall("el", "cv").some((j) => j.id === "cv"));
for (const l of LOCALES) {
  const t = messages[l].dashboard?.tools ?? {};
  check(`${l}: the search, its label and the empty result are worded`,
    ["search", "searchLabel"].every((k) => typeof t[k] === "string" && t[k].length > 0) && /\{query\}/.test(t.noMatch ?? ""));
}

console.log("\n== 3. the pin: unchanged — the one way to put a tool in the sidebar at once ==");
check("a 44px pin on the big square, its state announced", /data-testid="tool-pin"/.test(grid) && /aria-pressed=\{isPinned\}/.test(grid) && /h-11 w-11/.test(grid));
check("...writing through the sidebar's own route", /fetch\("\/api\/nav\/recent-tools"/.test(grid) && /JSON\.stringify\(\{ action, href \}\)/.test(grid));
check("...and a failed write puts the pin back and says so", /setPins\(before\)/.test(grid) && /addToast\(/.test(grid));
check("no pin on a small ready-made job (it never had a sidebar row of its own)", !/data-testid="tool-pin"[\s\S]{0,400}quick-job/.test(grid));

console.log("\n== 4. no «beta», anywhere on the page ==");
check("the grid draws no tag", !/isBetaTool|BETA_TOOLS|bg-tag|\bbeta\b/i.test(grid));
const betaLeft = LOCALES.filter((l) => "beta" in (messages[l].dashboard?.tools ?? {}) || "betaHint" in (messages[l].dashboard?.tools ?? {}));
check("...and no locale still carries the tag's words", betaLeft.length === 0, betaLeft.join(", "));

console.log(failures.length === 0 ? `\nALL PASS: ${pass} passed, 0 failed` : `\n${failures.length} FAILED, ${pass} passed`);
process.exit(failures.length === 0 ? 0 : 1);
