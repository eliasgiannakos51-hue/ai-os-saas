// A STATIC SEGMENT BEATS A DYNAMIC ONE, AND NOTHING SAYS SO.
//
// src/app/dashboard/[module]/page.tsx serves the twelve business modules
// by slug. src/app/dashboard/finance/page.tsx was the owner-only
// Financial Dashboard. `finance` is also a module slug — table
// finance_entries — and in Next.js the literal directory wins. No build
// warning, no runtime warning, no failing test.
//
// What that cost, for two releases:
//
//   * "Finances" was in the MAIN NAV, under Business, for every user. It
//     led to a page whose first line is `if (!isAdminEmail(user.email))
//     notFound()`. So every ordinary user who pressed it got a 404 out of
//     the product's own navigation.
//   * The module's rows could not be read or created through any screen.
//     There is no other route to finance_entries.
//   * /api/insights/generate goes on READING finance_entries, so an
//     insight could cite a module nobody could open.
//
// That is a total outage of one feature, caused by adding an unrelated
// one, and no gate in this repository could see it. This is that gate.
//
// TWO CLAIMS, and the second is the one that keeps this honest:
//   1. No module slug has a static directory, except the ones declared
//      here as deliberate.
//   2. Every nav item that points at a page which refuses non-owners
//      carries `ownerOnly`. A nav that cannot express a role is how the
//      first bug reached the main menu rather than staying a stray URL.
//
// Run: node scripts/tests/route-shadowing.test.mjs
import { readdirSync, readFileSync, statSync } from "node:fs";

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
function checkList(name, actual) {
  check(name, actual.length === 0, actual.slice(0, 8).join("\n        "));
}

const { loadTs } = await import("./load-ts.mjs");
const { MODULES } = await loadTs("src/lib/modules.ts");
const { BUILD_MODULES } = await loadTs("src/lib/build-modules.ts");
// THE FILTER IS EXECUTED, THE CONFIG IS READ. lib/sidebar-nav.ts imports
// forty icons from lucide-react and loadTs refuses external node_modules
// on purpose, so the config is parsed from its source — while the rule
// itself lives in lib/sidebar-visibility.ts, which imports nothing, and
// is run for real.
const { visibleGroups } = await loadTs("src/lib/sidebar-visibility.ts");
const NAV_SRC = readFileSync("src/lib/sidebar-nav.ts", "utf8");
// Each item's own text runs from its `href:` to the next one. Multi-line
// objects and one-line objects both fall out of that without a parser.
const navChunks = NAV_SRC.split(/href:\s*/).slice(1);
const navItems = navChunks.map((chunk) => {
  const href =
    chunk.match(/^["'`]([^"'`]+)["'`]/)?.[1] ??
    // Three items take their href from a constant in lib/modules.ts
    // (OVERVIEW_NAV_ITEM.href and friends); their routes are not
    // owner-only and are covered by the module-slug half above.
    chunk.match(/^([A-Z_]+)\.href/)?.[1] ??
    null;
  return { href, ownerOnly: /ownerOnly:\s*true/.test(chunk.split(/href:\s*/)[0]) };
});

const DASHBOARD = "src/app/dashboard";
const staticDirs = readdirSync(DASHBOARD).filter(
  (d) => statSync(`${DASHBOARD}/${d}`).isDirectory() && !d.startsWith("["),
);

console.log(`== 1. no module slug is shadowed (${staticDirs.length} static segments) ==`);
// The BUILD modules have literal routes on purpose: they are NOT served
// by [module] at all — getModule() reads MODULES only, and each of these
// six has its own page rendering BuildModulePage with a hardcoded config.
// Declared by name so the exemption is a decision, not a coincidence.
const DELIBERATE = new Set(BUILD_MODULES.map((m) => m.slug));
const shadowed = MODULES.map((m) => m.slug)
  .filter((slug) => staticDirs.includes(slug))
  .filter((slug) => !DELIBERATE.has(slug));
checkList(
  `no [module] slug has a static directory (${MODULES.length} modules)`,
  shadowed.map(
    (slug) =>
      `${slug}: src/app/dashboard/${slug}/ shadows [module], so /dashboard/${slug} never reaches the module`,
  ),
);
// And the reverse, so the exemption list cannot quietly cover a real one:
// every deliberate name must actually BE a build module with its own page
// that renders BuildModulePage.
const wrongExemption = [...DELIBERATE]
  .filter((slug) => staticDirs.includes(slug))
  .filter((slug) => {
    const page = `${DASHBOARD}/${slug}/page.tsx`;
    try {
      return !/BuildModulePage/.test(readFileSync(page, "utf8"));
    } catch {
      return true;
    }
  });
checkList(
  "every exempt static route really is a build module's own page",
  wrongExemption,
);
// A scan that finds nothing proves nothing.
check(
  `the scan read the app directory (${staticDirs.length} segments, ${MODULES.length} modules, ${BUILD_MODULES.length} build modules)`,
  staticDirs.length >= 30 && MODULES.length >= 12 && BUILD_MODULES.length >= 6,
  `${staticDirs.length}/${MODULES.length}/${BUILD_MODULES.length}`,
);

console.log("\n== 2. the nav never sends a user to a page that refuses them ==");
// Read the pages, not a list: a page that starts refusing non-owners
// tomorrow is caught the day it does, without anybody remembering to come
// back here.
function pageFileFor(href) {
  if (!href.startsWith("/dashboard")) return null;
  const rest = href.slice("/dashboard".length).replace(/^\//, "");
  const file = rest ? `${DASHBOARD}/${rest}/page.tsx` : `${DASHBOARD}/page.tsx`;
  try {
    statSync(file);
    return file;
  } catch {
    // No literal page: the [module] catch-all serves it, and that route
    // refuses nobody.
    return null;
  }
}
const OWNER_GUARD = /isAdminEmail\([^)]*\)\)\s*notFound\(\)/;
const allItems = navItems.filter((i) => i.href && i.href.startsWith("/"));
// MEASURED AT 38, not guessed at 40 — which is what the first version of
// this line said, and it went red on a perfectly healthy nav.
check(
  `the nav was parsed (${allItems.length} items with a literal href)`,
  allItems.length >= 38,
  `${allItems.length} — a parse that finds nothing passes every check below it`,
);
const leaks = allItems
  .filter((item) => {
    const file = pageFileFor(item.href);
    return file !== null && OWNER_GUARD.test(readFileSync(file, "utf8"));
  })
  .filter((item) => !item.ownerOnly)
  .map((item) => `${item.href} 404s for non-owners and is not marked ownerOnly`);
checkList(`every owner-only page in the nav is marked (${allItems.length} items)`, leaks);
// And the flag has to actually remove them. Run against the real filter,
// on groups shaped like the real ones.
const ownerItems = allItems.filter((i) => i.ownerOnly);
check(
  `at least one item is owner-only, or this section proves nothing (${ownerItems.length})`,
  ownerItems.length >= 1,
  ownerItems.map((i) => i.href).join(", "),
);
const sample = [
  { heading: "Business", collapsible: true, items: [{ href: "/a" }, { href: "/b", ownerOnly: true }] },
  { heading: "OwnerOnlyGroup", collapsible: true, items: [{ href: "/c", ownerOnly: true }] },
];
const asUser = visibleGroups(sample, false);
check(
  "a non-owner sees no owner-only item",
  asUser.flatMap((g) => g.items).every((i) => !i.ownerOnly),
);
check(
  "a group left empty is dropped rather than rendered as a bare heading",
  asUser.length === 1 && asUser[0].heading === "Business",
  asUser.map((g) => g.heading).join(", "),
);
check(
  "the owner still sees every item",
  visibleGroups(sample, true).flatMap((g) => g.items).length === 3,
);
check(
  "and the config itself is never mutated",
  sample[0].items.length === 2 && sample[1].items.length === 1,
);
// THE PALETTE IS THE OTHER HALF. Hiding an item from the sidebar and
// leaving it in the command palette moves it one keystroke away rather
// than hiding it, so the palette has to read the same filter.
const palette = readFileSync("src/components/dashboard/command-palette.tsx", "utf8");
check(
  "the command palette filters by the same rule",
  /visibleGroups\(ALL_SIDEBAR_GROUPS, isOwner\)/.test(palette),
);
const layout = readFileSync("src/app/dashboard/layout.tsx", "utf8");
check(
  "and the layout tells both surfaces who is looking",
  /<Sidebar[^>]*isOwner=\{isAdmin\}/.test(layout) &&
    /<CommandPalette isOwner=\{isAdmin\} \/>/.test(layout),
);

console.log("\n== 3. the module that was shadowed is reachable again ==");
const financeModule = MODULES.find((m) => m.slug === "finance");
check("the finance module still exists", Boolean(financeModule));
check(
  "its table is unchanged, so no data moved",
  financeModule?.table === "finance_entries",
  String(financeModule?.table),
);
checkList(
  "and nothing occupies /dashboard/finance any more",
  staticDirs.includes("finance") ? ["src/app/dashboard/finance/ is back"] : [],
);
// The owner dashboard did not disappear, it moved.
check(
  "the owner dashboard lives at its own route",
  staticDirs.includes("business-health"),
);
const moved = readFileSync(`${DASHBOARD}/business-health/page.tsx`, "utf8");
check("and still refuses non-owners", OWNER_GUARD.test(moved));
// The insight generator reads finance_entries; that is only safe now the
// module has a page again.
const insights = readFileSync("src/app/api/insights/generate/route.ts", "utf8");
check(
  "the insight generator's finance_entries reader now has a page behind it",
  /finance_entries/.test(insights) && !staticDirs.includes("finance"),
);

console.log(
  `\n${failures.length === 0 ? "ALL PASS" : "FAILURES"}: ${pass} passed, ${failures.length} failed`,
);
process.exit(failures.length === 0 ? 0 : 1);
