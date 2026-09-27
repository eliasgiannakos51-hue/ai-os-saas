#!/usr/bin/env node
/*
 * IS THE SHAPE CHECK LOAD-BEARING, OR A DESCRIPTION OF ONE?
 *
 * Run: node scripts/tests/env-shape.mutation.mjs
 *
 * The thing it is supposed to stop is a build that dies with
 * `TypeError: Invalid URL` and names neither the variable nor the file.
 * The thing it must never do is refuse a value that would have worked —
 * an absent variable is a different, handled condition, and turning
 * that into a build failure would be a new way to break the deploy
 * rather than a way to explain one.
 *
 * SIX MUTANTS, THREE FOR EACH DIRECTION. Three loosen the validator
 * until it accepts what it exists to refuse; three tighten or displace
 * it until it refuses what it must accept, or measures nothing.
 */
import { readFileSync } from "node:fs";
import { writeFileSync } from "./lib/sidecar-write.mjs";
import { execFileSync } from "node:child_process";

const GATE = "scripts/tests/env-shape.test.mjs";
const RULES = "scripts/lib/env-shape-rules.mjs";
const CONFIG = "next.config.mjs";

const MUTANTS = [
  {
    // THE DEFECT: a URL that is not a URL sails through, and the build
    // dies later with an anonymous TypeError. This is the exact failure
    // the rule file's header records from build:ci's first run.
    name: "a value that is not a URL is accepted",
    file: RULES,
    from: '        return "is not a URL — new URL() refuses it";',
    to: "        return null;",
    expect: "is refused",
  },
  {
    name: "a number-shaped name accepts anything",
    file: RULES,
    from: '      return Number.isFinite(Number(v)) ? null : "is not a number";',
    to: "      return null;",
    expect: "is refused",
  },
  {
    // THE OTHER HALF OF SAFETY, and the one that would do real damage:
    // an unset variable becomes a build failure. Half this product
    // degrades deliberately without a key, api/health reports the
    // absences, and the price-without-key gate is about exactly that
    // state.
    name: "an absent variable counts as malformed",
    file: RULES,
    from: '  if (value === undefined || value === null || String(value).trim() === "") return null;',
    to: "  if (false) return null;",
    expect: "is not a finding",
  },
  {
    // A VALIDATOR THAT REFUSES EVERYTHING passes every "is refused"
    // check in the gate. The accept half is what catches it.
    name: "an opaque key is refused for having no shape",
    file: RULES,
    from: '    default:\n      // key32 is NOT checked here.',
    to: '    default:\n      return "has no shape this file recognises";\n      // key32 is NOT checked here.',
    expect: "an opaque name is never refused",
  },
  {
    // THE BUILD STOPS ASKING. The rules can be perfect and the build
    // still die anonymously.
    name: "the build config no longer refuses anything",
    file: CONFIG,
    // DELETED, NOT COMMENTED OUT. The first version of this mutant was
    // `refuseMalformedEnv();` -> `// refuseMalformedEnv();` and
    // mutation-anchors.test.mjs refused it: the only change is "// ",
    // which is the signature of a mutant that edits prose and proves
    // nothing. Here it turns code into a comment, which is a real
    // change — but a detector cannot tell those apart from the diff,
    // and the detector is right to be strict. Deleting the call says
    // the same thing and says it in code.
    from: "refuseMalformedEnv();",
    to: "",
    expect: "REFUSES a malformed NEXT_PUBLIC_ value",
  },
  {
    // THE POPULATION BECOMES THE MACHINE'S. This is the false positive
    // the first draft actually produced — a container's
    // CLAUDE_CODE_PROVIDER_MANAGED_BY_HOST reported as a broken URL.
    name: "the build reads every variable on the machine again",
    file: CONFIG,
    from: "  const names = [...envVarsInExample()];",
    to: "  const names = Object.keys(process.env).filter((n) => /^[A-Z][A-Z0-9_]*$/.test(n));",
    expect: "the project's declared names, not process.env's keys",
  },
];

function runGate() {
  try {
    execFileSync(process.execPath, [GATE], { encoding: "utf8", stdio: "pipe", timeout: 300_000 });
    return { green: true, failed: [] };
  } catch (e) {
    const out = String(e.stdout ?? "") + String(e.stderr ?? "");
    return { green: false, failed: [...out.matchAll(/^ {2}FAIL {2}(.+)$/gm)].map((m) => m[1].trim()) };
  }
}

console.log("env-shape mutations\n");

const TARGETS = [...new Set(MUTANTS.map((m) => m.file))];
const originals = new Map(TARGETS.map((f) => [f, readFileSync(f, "utf8")]));
const restoreAll = () => {
  for (const [file, text] of originals) writeFileSync(file, text);
};

let caught = 0;
const missed = [];
try {
  const baseline = runGate();
  if (!baseline.green) {
    console.log("BASELINE IS ALREADY RED — fix the gate before measuring it.");
    console.log(baseline.failed.map((f) => `  ${f}`).join("\n"));
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
console.log("A build that dies with `TypeError: Invalid URL` and no name goes red here first.");
