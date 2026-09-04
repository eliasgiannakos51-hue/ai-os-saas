// NO PAGE WITHOUT A WAY IN.
//
// Asked for on 2026-09-04, after four routes turned out to have a page on
// disk and no entry anywhere: /dashboard/costs, /dashboard/routing,
// /dashboard/system-health and /dashboard/trading-journal. Two of them —
// routing and trading-journal — had no link in the entire product, in any
// sidebar, in the command palette, on the hub, or from another page. They
// were reachable only by typing the URL, which means they were reachable
// only by whoever wrote them.
//
// This is the cheapest possible statement of the rule: every route under
// /dashboard that renders a page must be findable by at least one of the
// three ways a person actually finds things.
//
//   1. THE SIDEBAR — a drawn row (lib/sidebar-nav.ts, not hidden).
//   2. THE COMMAND PALETTE — any entry in the nav config, hidden or not:
//      the palette flattens `visibleGroups`, so a hidden row is still
//      searchable by name. This is what "hidden" means here — out of the
//      drawn list, not out of the product.
//   3. A LINK FROM ANOTHER PAGE — an href in any component or page under
//      src/, so a route reached only from the screen it belongs beside
//      (a detail page, a tab, a "see all") counts as reachable.
//
// WHAT THIS GATE CANNOT SEE, said plainly: a link built at runtime from a
// variable — `href={`/dashboard/${slug}`}` — is not a string it can find.
// Those routes have to be named in the nav config like everything else,
// which is the point: a route whose only way in is a template literal
// somewhere is a route nobody can search for either.
//
// EXCEPTIONS ARE A LIST WITH REASONS, not a flag. Every entry below says
// why that route needs no entry point, and a route not on the list and
// not linked fails the build.
//
// Run: node scripts/tests/entry-points.test.mjs
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

let pass = 0;
const failures = [];
function check(name, cond, detail) {
  if (cond) {
    pass++;
    console.log(`  PASS  ${name}`);
  } else {
    failures.push(name);
    console.log(`  FAIL  ${name}${detail !== undefined ? `\n        ${detail}` : ""}`);
  }
}

// ---------------------------------------------------------------------
// The routes that exist: every directory under app/dashboard with a page.
// ---------------------------------------------------------------------
const APP_DIR = "src/app/dashboard";

/** Every route that renders a page, as its URL path. */
function routesUnder(dir, prefix = "/dashboard") {
  const out = [];
  let entries;
  try {
    entries = readdirSync(dir);
  } catch {
    return out;
  }
  if (entries.includes("page.tsx")) out.push(prefix);
  for (const name of entries) {
    const full = join(dir, name);
    if (!statSync(full).isDirectory()) continue;
    out.push(...routesUnder(full, `${prefix}/${name}`));
  }
  return out;
}

const allRoutes = routesUnder(APP_DIR).sort();
check(`the dashboard routes were found (${allRoutes.length})`, allRoutes.length >= 30, allRoutes.join(", "));

// ---------------------------------------------------------------------
// EXCEPTIONS, each with the reason it needs no entry point of its own.
// ---------------------------------------------------------------------
const EXEMPT = {
  // A catch-all, not a page: it serves the module slugs, and every slug it
  // serves is a nav entry in its own right. There is no URL "/dashboard/
  // [module]" for anyone to reach.
  "/dashboard/[module]": "the [module] catch-all — its slugs are the nav entries",
  // A detail page reached from the document it belongs to. Its parent
  // (/dashboard/documents) is in the nav; a document id cannot be.
  "/dashboard/documents/[id]": "a document's own page, opened from the documents list",
};

// ---------------------------------------------------------------------
// 1 + 2. The nav config: drawn rows and palette rows.
// ---------------------------------------------------------------------
// PARSED FROM THE SOURCE, not imported: lib/sidebar-nav.ts imports icons
// from lucide-react, which scripts/tests cannot resolve. Same approach and
// same reason as scripts/tests/sidebar-size.test.mjs, and cross-checked
// against an independent count below so a regex that quietly stops
// matching cannot turn this whole file green by finding nothing.
const navSrc = readFileSync("src/lib/sidebar-nav.ts", "utf8");
const modulesSrc = readFileSync("src/lib/modules.ts", "utf8");
/** OVERVIEW_NAV_ITEM.href and friends, read out of lib/modules.ts. */
const navConstants = new Map(
  [...modulesSrc.matchAll(/export const ([A-Z_]+_NAV_ITEM) = \{ href: "([^"]+)"/g)].map((m) => [m[1], m[2]])
);
const navItems = navSrc
  .split(/href:\s*/)
  .slice(1)
  .map((chunk) => {
    const own = chunk.split(/\n\s*\{/)[0];
    const literal = chunk.match(/^["'`]([^"'`]+)["'`]/)?.[1];
    const viaConst = chunk.match(/^([A-Z_]+)\.href/)?.[1];
    return {
      href: literal ?? (viaConst ? navConstants.get(viaConst) ?? null : null),
      hidden: /hidden:\s*true/.test(own),
      label: own.match(/label:\s*["'`]([^"'`]+)["'`]/)?.[1] ?? own.match(/label:\s*([A-Z_]+)\.label/)?.[1] ?? null,
    };
  });
const rawHrefCount = (navSrc.match(/^\s*(\{\s*)?href:/gm) ?? []).length;
check(
  `the parse found every nav entry (${navItems.length} parsed, ${rawHrefCount} href: lines)`,
  navItems.length === rawHrefCount && navItems.length > 0,
  `${navItems.length} vs ${rawHrefCount} — the parse and the file disagree`
);
check(
  "and every parsed entry resolved an href",
  navItems.every((i) => i.href),
  navItems.filter((i) => !i.href).map((i) => i.label ?? "?").join(", ")
);
const drawn = new Set(navItems.filter((i) => !i.hidden).map((i) => i.href));
const inPalette = new Set(navItems.map((i) => i.href));
check(`the nav config was read (${navItems.length} entries, ${drawn.size} drawn)`, navItems.length >= 30 && drawn.size >= 10);

// ---------------------------------------------------------------------
// 3. A link from anywhere in src/ — an href written as a literal string.
// ---------------------------------------------------------------------
function filesUnder(dir) {
  const out = [];
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) out.push(...filesUnder(full));
    else if (/\.(tsx?|mjs)$/.test(name)) out.push(full);
  }
  return out;
}
const sources = filesUnder("src");
const linked = new Set();
for (const file of sources) {
  const text = readFileSync(file, "utf8");
  for (const m of text.matchAll(/["'`](\/dashboard\/[a-z0-9-]+)(?:[?#][^"'`]*)?["'`]/gi)) {
    // A route that links only to ITSELF is not reachable — the page's own
    // canonical URL, a redirect back to where you already are, a tab that
    // re-renders the same screen. Those are excluded by ignoring hits
    // inside that route's own directory.
    const owner = `src/app${m[1]}/`;
    if (file.startsWith(owner)) continue;
    linked.add(m[1]);
  }
}
check(`links were found in src (${linked.size} distinct dashboard hrefs)`, linked.size >= 20);

// ---------------------------------------------------------------------
console.log("\n== every dashboard route has at least one way in ==");
const orphans = [];
for (const route of allRoutes) {
  if (route in EXEMPT) continue;
  const ways = [];
  if (drawn.has(route)) ways.push("sidebar");
  if (inPalette.has(route)) ways.push("palette");
  if (linked.has(route)) ways.push("link");
  if (ways.length === 0) orphans.push(route);
  else console.log(`        ${route.padEnd(34)} ${ways.join(" + ")}`);
}
check(
  `no route is reachable only by typing its URL (${allRoutes.length - Object.keys(EXEMPT).length} checked)`,
  orphans.length === 0,
  orphans.length
    ? `these have no sidebar row, no palette entry and no link:\n        ${orphans.join("\n        ")}\n        Add each to lib/sidebar-nav.ts (hidden: true is enough), or to EXEMPT here with a reason.`
    : ""
);

// ---------------------------------------------------------------------
console.log("\n== the exception list is honest ==");
// AN EXEMPTION FOR A ROUTE THAT DOES NOT EXIST is a reason nobody can
// check, and it is how a list like this rots.
for (const [route, reason] of Object.entries(EXEMPT)) {
  check(`${route} is a real route`, allRoutes.includes(route), "exempted, but there is no such page");
  check(`  …and the reason is written out`, typeof reason === "string" && reason.length > 20, reason);
}

// ---------------------------------------------------------------------
console.log("\n== the four that were orphaned are named in the config ==");
// NOT DERIVED — OBSERVED. These four were found by hand on 2026-09-04
// with a page and no entry anywhere. They are the reason this file
// exists, so they are checked by name: a refactor that drops them again
// fails here rather than being noticed a month later.
for (const route of ["/dashboard/costs", "/dashboard/routing", "/dashboard/system-health", "/dashboard/trading-journal"]) {
  check(`${route} has a nav entry`, inPalette.has(route), "it had none, and nothing linked to it");
}

// AND THE TWO THAT HAD NO LINK AT ALL must be reachable by search, which
// is the only way in a person can use without knowing the URL already.
for (const route of ["/dashboard/routing", "/dashboard/trading-journal"]) {
  const item = navItems.find((i) => i.href === route);
  check(`${route} is searchable by name`, Boolean(item?.label && item.label.length > 2), JSON.stringify(item ?? null));
}

console.log(`\n${failures.length === 0 ? "ALL PASS" : "FAILED"}: ${pass} passed, ${failures.length} failed`);
if (failures.length > 0) process.exit(1);
