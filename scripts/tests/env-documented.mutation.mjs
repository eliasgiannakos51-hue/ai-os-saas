#!/usr/bin/env node
/*
 * CAN env-documented.test.mjs SEE AN UNDOCUMENTED SETTING?
 *
 * The gap it was written for was fifty-nine variables deep and nobody had
 * noticed, because a grep for `process.env.X` finds 51 of the 130 and the
 * other 79 are named as strings inside maps. So the mutations are both
 * halves of the collector going blind, plus the three ways the two lists
 * can drift: a variable dropped from the setup file, a variable left in
 * it after the code stopped reading it, and a key documented twice —
 * which in a .env file means the last one silently wins.
 *
 * Run: node scripts/tests/env-documented.mutation.mjs
 */
import { readFileSync } from "node:fs";
import { writeFileSync } from "./lib/sidecar-write.mjs";
import { execFileSync } from "node:child_process";

const GATE = "scripts/tests/env-documented.test.mjs";
const COLLECTOR = "scripts/lib/env-usage.mjs";
const EXAMPLE = ".env.local.example";
const REGISTRY = "src/lib/env-check.ts";
const TARGETS = [GATE, COLLECTOR, EXAMPLE, REGISTRY];

const MUTANTS = [
  {
    // THE BUG ITSELF: a real setting stops being written down.
    name: "an annual Stripe price ID is dropped from the setup file",
    file: EXAMPLE,
    from: "STRIPE_PRICE_STARTER_ANNUAL=price_...\n",
    to: "",
    expect: "every variable is in .env.local.example",
  },
  {
    name: "a documented variable stops being read by the code",
    file: EXAMPLE,
    from: "IONEXA_DIAG=0",
    to: "IONEXA_DIAG_UNUSED=0",
    expect: "every documented variable is still read",
  },
  {
    name: "a variable is documented twice, so the last one silently wins",
    file: EXAMPLE,
    from: "GROQ_API_KEY=",
    to: "GROQ_API_KEY=\nGROQ_API_KEY=",
    expect: "no variable is documented twice",
  },
  {
    name: "a variable is added with no prose above it",
    file: EXAMPLE,
    from: "IONEXA_DIAG=0",
    to: "IONEXA_DIAG=0\nGROQ_API_KEY=",
    // Two things are wrong with that line and either may be reported
    // first; both are this gate doing its job.
    expect: "",
    expectAny: ["no variable is documented twice", "every variable has prose above it"],
  },

  // ---- the collector going blind, one form at a time ----------------
  {
    name: "the direct process.env.X reader stops matching",
    file: COLLECTOR,
    from: 'for (const m of source.matchAll(/process\\.env\\.([A-Z0-9_]+)/g)) note(m[1], file);',
    to: 'for (const m of source.matchAll(/process\\.envXX\\.([A-Z0-9_]+)/g)) note(m[1], file);',
    expect: "a directly-named variable is found (STRIPE_PRICE_STARTER)",
  },
  {
    name: "the string-inside-a-map reader stops matching",
    file: COLLECTOR,
    from: 'for (const m of source.matchAll(/(?::\\s*|\\[\\s*|,\\s*)"([A-Z][A-Z0-9_]*)"/g)) {',
    to: 'for (const m of source.matchAll(/(?::\\s*|\\[\\s*|,\\s*)"([a-z][a-z0-9_]*)"/g)) {',
    expect: "an indirectly-named variable is found",
  },
  {
    name: "the lone-constant reader stops matching",
    file: COLLECTOR,
    from: 'for (const m of source.matchAll(/\\w*(?:ENV_VAR|ENV_VARS|Env)\\w*\\s*(?::[^=\\n]*)?=\\s*"([A-Z][A-Z0-9_]*)"/g)) {',
    to: 'for (const m of source.matchAll(/\\w*(?:ENV_VARXX)\\w*\\s*(?::[^=\\n]*)?=\\s*"([A-Z][A-Z0-9_]*)"/g)) {',
    expect: "a lone ENV_VAR constant is found",
  },
  {
    name: "the file walk reads nothing",
    file: COLLECTOR,
    from: "      else if (/\\.tsx?$/.test(entry.name)) out.push(full);",
    to: "      else if (false) out.push(full);",
    expect: "the scan found the variables",
  },

  // ---- the registry's own contract ----------------------------------
  {
    name: "a recommended setting stops saying what happens without it",
    file: REGISTRY,
    from: '    what: "Checkout and subscriptions",\n    fallback:',
    to: '    what: "Checkout and subscriptions",\n    unusedFallback:',
    expect: "every non-required registry entry names its fallback",
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

console.log("env-documented mutations\n");

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
    const wanted = m.expectAny ?? [m.expect];
    const onTarget = result.failed.filter((f) => wanted.some((w) => f.includes(w)));
    if (onTarget.length === 0) {
      missed.push({
        ...m,
        why: `red on "${result.failed.slice(0, 4).join('", "')}" — nothing matching ${JSON.stringify(wanted)}`,
      });
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
