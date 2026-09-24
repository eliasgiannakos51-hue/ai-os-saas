// THE MARKETPLACE IS WITHDRAWN FROM EVERY SURFACE, AND STILL SERVED.
//
// Decided 2026-09-24: trading other people's agent templates is a
// separate product for V8+, not a capability of Ionexa AI. What that had
// to mean, exactly:
//
//   * no row in the sidebar
//   * nothing in the command palette — `hidden` was the near miss here,
//     because a hidden row stays one keystroke away in search, which is
//     moving a capability rather than withdrawing it
//   * nothing on /pricing
//   * THE PAGE STILL WORKS for anyone holding the URL
//   * agent_templates and match_agent_templates untouched, because the
//     marketplace is NOT their only reader
//
// That last one is the part that could have been broken quietly. Four
// other places reach the same table and the same RPC, all from the
// Agents screen: api/agents/templates searches through the function,
// .../share writes a row, .../adopt reads one, and
// lib/health/schema-canaries.ts watches the function exist. Deleting the
// page would have broken none of them; taking the table would have
// broken all four, and nothing in the nav would have said so.
//
// THE FILTERS ARE EXECUTED, NOT DESCRIBED. lib/sidebar-visibility.ts is
// imported and run — the config itself is parsed because sidebar-nav.ts
// pulls fifty icons out of lucide-react, which scripts/tests cannot
// reach, and that is the same arrangement sidebar-structure.test.mjs and
// sidebar-and-tooltips.test.mjs already use.
//
// Run: node scripts/tests/marketplace-retired.test.mjs
import { readFileSync, existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { loadTs } from "./load-ts.mjs";
import { groupBlocks, itemChunks } from "./lib/sidebar-source.mjs";
import { stripComments } from "../check-mutation-markers.mjs";

let pass = 0;
const failures = [];
function check(name, cond, detail) {
  if (cond) {
    pass++;
    console.log(`  PASS  ${name}`);
  } else {
    failures.push(name);
    console.log(`  FAIL  ${name}${detail !== undefined ? "\n        " + detail : ""}`);
  }
}

const HREF = "/dashboard/marketplace";
const navSrc = readFileSync("src/lib/sidebar-nav.ts", "utf8");
const { visibleGroups, sidebarGroups, declaredGroups } = await loadTs(
  "src/lib/sidebar-visibility.ts"
);

const groups = groupBlocks(navSrc).map((g) => ({
  heading: g.heading,
  items: itemChunks(g.body).map((i) => ({
    href: i.literalHref ?? i.constantHref ?? "?",
    label: i.chunk.match(/label:\s*["'`]([^"'`]+)["'`]/)?.[1] ?? "?",
    icon: null,
    ...(i.hidden ? { hidden: true } : {}),
    ...(i.notBuilt ? { notBuilt: true } : {}),
    ...(i.ownerOnly ? { ownerOnly: true } : {}),
    ...(i.retired ? { retired: "declared" } : {}),
  })),
}));

console.log("== 1. the config was read, so nothing below is vacuous ==");
check(`groups were parsed (${groups.length})`, groups.length >= 6, groups.map((g) => g.heading).join(", "));
const declaredAll = declaredGroups(groups).flatMap((g) => g.items);
check(`items were parsed (${declaredAll.length})`, declaredAll.length >= 40, String(declaredAll.length));
check(
  "the marketplace row is still DECLARED, so this is a filter and not a deletion",
  declaredAll.some((i) => i.href === HREF),
  "the row is gone from the config — that is a deletion, and it takes the palette entry and the translation with it"
);

console.log("\n== 2. no surface offers it, for either role ==");
for (const isOwner of [false, true]) {
  const who = isOwner ? "owner" : "non-owner";
  const side = sidebarGroups(groups, isOwner).flatMap((g) => g.items.map((i) => i.href));
  const pal = visibleGroups(groups, isOwner).flatMap((g) => g.items.map((i) => i.href));
  check(`${who}: the sidebar does not draw it (${side.length} rows drawn)`, !side.includes(HREF));
  // THE ONE `hidden` WOULD HAVE FAILED. The command palette is built on
  // visibleGroups, which ignores `hidden` on purpose so a tidied sidebar
  // does not become an unsearchable product.
  check(`${who}: the command palette does not offer it (${pal.length} searchable)`, !pal.includes(HREF));
  check(`${who}: and the palette still has plenty else`, pal.length >= 30, String(pal.length));
}

console.log("\n== 3. the Run group draws exactly two rows ==");
for (const isOwner of [false, true]) {
  const who = isOwner ? "owner" : "non-owner";
  const run = sidebarGroups(groups, isOwner).find((g) => g.heading === "Run");
  // A GROUP LEFT EMPTY IS DROPPED, so "Run is missing" and "Run is empty"
  // are the same bug and this catches both.
  check(`${who}: the Run group is still drawn`, Boolean(run), "Run was dropped — every row under it was filtered out");
  const labels = run ? run.items.map((i) => i.label) : [];
  check(
    `${who}: it has exactly two items (${labels.join(" · ") || "none"})`,
    labels.length === 2,
    `${labels.length}: ${labels.join(", ")}`
  );
  check(`${who}: AI Agents and Automation`, labels.includes("AI Agents") && labels.includes("Automation"), labels.join(", "));
}

console.log("\n== 4. the page is still there and still served ==");
const PAGE = "src/app/dashboard/marketplace/page.tsx";
check("the page file exists", existsSync(PAGE));
const page = readFileSync(PAGE, "utf8");
check("it still exports a default page component", /export default async function \w+/.test(stripComments(page)));
check("it still reads the table", /\.from\("agent_templates"\)/.test(stripComments(page)));
// THE REASON IS RECORDED. A row nobody can find has to say why it is
// still here, or the next reader deletes the page and takes the URL.
const retiredReason = navSrc.match(/retired:\s*([\s\S]{0,400}?)(?:,\n\s*\}|\n\s*\},)/)?.[1] ?? "";
check(
  `the nav row records why, in words (${retiredReason.replace(/\s+/g, " ").trim().length} chars)`,
  retiredReason.replace(/\s+/g, " ").trim().length > 80,
  retiredReason.slice(0, 120)
);
// AND IT HAS TO SAY THE TWO THINGS A READER NEEDS. Length alone let a
// mutation blank the first of three concatenated lines and stay green:
// the remaining prose was still long. A date says when the decision was
// made, and naming the table says what deleting this page would cost —
// which is the fact that is not visible from the nav.
check(
  "...dated, so a reader knows when the decision was made",
  /20\d\d-\d\d-\d\d/.test(retiredReason),
  retiredReason.slice(0, 160)
);
check(
  "...and it names what must not be deleted with it",
  /agent_templates/.test(retiredReason),
  retiredReason.slice(0, 160)
);
check(
  "...and the page says it is hidden and why",
  /HIDDEN\./.test(page) && /V8\+/.test(page),
  "the page carries no note that it has been withdrawn"
);

console.log("\n== 5. agent_templates did not break ==");
// THE POPULATION, DERIVED. Every file under src that names the table or
// the RPC — so a fifth reader added tomorrow is covered without an edit
// here, and a reader that disappears is noticed.
const readers = [];
(function walk(dir) {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) walk(p);
    else if (/\.tsx?$/.test(e.name)) {
      const src = stripComments(readFileSync(p, "utf8"));
      if (/agent_templates|match_agent_templates/.test(src)) readers.push(p);
    }
  }
})("src");
check(`the table has readers outside the marketplace page (${readers.length})`, readers.length >= 4, readers.join(", "));
for (const required of [
  "src/app/api/agents/templates/route.ts",
  "src/app/api/agents/templates/share/route.ts",
  "src/app/api/agents/templates/adopt/route.ts",
  "src/lib/health/schema-canaries.ts",
]) {
  check(`${required.replace("src/app/api/", "api/")} still reaches it`, readers.includes(required), readers.join(", "));
}
const searchRoute = stripComments(readFileSync("src/app/api/agents/templates/route.ts", "utf8"));
check("the search route still calls match_agent_templates", /rpc\("match_agent_templates"/.test(searchRoute));
// AND THE MIGRATION IS UNTOUCHED — no DROP arrived with the nav change.
const migrations = readdirSync("supabase/migrations").filter((f) => f.endsWith(".sql"));
const drops = migrations.filter((f) =>
  /drop\s+(table|function)[\s\S]{0,80}?(agent_templates|match_agent_templates)/i.test(
    readFileSync(join("supabase/migrations", f), "utf8")
  )
);
check(`no migration drops the table or the function (${migrations.length} read)`, drops.length === 0, drops.join(", "));
check(`the migration list was read (${migrations.length})`, migrations.length >= 20, String(migrations.length));

console.log("\n== 6. nothing on /pricing sells it ==");
const catalog = await loadTs("src/lib/billing/feature-catalog.ts");
const sold = catalog.soldFeatures();
check(`the published table has rows (${sold.length})`, sold.length >= 15, String(sold.length));
check(
  "no sold row is the marketplace itself",
  !sold.some((f) => /marketplace/i.test(f.id)),
  sold.filter((f) => /marketplace/i.test(f.id)).map((f) => f.id).join(", ")
);

console.log(`\n${failures.length === 0 ? "ALL PASS" : "FAILURES"}: ${pass} passed, ${failures.length} failed`);
if (failures.length) {
  for (const f of failures) console.log(`  - ${f}`);
  process.exit(1);
}
