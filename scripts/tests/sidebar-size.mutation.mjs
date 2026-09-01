#!/usr/bin/env node
/*
 * CAN sidebar-size.test.mjs SEE THE SIDEBAR GROWING BACK?
 *
 * The gate exists because a sidebar is where every new feature wants one
 * more link. Each addition is individually reasonable; forty-five is what
 * a year of individually-reasonable adds up to. A limit nobody can breach
 * accidentally is worth nothing if the check that enforces it cannot go
 * red, so every clause of it is broken here on purpose.
 *
 * SIX MUTATIONS, SIX DIFFERENT DIMENSIONS — not six ways of nudging the
 * same number, which is how a suite reports full coverage of one clause
 * and none of the rest:
 *
 *   1. the group limit          — a fifth group appears
 *   2. the `hidden` filter      — it stops being applied, so all 46 draw
 *   3. the role filter          — owner-only rows reach everybody
 *   4. the instrument           — the gate's own item parse stops matching
 *   5. the loss guard           — a destination is deleted rather than hidden
 *   6. the hub wiring           — the hub starts listing only what the
 *                                 sidebar already shows
 *
 * Run: node scripts/tests/sidebar-size.mutation.mjs
 */
import { readFileSync } from "node:fs";
import { writeFileSync } from "./lib/sidecar-write.mjs";
import { execFileSync } from "node:child_process";

const GATE = "scripts/tests/sidebar-size.test.mjs";
const NAV = "src/lib/sidebar-nav.ts";
const VIS = "src/lib/sidebar-visibility.ts";
const HUB = "src/app/dashboard/records/page.tsx";
const TARGETS = [GATE, NAV, VIS, HUB];

const MUTANTS = [
  {
    // 1. GROUP COUNT. The whole point of the brief: three or four groups,
    // not eight. A fifth is added the way a real one would be.
    name: "a fifth group is added to the sidebar",
    file: NAV,
    from: "];\n\nexport const SETTINGS_GROUP",
    to:
      '  {\n    heading: "Extra",\n    collapsible: true,\n    items: [\n' +
      '      { href: "/help", label: "Help Centre", icon: HELP_ICON, hintKey: "help" },\n' +
      "    ],\n  },\n];\n\nexport const SETTINGS_GROUP",
    expect: "groups, limit 4",
  },
  {
    // 2. THE `hidden` FILTER. Without it every one of the forty-six
    // entries is drawn again and the sidebar is back to being a directory
    // — the exact state V4.6 #3 was written to end.
    name: "sidebarGroups stops dropping hidden rows",
    file: VIS,
    from: ".map((group) => ({ ...group, items: group.items.filter((i) => !i.hidden) }))",
    to: ".map((group) => ({ ...group, items: group.items }))",
    expect: "rows drawn, limit 20",
  },
  {
    // 3. THE ROLE FILTER — the one the brief said not to break. Composing
    // visibleGroups is what keeps owner-only pages owner-only; a
    // sidebarGroups that forgot it would put the Financial Dashboard in
    // every user's nav, and every one of them would get a 404 from it.
    name: "sidebarGroups stops applying the owner filter",
    file: VIS,
    from: "  return visibleGroups(groups, isOwner)\n",
    to: "  return groups\n",
    expect: "nobody else does, in the sidebar",
  },
  {
    // 4. THE INSTRUMENT ITSELF. If the gate's parse stops seeing items,
    // every limit below it is measured against a smaller sidebar than the
    // one that ships — and passes. The independent href count is what
    // makes that loud instead of silent.
    name: "the gate's own item parse stops matching",
    file: GATE,
    from: "const chunks = body.split(/href:\\s*/).slice(1);",
    to: "const chunks = body.split(/hrefXX:\\s*/).slice(1);",
    expect: "the parse found every item",
  },
  {
    // 5. THE LOSS GUARD. Consolidating a nav is one keystroke from
    // deleting entries instead of grouping them — and because the command
    // palette is built from this same list, a deleted entry is not just
    // undrawn, it is unfindable.
    name: "a destination is deleted rather than hidden",
    file: NAV,
    from: '      { href: "/dashboard/marketplace", label: "Marketplace", icon: MARKETPLACE_ICON, hintKey: "marketplace", hidden: true },\n',
    to: "",
    expect: "destinations survived the consolidation",
  },
  {
    // 6. THE HUB WIRING. The hub is the reason hiding twenty-nine rows is
    // not the same as losing them. Built from sidebarGroups instead of
    // visibleGroups it would list exactly the rows the sidebar already
    // draws — a page whose entire purpose is the ones it does not.
    name: "the hub page lists only what the sidebar already shows",
    file: HUB,
    from: "  const groups: DirectoryGroup[] = visibleGroups(",
    to: "  const groups: DirectoryGroup[] = sidebarGroups(",
    expect: "built from visibleGroups",
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

console.log("sidebar-size mutations\n");

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
console.log("Every limit in sidebar-size.test.mjs is load-bearing.");
