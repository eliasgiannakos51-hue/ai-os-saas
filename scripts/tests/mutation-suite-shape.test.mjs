// The mutation suites are instruments. This checks the instruments.
//
// THREE DEFECTS THAT ALL LOOK LIKE HEALTH FROM THE OUTSIDE, each found by
// running the thirty suites rather than reading them:
//
//   1. A SUITE POINTING AT THE WRONG GATE.
//      cross-module-context-chat-coding.mutation.mjs named
//      cross-module-context.test.mjs — the same string minus "-chat-coding".
//      That gate loads src/lib/ai/context-relevance.ts; the suite mutates
//      src/lib/context-relevance.ts, a different module with a different
//      API. Every mutation applied cleanly, the gate stayed green, and the
//      suite reported 0 of 14 caught for months. The gate it should have
//      named has the suite's own name and always existed.
//
//   2. A STALE ANCHOR. A mutation whose `from` string no longer appears in
//      the source cannot re-introduce anything. Twenty-nine of the thirty
//      suites already count that as a miss and exit non-zero — measured, by
//      redirecting one used file constant at an empty file in each suite and
//      confirming it went red. This file keeps that true for the next suite
//      somebody writes, cheaply, by checking the shape rather than spending
//      fifteen minutes running them all.
//
//   3. A DECLARED FILE CONSTANT NO MUTATION USES.
//      ai-providers.mutation.mjs declared TYPES = ".../providers/types.ts"
//      and nothing referenced it. Harmless in itself — and it made the
//      stale-anchor probe redirect a dead constant and report the suite as
//      the one liar of the thirty, which was a fact about the probe.
//
// Run: node scripts/tests/mutation-suite-shape.test.mjs
import { readFileSync, readdirSync, existsSync } from "node:fs";
import path from "node:path";

const DIR = "scripts/tests";
let pass = 0;
const failures = [];
function ok(name, cond, detail = "") {
  if (cond) {
    pass++;
    console.log(`  PASS  ${name}`);
  } else {
    failures.push(name);
    console.log(`  FAIL  ${name}${detail ? `\n        ${detail}` : ""}`);
  }
}

const suites = readdirSync(DIR).filter((f) => f.endsWith(".mutation.mjs")).sort();

console.log("mutation-suite-shape");
// A floor, for the reason every gate here has one: "none of them is broken"
// is trivially true of an empty list.
ok(`the mutation suites were found (${suites.length})`, suites.length >= 30, `found ${suites.length}`);

// ---------------------------------------------------------------------
console.log("\n== 1. every suite targets its own gate, when one exists ==");
// ---------------------------------------------------------------------
// NOT "the names must match" — three suites deliberately guard a gate with a
// different name (tracking-to-tools guards data-analysis.test.mjs, and there
// is no tracking-to-tools.test.mjs to confuse it with). The rule is the one
// that would have caught the real bug: if a gate with the suite's own name
// EXISTS, pointing somewhere else is a mistake, because the two names are
// then one typo apart.
for (const file of suites) {
  const name = file.replace(/\.mutation\.mjs$/, "");
  const src = readFileSync(path.join(DIR, file), "utf8");
  const targets = [...src.matchAll(/"(scripts\/tests\/[a-z0-9-]+\.test\.mjs)"/g)].map((m) => m[1]);
  ok(`${name}: names at least one gate`, targets.length > 0, "no scripts/tests/*.test.mjs referenced");
  const own = `${DIR}/${name}.test.mjs`;
  if (!existsSync(own)) continue; // a differently-named gate is deliberate
  ok(
    `${name}: targets its own gate, which exists`,
    targets.includes(own),
    `points at ${targets.join(", ") || "nothing"} while ${own} exists`
  );
}

// ---------------------------------------------------------------------
// ---------------------------------------------------------------------
console.log("\n== 1b. a suite says WHICH check caught each mutation ==");
// ---------------------------------------------------------------------
// "CAUGHT" ON ITS OWN IS NOT ENOUGH. It says a mutation turned something
// red; it does not say WHAT, and a mutation caught by the wrong assertion
// is a mutation nobody has really tested — the classic case being an edit
// that breaks the file's syntax, reddening every check at once and
// looking like coverage.
//
// Measured across the directory: 57 of 58 suites already do this, in one
// of two ways. The better one reads the gate's OWN first failing line
// from its stdout (light-theme-contrast.mutation.mjs is the model); the
// weaker one carries an `expect:` label naming the check the author
// believes will fire. Both are accepted here — a predicted name is still
// a name somebody can check — but the stdout form is what to copy,
// because a label is a belief and the point of running the thing is to
// stop believing.
//
// A RATCHET AT THE MEASURED NUMBER. It may only go DOWN.
{
  const silent = [];
  for (const file of suites) {
    const src = readFileSync(path.join(DIR, file), "utf8");
    const namesIt = /includes\("FAIL"\)|-> by |\bexpect:|e\.stdout|\.stdout/.test(src);
    if (!namesIt) silent.push(file);
  }
  const SILENT_CEILING = 0;
  ok(
    `every suite names which check caught the mutation (${suites.length - silent.length}/${suites.length})`,
    silent.length <= SILENT_CEILING,
    `${silent.join(", ")} — each prints CAUGHT without saying what went red`
  );
}

console.log("\n== 2. a stale anchor is a failure, not a note ==");
// ---------------------------------------------------------------------
// Structural, because the behavioural version costs fifteen minutes: the
// suite must (a) test whether the anchor is present, and (b) route that case
// into whatever decides its exit code. Both halves are needed — a suite that
// checks and then only console.logs is the failure this exists for.
for (const file of suites) {
  const name = file.replace(/\.mutation\.mjs$/, "");
  const src = readFileSync(path.join(DIR, file), "utf8");
  const code = src.replace(/\/\*[\s\S]*?\*\//g, "").split("\n").filter((l) => !/^\s*(\/\/|\*)/.test(l)).join("\n");

  // THE RECEIVER MAY BE AN EXPRESSION. This read `!identifier.includes(x)`
  // only, so a suite that holds its originals in a Map and writes
  // `!originals.get(file).includes(anchor)` was reported as never checking —
  // a fact about the spelling, not about the suite. What is being asserted
  // is that the presence of the anchor is TESTED and NEGATED, however the
  // source is reached.
  const checksPresence = /!\s*[\w.]+(?:\([^)]*\))?(?:\.\w+)*\.includes\(\s*[\w.]+\s*\)/.test(code);
  ok(`${name}: checks whether the anchor is still in the file`, checksPresence);

  // The counter the exit code reads. Every suite here spells it `missed`,
  // either as an array it pushes to or a number it increments.
  const routesToExit = /missed\.push\(/.test(code) || /missed\s*\+\+/.test(code);
  ok(`${name}: a missing anchor counts against it`, routesToExit);

  const exitsNonZero = /process\.exit\(1\)/.test(code) || /process\.exit\(\s*missed\s*===\s*0\s*\?\s*0\s*:\s*1\s*\)/.test(code);
  ok(`${name}: and the run exits non-zero`, exitsNonZero);
}

// ---------------------------------------------------------------------
console.log("\n== 3. no declared file constant goes unused ==");
// ---------------------------------------------------------------------
for (const file of suites) {
  const name = file.replace(/\.mutation\.mjs$/, "");
  const src = readFileSync(path.join(DIR, file), "utf8");
  const consts = [...src.matchAll(/^const ([A-Z_0-9]+) = "((?:src|supabase|messages|public)\/[^"]+)";/gm)];
  const unused = consts.filter(([, id]) => {
    // Every use after the declaration line — `file: X`, a tuple `[X,`, an
    // argument `(X,`. The declaration itself is excluded by requiring the
    // name NOT be preceded by `const `.
    const uses = [...src.matchAll(new RegExp(`(?<!const )\\b${id}\\b`, "g"))];
    return uses.length === 0;
  });
  ok(
    `${name}: all ${consts.length} file constants are used`,
    unused.length === 0,
    unused.map(([, id, p]) => `${id} = ${p}`).join(", ")
  );
}

console.log(
  failures.length === 0
    ? `\nALL ${pass} CHECKS PASSED`
    : `\nFAILURES: ${pass} passed, ${failures.length} failed\n  - ${failures.join("\n  - ")}`
);
process.exit(failures.length === 0 ? 0 : 1);
