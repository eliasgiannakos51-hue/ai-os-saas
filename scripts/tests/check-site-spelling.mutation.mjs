#!/usr/bin/env node
/*
 * IS check-site-spelling.test.mjs LOAD-BEARING?
 *
 * That gate says the runner reads the prompt, the model and the word list
 * out of the shipped files instead of carrying copies. This asks the
 * question one level up: if the runner started carrying a copy, would the
 * gate go red — or would it report forty-eight greens for a runner that
 * had quietly stopped reporting on the product?
 *
 * The last mutation is the one to read. It removes `const MODEL` from the
 * checker, which is the line this round ADDED — until 2026-09-07 the call
 * named no model and complete.ts served it sonnet at three times haiku's
 * price, and nothing anywhere said so. A finding whose fix is not held by
 * a gate is a finding that comes back.
 *
 * Run: node scripts/tests/check-site-spelling.mutation.mjs
 */
import { readFileSync } from "node:fs";
import { writeFileSync } from "./lib/sidecar-write.mjs";
import { execFileSync } from "node:child_process";

const GATE = "scripts/tests/check-site-spelling.test.mjs";
const RUNNER = "scripts/check-site-spelling.mjs";
const CHECKER = "src/lib/websites-greek-spelling-check.ts";
const TARGETS = [GATE, RUNNER, CHECKER];

const MUTANTS = [
  {
    // 1. THE PROMPT BECOMES A COPY. The single most common way a runner
    // like this rots: it agrees with production on the day it is written
    // and reports on a different instruction ever after.
    name: "the runner carries its own copy of the system prompt",
    file: RUNNER,
    from: '  const lines = JSON.parse(`[${m[1].replace(/,\\s*$/, "")}]`);',
    to: '  const lines = ["You are given a list of Greek words taken from a web page."];',
    expect: "editing the shipped prompt changes what the runner would send",
  },
  {
    // 2. THE MODEL BECOMES A COPY. Worse than the prompt, because the
    // report prints a price per MTok beside it and the price would be
    // right for a model nobody is being served.
    name: "the runner hardcodes the model instead of reading it",
    file: RUNNER,
    from: '  const model = catalog.catalogModel(m[1]);',
    to: '  const model = catalog.catalogModel("claude-sonnet-4-6");',
    expect: "changing the model in the file changes what the runner reports",
  },
  {
    // 3. THE REFUSAL BECOMES A FALLBACK. A runner that silently reports on
    // complete.ts's default tier is exactly the state this round found and
    // fixed; if it can slide back without a red gate, it will.
    name: "a missing model line falls back instead of refusing",
    file: RUNNER,
    from: '  const m = src.match(/const MODEL = "([^"]+)";/);',
    to: '  const m = src.match(/const MODEL = "([^"]+)";/) ?? [null, unnamedDefaultModel(catalog).id];',
    expect: "removing the line is a refusal that names the tier fallback",
  },
  {
    // 4. THE STEM RULE STOPS BEING REPORTED. The owner asked "are the
    // inflected forms protected?" and the answer is a list. A report that
    // files Χαλανδρίου under "beyond the cap" answers the question wrong
    // while every number still adds up.
    name: "the audit stops attributing the own-name stem rule",
    file: RUNNER,
    from: "    else if (pure.isOwnName(w, stems)) held.ownName.push(w);",
    to: "",
    expect: "an inflection is filed under the stem rule",
  },
  {
    // 5. THE CEILING STOPS STOPPING ANYTHING. The owner set a $3 limit;
    // a ceiling checked after the send is not a ceiling.
    name: "the spending ceiling no longer refuses",
    file: RUNNER,
    from: "  if (worst > maxCost) {",
    to: "  if (false) {",
    expect: "a worst case over the ceiling is refused with nothing sent",
  },
  {
    // 6. THE BRIEF BECOMES OPTIONAL. Without it nothing protects the
    // owner's own words, and the first thing the runner would print is
    // their own surname under "possibly misspelled".
    name: "the brief stops being a required input",
    file: RUNNER,
    from: '  need(args.has("brief") || args.has("brief-file"), \'--brief "<the brief the site was generated from>"\');',
    to: "",
    expect: "and names the brief",
  },
  {
    // 7. THE RUNNER ASKS FOR MORE TOKENS THAN THE PRODUCT DOES. Then the
    // cost it reports is not the cost the product pays, which is the whole
    // question the owner asked.
    name: "the runner raises the token ceiling above the shipped one",
    file: RUNNER,
    from: "    max_tokens: 300,",
    to: "    max_tokens: 1000,",
    expect: "max_tokens matches the shipped 300",
  },
  {
    // 8. THE FINDING COMES BACK. `const MODEL` goes, the call falls back to
    // complete.ts's "mid" tier, and the checker is served sonnet again
    // with nothing saying so.
    name: "the checker goes back to naming no model",
    file: CHECKER,
    from: 'const MODEL = "claude-sonnet-4-6";',
    to: "",
    expect: "the checker names its model",
  },
];

function runGate() {
  try {
    execFileSync(process.execPath, [GATE], { encoding: "utf8", stdio: "pipe", timeout: 600_000 });
    return { green: true, failed: [] };
  } catch (e) {
    const out = String(e.stdout ?? "") + String(e.stderr ?? "");
    return { green: false, failed: [...out.matchAll(/^ {2}FAIL {2}(.+)$/gm)].map((m) => m[1].trim()) };
  }
}

console.log("check-site-spelling mutations\n");

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
