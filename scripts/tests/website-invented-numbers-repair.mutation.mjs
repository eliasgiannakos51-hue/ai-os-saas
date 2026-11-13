#!/usr/bin/env node
/*
 * CAN website-invented-numbers-repair.test.mjs SEE A REPAIR THAT IS
 * COMPUTED AND NEVER WRITTEN BACK, A CYCLE CEILING THAT LETS ONE MORE
 * ROUND SLIP THROUGH, A RE-CHECK THAT REUSES STALE RESULTS, A
 * PLACEHOLDER IN THE WRONG LANGUAGE, OR A FAILURE REPORTED AS SUCCESS?
 *
 * Seven mutations, one per load-bearing clause, across the repair module
 * and the two routes that call it:
 *
 *   1. the cycle ceiling goes off-by-one (< becomes <=)                (lib)
 *   2. a repeated invented number is only fixed ONCE, not everywhere   (lib)
 *   3. the re-check after a repair round reuses the STALE suspect list (lib)
 *   4. a repair that did not fully succeed is reported as if it did   (lib)
 *   5. the placeholder ignores the site's own declared language       (lib)
 *   6. the generate route computes the repair and never applies it    (process)
 *   7. the edit route computes the repair and never applies it        (edit)
 *
 * Run: node scripts/tests/website-invented-numbers-repair.mutation.mjs
 */
import { readFileSync } from "node:fs";
import { writeFileSync } from "./lib/sidecar-write.mjs";
import { execFileSync } from "node:child_process";

const GATE = "scripts/tests/website-invented-numbers-repair.test.mjs";
const LIB = "src/lib/website-invented-numbers-repair.ts";
const PROCESS = "src/app/api/websites/generate/process/route.ts";
const EDIT = "src/app/api/websites/edit/route.ts";
const TARGETS = [GATE, LIB, PROCESS, EDIT];

const MUTANTS = [
  {
    name: "the cycle ceiling goes off-by-one — maxCycles=0 still repairs once",
    file: LIB,
    from: "while (suspects.length > 0 && cycles < maxCycles) {",
    to: "while (suspects.length > 0 && cycles <= maxCycles) {",
    expect: "maxCycles=0 repairs nothing",
  },
  {
    name: "a repeated invented number is only fixed in its FIRST occurrence",
    file: LIB,
    from: "current = current.split(suspect.text).join(placeholderFor(suspect.kind, locale));",
    to: "current = current.replace(suspect.text, placeholderFor(suspect.kind, locale));",
    expect: "but every occurrence on the page is gone",
  },
  {
    name: "the re-check after a round reuses the STALE suspect list",
    file: LIB,
    from: "    cycles++;\n    suspects = findInventedNumbers(current, brief);\n  }",
    to: "    cycles++;\n  }",
    expect: "nothing left unrepaired",
  },
  {
    name: "a repair that did not fully succeed is reported as empty `remaining`",
    file: LIB,
    from: "  return { html: current, repairedCount, remaining: suspects };",
    to: "  return { html: current, repairedCount, remaining: [] };",
    expect: "…and still reports what remains",
  },
  {
    name: "the placeholder ignores the site's own declared language",
    file: LIB,
    from: "  return `[${LABELS[kind][locale]}]`;",
    to: "  return `[${LABELS[kind].en}]`;",
    expect: "Greek site gets a Greek placeholder",
  },
  {
    name: "the generate route computes the repair and never writes it back",
    file: PROCESS,
    from: "        const repaired = repairInventedNumbers(documents[i], description);\n        documents[i] = repaired.html;",
    to: "        const repaired = repairInventedNumbers(documents[i], description);",
    expect: "the generate route writes the repaired html back into the document array it persists",
  },
  {
    name: "the edit route computes the repair and never writes it back",
    file: EDIT,
    from: "    const inventedRepair = repairInventedNumbers(updatedHtml, editBrief);\n    updatedHtml = inventedRepair.html;",
    to: "    const inventedRepair = repairInventedNumbers(updatedHtml, editBrief);",
    expect: "the edit route writes the repaired html back into updatedHtml before it is persisted",
  },
];

function runGate() {
  try {
    execFileSync(process.execPath, [GATE], { encoding: "utf8", stdio: "pipe" });
    return { green: true, failed: [] };
  } catch (e) {
    const out = String(e.stdout ?? "") + String(e.stderr ?? "");
    return { green: false, failed: [...out.matchAll(/^ {2}FAIL {2}(.+)$/gm)].map((m) => m[1].trim()) };
  }
}

console.log("website-invented-numbers-repair mutations\n");
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
      missed.push({ ...m, why: `the gate went red, but on "${result.failed.slice(0, 4).join('", "')}" — nothing matching "${m.expect}"` });
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
console.log(after.green ? "\nbaseline: the gate is green again on the restored tree" : "\nBASELINE IS RED — a mutation was not restored. Check `git diff`.");
console.log(`\n${caught} of ${MUTANTS.length} mutations caught.`);
if (missed.length > 0 || !after.green) {
  if (missed.length > 0) {
    console.log("\nHOLES:");
    for (const m of missed) console.log(`  - ${m.name}\n    ${m.why}`);
  }
  process.exit(1);
}
console.log("Every clause in website-invented-numbers-repair.test.mjs is load-bearing.");
