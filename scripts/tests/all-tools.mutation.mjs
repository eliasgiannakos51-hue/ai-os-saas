#!/usr/bin/env node
/*
 * CAN all-tools.test.mjs SEE ALL TOOLS DRIFT FROM THE DESIGN?
 *
 * The search losing its synonyms, the alias table losing one, a beta tag
 * on a tool that is not beta and none on one that is, a name cut with an
 * ellipsis, the description gone from hover and from screen readers, and
 * a layout that no longer fits one screen.
 *
 * Run: node scripts/tests/all-tools.mutation.mjs
 */
import { readFileSync } from "node:fs";
import { writeFileSync } from "./lib/sidecar-write.mjs";
import { execFileSync } from "node:child_process";

const GATE = "scripts/tests/all-tools.test.mjs";
const GRID = "src/components/tools/tools-grid.tsx";
const STATUS = "src/lib/nav/tool-status.ts";
const ALIASES = "src/lib/palette-aliases.ts";
const TARGETS = [GATE, GRID, STATUS, ALIASES];

const MUTANTS = [
  {
    name: "the search stops knowing synonyms",
    file: GRID,
    from: '            candidates: [label(item), item.label, ...aliasesFor(ITEM_LABEL_KEYS[item.label] ?? "", locale), hint(item)],',
    to: "            candidates: [label(item), item.label, hint(item)],",
    expect: "the grid builds its candidates the way the palette does",
  },
  {
    name: "the alias table forgets slides",
    file: ALIASES,
    from: '    en: ["presentations", "slides", "deck", "powerpoint"],',
    to: '    en: ["presentations", "deck", "powerpoint"],',
    // Red on the GREEK check, not the English one, and rightly: the
    // English description of Presentations has the word "slides" in it,
    // and the description is a candidate. In Greek only the alias reaches.
    expect: "where the English synonyms still count",
  },
  {
    name: "a tool that is not beta is tagged",
    file: STATUS,
    from: '  "/dashboard/website-builder",',
    to: '  "/dashboard/website-builder",\n  "/dashboard/documents",',
    expect: "no tool carries it that TOOLS-STATUS does not call beta",
  },
  {
    name: "a beta tool loses its tag",
    file: STATUS,
    from: '  "/dashboard/coding",\n',
    to: "",
    expect: "every beta tool in TOOLS-STATUS carries the tag",
  },
  {
    name: "a long name is cut with an ellipsis",
    file: GRID,
    from: '<span className="min-w-0 break-words">{label(item)}</span>',
    to: '<span className="min-w-0 truncate">{label(item)}</span>',
    expect: "no name is cut with an ellipsis",
  },
  {
    name: "the description leaves the hover",
    file: GRID,
    from: '        <Tooltip content={description} side="top">',
    to: '        <Tooltip content={label(item)} side="top">',
    expect: "the description is in a tooltip",
  },
  {
    name: "a screen reader no longer hears the description",
    file: GRID,
    from: '            {description && <span className="sr-only">{description}</span>}',
    to: "",
    expect: "read to a screen reader",
  },
  {
    name: "the grid narrows to three columns and runs off the screen",
    file: GRID,
    from: "lg:grid-cols-4 xl:grid-cols-5",
    to: "lg:grid-cols-3 xl:grid-cols-3",
    expect: "everything fits on a 1440×900 screen",
  },
];

function runGate() {
  try {
    execFileSync(process.execPath, [GATE], { encoding: "utf8", stdio: "pipe", timeout: 60_000 });
    return { green: true, failed: [] };
  } catch (e) {
    const out = String(e.stdout ?? "") + String(e.stderr ?? "");
    return {
      green: false,
      failed: [...out.matchAll(/^ {2}FAIL {2}(.+)$/gm)].map((m) => m[1].trim()),
    };
  }
}

console.log("all-tools mutations\n");

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
    console.log(`\nBASELINE IS RED.\n  ${base.failed.join("\n  ")}`);
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
      missed.push({ ...m, why: `red on "${result.failed.slice(0, 4).join('", "')}" — nothing matching "${m.expect}"` });
      console.log(`  WRONG   ${m.name}\n          -> red on: ${result.failed.slice(0, 3).join(" | ")}`);
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
    : "\nBASELINE IS RED — a mutation was not restored. Check `git status`.",
);
console.log(`\n${caught} of ${MUTANTS.length} mutations caught.`);
if (missed.length > 0 || !after.green) {
  if (missed.length > 0) {
    console.log("\nHOLES:");
    for (const m of missed) console.log(`  - ${m.name}\n    ${m.why}`);
  }
  process.exit(1);
}
console.log("Every clause of the gate is load-bearing.");
