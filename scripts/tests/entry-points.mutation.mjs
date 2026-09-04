#!/usr/bin/env node
/*
 * CAN entry-points.test.mjs SEE A PAGE LOSE ITS WAY IN?
 *
 * The gate exists because four routes had a page and no entry anywhere —
 * two of them with no link in the entire product. Each mutation below
 * takes a way in away again, or takes away the gate's ability to notice:
 * a route dropped from the nav, an exemption invented instead of a fix, a
 * link scan that finds nothing, a route scan that finds nothing.
 *
 * The last two matter most. A gate whose inputs come back empty passes
 * every route in an empty list, which is the shape this repository has
 * been bitten by more than once.
 *
 * Run: node scripts/tests/entry-points.mutation.mjs
 */
import { readFileSync } from "node:fs";
import { writeFileSync } from "./lib/sidecar-write.mjs";
import { execFileSync } from "node:child_process";

const GATE = "scripts/tests/entry-points.test.mjs";
const NAV = "src/lib/sidebar-nav.ts";
const TARGETS = [GATE, NAV];

const MUTANTS = [
  {
    // 1. THE EXACT DEFECT. /dashboard/routing goes back to having no nav
    // entry, and nothing in the product links to it.
    name: "routing loses its nav entry again",
    file: NAV,
    from: '{ href: "/dashboard/routing", label: "Routing", icon: ROUTING_ICON, hintKey: "routing", ownerOnly: true, hidden: true },',
    to: "",
    expect: "/dashboard/routing has a nav entry",
  },
  {
    // 2. THE SAME, for the other route that had no link anywhere.
    name: "the trading journal loses its nav entry again",
    file: NAV,
    from: '        href: "/dashboard/trading-journal",',
    to: '        href: "/dashboard/trading-journal-gone",',
    expect: "/dashboard/trading-journal has a nav entry",
  },
  {
    // 3. THE LINK SCAN FINDS NOTHING, so "reachable by a link" becomes
    // true of nothing and the gate leans entirely on the nav — the
    // silent-input failure this file is most at risk of.
    name: "the link scan matches nothing",
    file: GATE,
    from: 'for (const m of text.matchAll(/["\'`](\\/dashboard\\/[a-z0-9-]+)(?:[?#][^"\'`]*)?["\'`]/gi)) {',
    to: 'for (const m of text.matchAll(/(?!)/g)) {',
    expect: "links were found in src",
  },
  {
    // 4. THE ROUTE SCAN FINDS NOTHING. Zero routes means zero orphans,
    // and a green run that checked nothing at all.
    name: "the route scan finds no pages",
    file: GATE,
    from: '  if (entries.includes("page.tsx")) out.push(prefix);',
    to: '  if (entries.includes("page.tsx.gone")) out.push(prefix);',
    expect: "the dashboard routes were found",
  },
  {
    // 5. AN EXEMPTION WITH NO ROUTE BEHIND IT — the way a list like this
    // rots: a name is added to silence a failure and nobody can check it.
    name: "an exemption is invented for a route that does not exist",
    file: GATE,
    from: '  "/dashboard/documents/[id]": "a document\'s own page, opened from the documents list",',
    to: '  "/dashboard/documents/[id]": "a document\'s own page, opened from the documents list",\n  "/dashboard/nonexistent": "this reason is long enough to pass the length check",',
    expect: "/dashboard/nonexistent is a real route",
  },
  {
    // 6. THE NAV PARSE SILENTLY DROPS ROWS. The cross-check against the
    // raw href count is what stops a half-working regex reading as a
    // smaller, cleaner config.
    name: "the nav parse drops half the entries",
    file: GATE,
    from: "  .split(/href:\\s*/)\n  .slice(1)",
    to: "  .split(/href:\\s*/)\n  .slice(1)\n  .filter((_, i) => i % 2 === 0)",
    expect: "the parse found every nav entry",
  },
];

function runGate() {
  try {
    execFileSync(process.execPath, [GATE], { encoding: "utf8", stdio: "pipe" });
    return { green: true, failed: [] };
  } catch (e) {
    const out = String(e.stdout ?? "") + String(e.stderr ?? "");
    return {
      green: false,
      failed: [...out.matchAll(/^ {2}FAIL {2}(.+)$/gm)].map((m) => m[1].trim()),
    };
  }
}

console.log("entry-points mutations\n");

const originals = new Map(TARGETS.map((f) => [f, readFileSync(f, "utf8")]));
const restoreAll = () => {
  for (const [file, text] of originals) writeFileSync(file, text);
};

let caught = 0;
const missed = [];
try {
  const base = runGate();
  console.log(`baseline: the gate is ${base.green ? "GREEN" : "RED"} on the unmutated tree`);
  if (!base.green) {
    console.log(`\nBASELINE IS RED — no mutation result below would mean anything.\n  ${base.failed.join("\n  ")}`);
    process.exit(1);
  }

  for (const m of MUTANTS) {
    if (!originals.get(m.file).includes(m.from)) {
      missed.push({ ...m, why: `the mutation target no longer exists in ${m.file}` });
      console.log(`  STALE   ${m.name}`);
      continue;
    }
    writeFileSync(m.file, originals.get(m.file).replace(m.from, m.to));
    let result;
    try {
      result = runGate();
    } finally {
      restoreAll();
    }
    if (result.green) {
      missed.push({ ...m, why: "the gate stayed green — nothing here is load-bearing" });
      console.log(`  MISSED  ${m.name}`);
      continue;
    }
    const onTarget = result.failed.filter((f) => f.includes(m.expect));
    if (onTarget.length === 0) {
      missed.push({
        ...m,
        why: `the gate went red, but on "${result.failed.slice(0, 4).join('", "')}" — nothing matching "${m.expect}"`,
      });
      console.log(`  WRONG   ${m.name}\n          -> red on: ${result.failed.slice(0, 4).join(" | ")}`);
      continue;
    }
    caught++;
    console.log(`  CAUGHT  ${m.name}\n          -> ${onTarget[0]}`);
  }
} finally {
  restoreAll();
}

const after = runGate();
console.log(
  after.green
    ? "\nbaseline: the gate is green again on the restored tree"
    : "\nBASELINE IS RED — a mutation was not restored. Check `git diff`."
);

console.log(`\n${caught} of ${MUTANTS.length} mutations caught.`);
if (missed.length > 0 || !after.green) {
  if (missed.length > 0) {
    console.log("\nHOLES:");
    for (const m of missed) console.log(`  - ${m.name}\n    ${m.why}`);
  }
  process.exit(1);
}
console.log("Every clause in entry-points.test.mjs is load-bearing.");
