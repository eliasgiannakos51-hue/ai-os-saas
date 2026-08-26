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

  const checksPresence = /!\s*\w+\.includes\(\s*\w+(\.\w+)?\s*\)/.test(code);
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
