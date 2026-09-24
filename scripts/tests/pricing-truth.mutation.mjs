#!/usr/bin/env node
/*
 * WHAT THE PRICING PAGE PROMISES, AND WHETHER IT EXISTS.
 *
 * Three surfaces make claims about what a plan buys — the plan bullets, the
 * comparison table on /pricing, and the capability grid on signup — and
 * none of them is code. A feature can be deleted, renamed, or never built,
 * and all three keep selling it. That is not a broken build; it is a
 * customer paying for something that is not there.
 *
 * The gate answers it by requiring every claim to name the file and symbol
 * that implements it, and then checking the tree. These mutants attack
 * both halves: a claim with nothing behind it, and an EVIDENCE table that
 * has drifted from the code it points at.
 *
 * Run: node scripts/tests/pricing-truth.mutation.mjs
 */
import { readFileSync } from "node:fs";
import { writeFileSync } from "./lib/sidecar-write.mjs";
import { execFileSync } from "node:child_process";

const GATE = "scripts/tests/pricing-truth.test.mjs";
const PLANS = "src/lib/billing/plans.ts";
const PRICING_PAGE = "src/app/pricing/page.tsx";
const MEMORY = "src/lib/chat/memory.ts";
const CATALOG = "src/lib/billing/feature-catalog.ts";

const MUTANTS = [
  {
    // A NEW PROMISE ON THE PLAN BULLETS. The commonest way this goes
    // wrong: somebody adds a selling point to a plan and nobody builds it.
    name: "a plan advertises a feature nothing implements",
    file: PLANS,
    from: "    features: [",
    to: '    features: [\n      { textKey: "Priority overnight rendering" },',
    expect: "no claim is made without declaring what implements it",
  },
  {
    // The same lie on the comparison table, which is the surface a
    // customer actually reads side by side before paying.
    //
    // RE-ANCHORED 2026-09-13: the table stopped being a list of
    // `labelKey` objects in page.tsx and became rows generated from
    // lib/billing/feature-catalog.ts, so the old anchor no longer
    // existed and this mutation had been testing nothing. The lie now
    // takes the shape of a catalog entry, which is where rows live.
    name: "the comparison table gains a row for a capability that does not exist",
    file: CATALOG,
    from: '  // === DECLARED, NOT BUILT ===========================================',
    to: '  {\n    id: "overnightRendering",\n    group: "make",\n    minPlan: "growth",\n    charges: false,\n    enforcedIn: "src/lib/billing/plans.ts",\n    enforcedSymbol: "PLANS",\n    cell: () => ({ type: "check" }),\n  },\n\n  // === DECLARED, NOT BUILT ===========================================',
    expect: 'every row under MAKE really makes something',
  },
  {
    // ---- the rule the owner stated: a row is a thing that WORKS ------
    //
    // A HELD TIER IS PUBLISHED. The placeholder loses its flag and
    // appears on the page, which is the whole thing `notBuilt` exists to
    // prevent — and the commonest way it would happen is somebody
    // tidying up who reads the flag as clutter.
    // MUTATE THE FILTER, NOT THE ENTRY, and the first draft of this
    // mutant is why. Un-flagging one entry does not test the rule: with
    // `notBuilt` gone the row is no longer HELD, so the clause about
    // held rows cannot fire and a different clause caught it instead —
    // which means that clause was a tautology (soldFeatures() strips
    // notBuilt, so `sold.filter(r => r.notBuilt)` was empty by
    // construction, forever). The real defect is the reader losing the
    // filter, and that is what this mutates.
    name: 'the row reader stops excluding tiers held for unbuilt features',
    file: CATALOG,
    from: 'FEATURE_CATALOG.filter((f) => !f.notSold && !f.notBuilt)',
    to: 'FEATURE_CATALOG.filter((f) => !f.notSold)',
    expect: 'no row on the table is a tier held for something unbuilt',
  },
  {
    // THE FLAG DOES NOT CLEAR ITSELF. A held tier that has grown a real
    // route stays flagged, so a feature customers are using has no price
    // anywhere. Simulated by pointing the held entry at a route that
    // does exist — the state the tree would be in the day somebody
    // shipped it and forgot the row.
    name: 'a held tier grows a real route and stays hidden',
    file: CATALOG,
    from: '    capability: "publicApi",\n    charges: false,',
    to: '    capability: "publicApi",\n    charges: false,\n    routes: ["credits/balance"],',
    expect: 'no held tier has a page or a route behind it already',
  },
  {
    // A ROW UNDER "MAKE" THAT MAKES NOTHING. The heading promises
    // production; the route behind it is a plain list. This is the
    // pricing-page twin of the defect sidebar-naming section 3 exists
    // for.
    name: 'a MAKE row is pointed at a route that reaches no model',
    file: CATALOG,
    from: '    routes: ["posts/generate"],',
    to: '    routes: ["projects"],',
    expect: 'every row under MAKE really makes something',
  },
  {
    // AND THE SCAN ITSELF. If the pattern stops matching, every row
    // under MAKE "makes nothing" — and with the offender list inverted,
    // nothing is ever reported. The positive control is what notices.
    name: 'the producer pattern stops matching anything',
    file: 'scripts/tests/lib/reaches-a-model.mjs',
    from: 'export const AI_CALL =',
    to: 'export const AI_CALL = /(?!)/; const UNUSED =',
    expect: 'the producer scan recognises a real generator',
  },
  {
    // THE OTHER DIRECTION, and the one a green build hides best: the
    // feature is deleted and the claim is not. The evidence entry points
    // at a symbol that is gone.
    // A FULL rename to an UNRELATED name, and both halves of that took a
    // correction. Replacing only the declaration leaves the call site, so
    // the symbol is still in the file; renaming to
    // DEFAULT_MEMORY_LOAD_LIMIT_RENAMED leaves the old name as a prefix of
    // the new one, and the gate searches by substring. The gate was right
    // to stay green both times.
    name: "the symbol a claim points at is renamed away while the claim stays up",
    file: MEMORY,
    from: "DEFAULT_MEMORY_LOAD_LIMIT",
    to: "MEMORY_LOAD_CEILING",
    all: true,
    expect: "every claim's evidence still exists in the codebase",
  },
  {
    // The evidence table naming a file that is not there at all — a
    // rename or a move that nobody followed through into the claims.
    name: "a claim's evidence names a file that has moved",
    file: GATE,
    from: '    file: "src/lib/chat/memory.ts",',
    to: '    file: "src/lib/chat/memory-moved.ts",',
    expect: "every claim's evidence still exists in the codebase",
  },
  {
    // An evidence entry left behind after its claim was withdrawn. Not a
    // customer-facing lie, but it is how the table stops describing the
    // product and starts describing its history.
    name: "an evidence entry outlives the claim it was written for",
    file: GATE,
    from: "const EVIDENCE = {",
    to: 'const EVIDENCE = {\n  "A claim nobody makes any more": { file: "src/lib/chat/memory.ts", symbol: "DEFAULT_MEMORY_LOAD_LIMIT" },',
    expect: "no evidence entry outlives the claim it justified",
  },
  {
    // THE DEFECT THAT WAS SITTING THERE. The page opened its table with
    // "FORTY-THREE ROWS" while the catalog rendered 45 — a count written
    // down once and never re-derived. The whole class is invisible to
    // every other check in this suite, because 43 is a perfectly valid
    // number and the page renders correctly either way.
    name: "the page's stated row count drifts from what it renders",
    file: PRICING_PAGE,
    from: "ROWS: 46",
    to: "ROWS: 43",
    expect: "the page says 43 rows and soldFeatures() returns 45",
  },
  {
    // The same shape on the other half of the sentence. Seven sections is
    // also a claim, and a reader counts neither.
    name: "the page's stated section count drifts from what it renders",
    file: PRICING_PAGE,
    from: "in seven sections",
    to: "in five sections",
    expect: "the page says five sections and the catalog fills 7",
  },
  {
    // THE EASY WAY OUT OF THE TWO ABOVE: delete the claim instead of
    // correcting it, and the comparison has nothing to compare. A count
    // this gate cannot find is not a page that stopped lying, it is a
    // page that stopped saying — so the absence has to fail too, which is
    // the floor rule gate-vacuity asks of every scanned collection.
    //
    // NOT MUTATED HERE: the gate's own comparison line. A suite cannot
    // catch its own disabling — running the mutated gate asks the
    // defective instrument whether it is defective. That job belongs to
    // scripts/tests/mutation-suite-shape.test.mjs, which reads this file
    // and requires every const in it to be used, and to
    // scripts/scan-unjudged-numbers.mjs, which is what would find
    // `pricingSrc` read and never judged if it happened again.
    name: "the page stops stating a row count at all",
    file: PRICING_PAGE,
    from: "ROWS: 46",
    to: "Rows, several of them",
    expect: "the pricing page states its own row count in a form this gate can read",
  },
];

function runGate() {
  try {
    execFileSync(process.execPath, [GATE], { encoding: "utf8", stdio: "pipe" });
    return { green: true, failed: [] };
  } catch (e) {
    const out = String(e.stdout ?? "") + String(e.stderr ?? "");
    const failed = [...out.matchAll(/^ {2}FAIL {2}(.+)$/gm)].map((m) => m[1].trim());
    return { green: false, failed: failed.length ? failed : ["(exited non-zero with no FAIL line)"] };
  }
}

console.log("pricing-truth mutations\n");
const TARGETS = [...new Set(MUTANTS.map((m) => m.file))];
const originals = new Map(TARGETS.map((f) => [f, readFileSync(f, "utf8")]));
const restoreAll = () => { for (const [f, t] of originals) writeFileSync(f, t); };

let caught = 0;
const missed = [];
try {
  const base = runGate();
  console.log(`baseline: the gate is ${base.green ? "GREEN" : "RED"} on the unmutated tree`);
  if (!base.green) {
    console.log(`\nBASELINE IS RED — no result below would mean anything.\n  ${base.failed.join("\n  ")}`);
    process.exit(1);
  }
  for (const m of MUTANTS) {
    const original = originals.get(m.file);
    if (!original.includes(m.from)) {
      missed.push({ ...m, why: `the mutation target no longer exists in ${m.file}` });
      console.log(`  STALE   ${m.name}`);
      continue;
    }
    writeFileSync(m.file, m.all ? original.split(m.from).join(m.to) : original.replace(m.from, m.to));
    let result;
    try { result = runGate(); } finally { restoreAll(); }
    if (result.green) {
      missed.push({ ...m, why: "the gate stayed green — nothing here is load-bearing" });
      console.log(`  MISSED  ${m.name}`);
      continue;
    }
    const onTarget = result.failed.filter((f) => f.includes(m.expect));
    if (onTarget.length === 0) {
      missed.push({ ...m, why: `red on "${result.failed.slice(0, 3).join('", "')}" — nothing matching "${m.expect}"` });
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
console.log(after.green ? "\nbaseline: green again on the restored tree" : "\nBASELINE IS RED — a mutation was not restored.");
console.log(`\n${caught} of ${MUTANTS.length} mutations caught.`);
if (missed.length > 0 || !after.green) {
  if (missed.length) { console.log("\nHOLES:"); for (const m of missed) console.log(`  - ${m.name}\n    ${m.why}`); }
  process.exit(1);
}
console.log("Nothing can be sold that is not in the tree without this going red.");
