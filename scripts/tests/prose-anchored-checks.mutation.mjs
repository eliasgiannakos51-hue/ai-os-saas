#!/usr/bin/env node
/*
 * CAN prose-anchored-checks.test.mjs SEE A CHECK COME BACK?
 *
 * The gate holds one number at one: the count of code-shaped checks in
 * scripts/tests whose regex matches its target only inside a comment.
 * Six were found on 2026-09-19, five re-anchored on code and one kept
 * deliberately, labelled as documentation in its own name.
 *
 * Two of the five are put back here, verbatim, as the defects they were:
 * agent-depth's /NOT FATAL…logApiError/ and user-photos' "fails open".
 * Both were green on the day they were wrong.
 *
 * And the other direction, which matters more for a counting gate: a
 * scan that finds NOTHING passes a baseline of one by finding one fewer
 * than one. Three mutants empty the scan in three different places and
 * require the gate to notice that too.
 *
 * Run: node scripts/tests/prose-anchored-checks.mutation.mjs
 */
import { readFileSync } from "node:fs";
import { writeFileSync } from "./lib/sidecar-write.mjs";
import { execFileSync } from "node:child_process";

const GATE = "scripts/tests/prose-anchored-checks.test.mjs";
const SCAN = "scripts/scan-self-confirming-gates.mjs";
const AGENT_DEPTH = "scripts/tests/agent-depth.test.mjs";
const USER_PHOTOS = "scripts/tests/user-photos.test.mjs";

const TARGETS = [GATE, SCAN, AGENT_DEPTH, USER_PHOTOS];

const MUTANTS = [
  // ---- the two defects, put back -------------------------------------
  {
    // THE ONE THAT COST THE MOST. "a fill failure still creates the
    // agent" was satisfied by the words NOT FATAL in the catch, and a
    // `throw err;` under them kept it green.
    name: "agent-depth anchors on NOT FATAL again",
    file: AGENT_DEPTH,
    from: '  ok("a fill failure is recorded even though it is swallowed",',
    to:
      '  ok("a fill failure still creates the agent (prose)",\n' +
      "    /NOT FATAL[\\s\\S]{0,300}logApiError/.test(adoptSrc));\n" +
      '  ok("a fill failure is recorded even though it is swallowed",',
    expect: "agent-depth.test.mjs -> src/app/api/agents/templates/adopt/route.ts",
  },
  {
    name: "user-photos anchors on the words 'fails open' again",
    file: USER_PHOTOS,
    from: '  ok("the usage lookup is wrapped in a catch at all", usageCatch !== null);',
    to:
      '  ok("the usage lookup is wrapped in a catch at all", usageCatch !== null);\n' +
      '  ok("...and fails open (prose)", /catch \\{\\s*\\n\\s*\\/\\* fails open/.test(workspace));',
    expect: "user-photos.test.mjs -> src/components/website-builder/website-builder-workspace.tsx",
  },

  // ---- the scan emptied, three ways ----------------------------------
  {
    // THE FAILURE MODE OF EVERY COUNTING GATE. db-migrations.test.mjs had
    // three scrapers that could be replaced with empty collections while
    // the output stayed byte-identical. A scan returning nothing must not
    // read as "nothing is wrong".
    name: "the scan returns no pairs at all",
    file: SCAN,
    from: "export function proseAnchoredPairs() {",
    to: "export function proseAnchoredPairs() {\n  return [];",
    expect: "the scan still finds pairs at all",
  },
  {
    name: "no file variable resolves, so no pair is ever built",
    file: SCAN,
    from: "  const vars = new Map([...seen].filter(([, t]) => t !== null));",
    to: "  const vars = new Map();",
    expect: "the scan still finds pairs at all",
  },
  {
    // The subtler empty: pairs are built, none is ever prose-only,
    // so the allowed entry goes missing and the list is stale.
    name: "comments stop being stripped from the target, so nothing looks prose-only",
    file: SCAN,
    from: "    if (!re.test(raw) || re.test(stripComments(raw))) {",
    to: "    if (!re.test(raw) || re.test(raw)) {",
    expect: "still allowed: context-optimization.test.mjs",
  },
  {
    // And the gate's own list, emptied. With ALLOWED at [], the one
    // deliberate documentation check becomes an unexplained finding.
    name: "the allow-list is emptied, so the documented exception is unexplained",
    file: GATE,
    from: "const ALLOWED = [\n  {",
    to: "const ALLOWED = [];\nconst UNUSED = [\n  {",
    expect: "context-optimization.test.mjs -> src/lib/ai/module-relevance.ts",
  },
];

function runGate() {
  try {
    execFileSync(process.execPath, [GATE], { encoding: "utf8", stdio: "pipe" });
    return { green: true, failed: [] };
  } catch (e) {
    const out = String(e.stdout ?? "") + String(e.stderr ?? "");
    return { green: false, failed: [...out.matchAll(/^ {2}- (.+)$/gm)].map((m) => m[1]) };
  }
}

console.log("prose-anchored-checks mutations\n");

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
    const mutated = originals.get(m.file).replace(m.from, m.to);
    if (mutated === originals.get(m.file)) {
      missed.push({ ...m, why: "the mutation left the file byte-identical" });
      console.log(`  NO-OP   ${m.name}`);
      continue;
    }
    writeFileSync(m.file, mutated);
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
        why: `the gate went red, but on "${result.failed.join('", "')}" — nothing matching "${m.expect}"`,
      });
      console.log(`  WRONG   ${m.name}\n          -> red on: ${result.failed.join(" | ")}`);
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
console.log("Every clause of the gate is load-bearing.");
