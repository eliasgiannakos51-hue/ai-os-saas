#!/usr/bin/env node
/*
 * CAN THE COLLAPSE GATE SEE THE SIDEBAR GO BACK TO THIRTY-TWO LINES?
 *
 * Every way this regresses is quiet. Nothing throws, nothing looks
 * broken, and the only symptom is a nav that is longer than the screen —
 * which is what it was before, so nobody calls it a bug.
 *
 *   - the state starts with everything open again
 *   - it is written to localStorage, so yesterday decides today
 *   - navigating shuts what the user opened
 *   - a shut group's rows stay in the tab order
 *   - a held position starts being drawn, or searchable, and its route
 *     404s
 *
 * DIFFERENT DIMENSIONS, ON PURPOSE, and the suite fails if any is left
 * with one mutant.
 *
 * Run: node scripts/tests/sidebar-collapse.mutation.mjs
 */
import { readFileSync } from "node:fs";
// The sidecar helper, not node:fs: a run killed mid-mutation has no
// finally, and the sidecar is what heals the tree on the next run.
import { writeFileSync } from "./lib/sidecar-write.mjs";
import { execFileSync } from "node:child_process";

const GATE = "scripts/tests/sidebar-collapse.test.mjs";
const RULES = "src/lib/sidebar-visibility.ts";
const COMPONENT = "src/components/dashboard/sidebar.tsx";
const NAV = "src/lib/sidebar-nav.ts";
const TARGETS = [RULES, COMPONENT, NAV, GATE];

const MUTANTS = [
  // ---- A. WHAT IS OPEN ON A LOAD ------------------------------------
  {
    dimension: "A. what a load opens",
    name: "every group opens on every load, which is the nav this replaced",
    file: RULES,
    from: "  const active = headingContaining(groups, pathname);\n  return new Set(active ? [active] : []);",
    to: "  return new Set(groups.filter((g) => g.collapsible).map((g) => g.heading));",
    expect: "every route opens its own group and no other",
  },
  {
    dimension: "A. what a load opens",
    name: "a load opens the current group AND the first one, so two are open",
    file: RULES,
    from: "  const active = headingContaining(groups, pathname);\n  return new Set(active ? [active] : []);",
    to: "  const active = headingContaining(groups, pathname);\n  const first = groups.find((g) => g.collapsible)?.heading;\n  return new Set([active, first].filter((h) => typeof h === \"string\"));",
    expect: "no load opens more than one group",
  },
  {
    dimension: "A. what a load opens",
    name: "the current page's group is NOT the one opened — a prefix match instead",
    file: RULES,
    from: '  if (href === "/dashboard") return pathname === "/dashboard";\n  if (!pathname) return false;\n  return pathname === href || pathname.startsWith(`${href}/`);',
    to: '  if (href === "/dashboard") return pathname === "/dashboard";\n  if (!pathname) return false;\n  return pathname.startsWith(href);',
    expect: "every route opens its own group and no other",
  },

  // ---- B. NAVIGATION IS ADDITIVE ------------------------------------
  {
    dimension: "B. navigation is additive",
    name: "navigating shuts everything else — an accordion again",
    file: RULES,
    from: "  const active = headingContaining(groups, pathname);\n  if (!active || current.has(active)) return current;\n  return new Set([...current, active]);",
    to: "  const active = headingContaining(groups, pathname);\n  if (!active) return current;\n  return new Set([active]);",
    expect: "the group the user opened by hand is still open after navigating",
  },
  {
    dimension: "B. navigation is additive",
    name: "a fresh Set every time, so every path change re-renders the whole nav",
    file: RULES,
    from: "  if (!active || current.has(active)) return current;\n  return new Set([...current, active]);",
    to: "  if (!active) return new Set([...current]);\n  return new Set([...current, active]);",
    expect: "navigating into an already-open group returns the same Set object",
  },

  // ---- C. NOTHING IS REMEMBERED -------------------------------------
  {
    dimension: "C. nothing is remembered",
    name: "the open groups are written to localStorage, so yesterday decides today",
    file: COMPONENT,
    from: "      if (next.has(group.heading)) next.delete(group.heading);\n      else next.add(group.heading);\n      return next;",
    to: '      if (next.has(group.heading)) next.delete(group.heading);\n      else next.add(group.heading);\n      window.localStorage.setItem("ionexa:sidebar-open", JSON.stringify([...next]));\n      return next;',
    expect: "the sidebar does not touch localStorage",
  },
  {
    dimension: "C. nothing is remembered",
    name: "the component stops using the rule and rolls its own initial state",
    file: COMPONENT,
    from: "  const [expanded, setExpanded] = useState<Set<string>>(() =>\n    initialExpandedGroups(ALL_SIDEBAR_GROUPS, pathname)\n  );",
    to: "  const [expanded, setExpanded] = useState<Set<string>>(() => new Set<string>());",
    expect: "the component calls initialExpandedGroups",
  },

  // ---- D. THE HEADING IS A REAL CONTROL -----------------------------
  {
    dimension: "D. the heading is a control",
    name: "the heading stops declaring whether it is open",
    file: COMPONENT,
    from: "            aria-expanded={isOpen}",
    to: "            aria-expanded={true}",
    expect: "the heading declares aria-expanded",
  },
  {
    dimension: "D. the heading is a control",
    name: "a shut group's rows stay in the tab order",
    file: COMPONENT,
    from: "                    tabIndex={reachable ? undefined : -1}",
    to: "                    tabIndex={undefined}",
    expect: "a shut group's rows are out of the tab order",
  },
  {
    dimension: "D. the heading is a control",
    name: "the heading drops below the 44px touch target",
    file: COMPONENT,
    from: '            className="flex min-h-[44px] w-full items-center justify-between rounded-lg px-3 pb-1.5',
    to: '            className="flex w-full items-center justify-between rounded-lg px-3 pb-1.5',
    expect: "the heading is at least 44px tall",
  },

  // ---- E. THE HELD POSITIONS ----------------------------------------
  {
    dimension: "E. the held positions",
    name: "the not-built filter is dropped, so six dead links are drawn",
    file: RULES,
    from: "  const real = groups\n    .map((group) => ({ ...group, items: group.items.filter((i) => !i.notBuilt) }))\n    .filter((group) => group.items.length > 0);",
    to: "  const real = groups;",
    expect: "nothing notBuilt is drawn",
  },
  {
    dimension: "E. the held positions",
    name: "the owner short-circuit is put back first, so the owner searches dead links",
    file: RULES,
    from: "  const real = groups\n    .map((group) => ({ ...group, items: group.items.filter((i) => !i.notBuilt) }))\n    .filter((group) => group.items.length > 0);\n  if (isOwner) return real;",
    to: "  if (isOwner) return groups;\n  const real = groups\n    .map((group) => ({ ...group, items: group.items.filter((i) => !i.notBuilt) }))\n    .filter((group) => group.items.length > 0);",
    expect: "the owner's palette has no not-built rows either",
  },
  {
    dimension: "E. the held positions",
    name: "a held position is moved above the rows that work",
    file: NAV,
    from: '      { href: "/dashboard/website-builder", label: "Website Builder", icon: WEBSITE_BUILDER_ICON, hintKey: "websiteBuilder" },',
    to: '      { href: "/dashboard/music", label: "Music", icon: MUSIC_ICON, notBuilt: true },\n      { href: "/dashboard/website-builder", label: "Website Builder", icon: WEBSITE_BUILDER_ICON, hintKey: "websiteBuilder" },',
    expect: "every held position sits after the rows that work",
  },

  // ---- F. THE GATE'S OWN PARSER -------------------------------------
  {
    dimension: "F. the gate's own parser",
    name: "the group parser stops finding groups",
    file: GATE,
    from: '  const headingRe = /heading:\\s*"([^"]+)",\\s*\\n\\s*collapsible:\\s*(true|false)/g;',
    to: "  const headingRe = /(?!)/g;",
    expect: "the parser found groups",
  },
  {
    dimension: "F. the gate's own parser",
    name: "the item parser stops finding rows",
    file: GATE,
    from: '    const items = [...body.matchAll(/\\{\\s*href:\\s*"([^"]+)"([^}]*)\\}/g)].map((im) => ({',
    to: "    const items = [...body.matchAll(/(?!)/g)].map((im) => ({",
    expect: "the parser found rows",
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

console.log("sidebar-collapse mutations\n");
const originals = new Map(TARGETS.map((f) => [f, readFileSync(f, "utf8")]));
const restoreAll = () => {
  for (const [file, text] of originals) writeFileSync(file, text);
};

let caught = 0;
const missed = [];
const byDimension = new Map();
try {
  const base = runGate();
  console.log(`baseline: ${base.green ? "GREEN" : "RED"}`);
  if (!base.green) {
    console.log(`\nBASELINE IS RED.\n  ${base.failed.join("\n  ")}`);
    process.exit(1);
  }

  for (const m of MUTANTS) {
    byDimension.set(m.dimension, (byDimension.get(m.dimension) ?? 0) + 1);
    const before = originals.get(m.file);
    if (!before.includes(m.from)) {
      missed.push({ ...m, why: `the mutation target no longer exists in ${m.file}` });
      console.log(`  MISSED  ${m.name}`);
      continue;
    }
    writeFileSync(m.file, before.replace(m.from, m.to));
    const result = runGate();
    restoreAll();
    const named = result.failed.find((f) => f.includes(m.expect));
    if (named) {
      caught++;
      console.log(`  CAUGHT  ${m.name}\n          -> ${named}`);
    } else {
      missed.push({
        ...m,
        why: result.green
          ? "the gate stayed green"
          : `red, but not on "${m.expect}" — on: ${result.failed.slice(0, 3).join(" | ")}`,
      });
      console.log(`  MISSED  ${m.name}`);
    }
  }
} finally {
  restoreAll();
}

console.log("\ndimensions probed:");
const thin = [];
for (const [dimension, count] of [...byDimension].sort()) {
  console.log(`  ${count} x ${dimension}`);
  if (count < 2) thin.push(dimension);
}
if (thin.length > 0) console.log(`\nTHIN DIMENSIONS (one mutant each): ${thin.join(", ")}`);

console.log(`\n${caught} of ${MUTANTS.length} mutations caught.`);
if (missed.length > 0) {
  console.log("\nHOLES:");
  for (const m of missed) console.log(`  - ${m.name}\n    ${m.why}`);
}
if (missed.length > 0 || thin.length > 0) process.exit(1);
console.log(`Every clause holds, across ${byDimension.size} dimensions.`);
