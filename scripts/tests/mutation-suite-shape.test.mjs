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
//   4. EVERY MUTATION SCORED AS "THE GATE WENT RED", WITHOUT SAYING
//      WHICH CHECK. Thirty-five of the forty-five suites do this. A
//      mutation that breaks something completely unrelated is then
//      counted as caught — and, worse, you cannot see which assertions
//      your mutations actually exercise, so a suite can probe one
//      property from twenty angles and look thorough.
//
//      That is the sixth way a gate lies, and it cost a production
//      outage. marketing-messages.mutation.mjs had eleven mutations, all
//      caught, every instrument covered. All eleven asked "what do public
//      pages need?" — none rendered a dashboard route, because the gate
//      had no notion of one. The trim shipped and every dashboard page
//      showed raw key names to every user.
//
//      SAID PLAINLY: COUNTING DISTINCT EXPECTED CHECKS WOULD NOT HAVE
//      CAUGHT IT. That suite named eight distinct checks across eleven
//      mutations — broad by every metric available here. What was narrow
//      was the GATE's domain: it scanned 15 of the app's 56 entry points
//      and asserted nothing about the other 41. No shape check on a suite
//      can see that. Only asking "what does this change do to the paths
//      it was not written for" can, and that is a written rule in TODO.md
//      rather than a check, because it is a question, not a pattern.
//
//      What IS enforceable is the precondition: a mutation must name the
//      check that catches it. Then narrowness is at least VISIBLE — you
//      can count what your mutations touch. The ratchet in section 4
//      tracks that, so the thirty-five are a debt with a number on it
//      instead of a silent default.
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

// ---------------------------------------------------------------------
console.log("\n== 4. a mutation names the check that must catch it ==");
// ---------------------------------------------------------------------
// A suite that only asks "did the gate go red" counts an unrelated
// failure as a success, and hides which assertions its mutations really
// exercise. Ten suites name the check and compare against it; the rest
// predate the convention.
//
// A RISING FLOOR, NOT AN EQUALITY. Rewriting thirty-five suites means
// running each mutation to learn which check truly catches it, and a
// guessed name is worse than none — it would turn a real miss into a
// WRONG, or worse, paper over one. So this records what holds today and
// refuses to let it fall: the debt is tracked rather than paid in one
// sitting, and every new suite is written the better way because the
// number may only go up.
const NAMES_ITS_CHECK = suites.filter((file) => {
  const src = readFileSync(path.join(DIR, file), "utf8");
  const declares = /expect:\s*"/.test(src) || /expectAny:/.test(src);
  const compares =
    /includes\(m\.expect\)/.test(src) ||
    /wanted\.some/.test(src) ||
    /f\.includes\(m\.expect/.test(src);
  return declares && compares;
});
ok(
  `suites that name the catching check (${NAMES_ITS_CHECK.length} of ${suites.length})`,
  NAMES_ITS_CHECK.length >= 10,
  `${NAMES_ITS_CHECK.length} — this floor rises as suites are rewritten, and never falls`,
);
// And the ones that do must not have gone hollow: a declared `expect`
// that never reaches the OUTPUT is decoration. A suite that decides
// caught-or-missed from it and then reports only "the gate stayed green"
// leaves the reader unable to tell a narrow gate from a broken mutant,
// which is the entire reason for naming the check.
//
// THIS WAS A NAME CHECK AND NOT A BEHAVIOUR CHECK. It matched the
// identifier `onTarget`, which is a convention eleven suites happened to
// share — so a twelfth suite that named its check, compared against it
// and printed it, but called the variable something else, failed here
// for using a different word. A stale anchor in an instrument. It now
// asks what it means to ask: does the expected check appear in what a
// miss prints.
const hollow = NAMES_ITS_CHECK.filter((file) => {
  const src = readFileSync(path.join(DIR, file), "utf8");
  return !/\$\{m\.expect\}|\$\{JSON\.stringify\(wanted\)\}/.test(src);
});
ok(
  "every suite that names a check actually reports on it",
  hollow.length === 0,
  hollow.join(", "),
);

console.log(
  failures.length === 0
    ? `\nALL ${pass} CHECKS PASSED`
    : `\nFAILURES: ${pass} passed, ${failures.length} failed\n  - ${failures.join("\n  - ")}`
);
process.exit(failures.length === 0 ? 0 : 1);
