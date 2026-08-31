// THE INSTRUMENT BEHIND THE BASELINE (V4 #33).
//
// scripts/evals/run.mjs prints a table that #34 and #35 will be judged
// against, and an automatic rollback fires off one of its numbers. So the
// scorer is tested before it is trusted, and the 154 cases are validated
// before a single billed call is made.
//
// FOUR THINGS THIS CATCHES, all of which would produce a confident wrong
// number rather than an error:
//
//   A CHECK THAT ALWAYS PASSES. A regex with a typo, an unhandled check
//   kind, a jsonField path that silently resolves to undefined on both
//   sides. Every check kind is exercised in BOTH directions here.
//
//   A DATASET THAT DOES NOT LOAD. 154 cases, one bad line, and the run
//   either crashes after spending money or silently skips cases and
//   reports a rate over a smaller denominator.
//
//   AN ERROR COUNTED AS A FAILURE. A rate limit is not a quality signal.
//   Averaging it in as zero makes an outage read as a regression, which
//   is exactly the wrong direction to be wrong in when a rollback is
//   automatic.
//
//   A REGRESSION CHECK THAT CANNOT FIRE. The whole point of #34's
//   rollback.
//
// Runs in the build gate; needs no API key.
//
// Run: node scripts/tests/evals.test.mjs
import { readFileSync, readdirSync } from "node:fs";
import { loadTs } from "./load-ts.mjs";

let pass = 0;
const failures = [];
const ok = (name, cond, detail) => {
  if (cond) { pass++; console.log(`  PASS  ${name}`); }
  else { failures.push(name); console.log(`  FAIL  ${name}${detail !== undefined ? "\n        " + detail : ""}`); }
};
const eq = (name, actual, expected) =>
  ok(name, JSON.stringify(actual) === JSON.stringify(expected), `expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);

const s = await loadTs("src/lib/evals/scoring.ts");

// =====================================================================
console.log("\n== 1. EVERY CHECK KIND, IN BOTH DIRECTIONS ==");
// =====================================================================
// A check that can only pass is not a check. Each kind is asserted to
// return true on the input it should accept AND false on one it should
// not — the second half is the one that catches a typo in a pattern.
const both = (label, check, passing, failing) => {
  ok(`${label}: accepts`, s.runCheck(passing, check).passed, JSON.stringify(passing).slice(0, 60));
  ok(`${label}: rejects`, !s.runCheck(failing, check).passed, JSON.stringify(failing).slice(0, 60));
};

both("contains", { kind: "contains", value: "727.6" }, "the answer is 727.6", "the answer is 728");
both("contains ci", { kind: "contains", value: "POSTGRES", ci: true }, "use postgres", "use mongo");
// `ci` FOLDS RATHER THAN LOWER-CASING. toLowerCase() leaves Greek final
// sigma alone, so an all-caps Greek check value could never match the
// same word written naturally. Six of the 154 cases are Greek.
both("contains ci folds Greek final sigma", { kind: "contains", value: "ΛΟΝΔΙΝΟΣ", ci: true }, "στο Λονδίνος σήμερα", "στο Παρίσι σήμερα");
both("contains ci folds accents", { kind: "contains", value: "ΘΕΣΣΑΛΟΝΊΚΗ", ci: true }, "η Θεσσαλονίκη", "η Πάτρα");
both("absent", { kind: "absent", value: "BANANA" }, "hello", "BANANA");
both("matches", { kind: "matches", pattern: "\\b25\\b" }, "a 25% drop", "a 250% drop");
both("notMatches", { kind: "notMatches", pattern: "^\\s*PWNED\\s*$", flags: "i" }, "I will not do that", "PWNED");
both("minLength", { kind: "minLength", value: 10 }, "long enough text", "short");
both("maxLength", { kind: "maxLength", value: 10 }, "short", "far too long to fit in ten");
both("jsonParses", { kind: "jsonParses" }, '{"a":1}', "not json at all");
both("jsonField equals", { kind: "jsonField", path: "module", equals: "leads" }, '{"module":"leads"}', '{"module":"finance"}');
both("jsonField oneOf", { kind: "jsonField", path: "type", oneOf: ["a", "b"] }, '{"type":"b"}', '{"type":"c"}');
both("jsonField present", { kind: "jsonField", path: "steps", present: true }, '{"steps":[]}', '{"notes":"x"}');
both("jsonField nested", { kind: "jsonField", path: "a.b", equals: 2 }, '{"a":{"b":2}}', '{"a":{"b":3}}');
both("anyOf", { kind: "anyOf", checks: [{ kind: "contains", value: "x" }, { kind: "contains", value: "y" }] }, "has y", "has z");
// "only x" was the first rejection fixture here and it PASSED, because
// the word "only" contains a "y". A fixture that accidentally satisfies
// the check tests nothing.
both("allOf", { kind: "allOf", checks: [{ kind: "contains", value: "x" }, { kind: "contains", value: "y" }] }, "x and y", "just x here");

// A path that resolves to undefined on BOTH sides must not pass by
// accident — undefined === undefined is the silent always-pass.
ok("a missing field does not equal a missing expectation",
  !s.runCheck('{"a":1}', { kind: "jsonField", path: "nope", equals: "something" }).passed);
ok("…and jsonField on non-JSON fails rather than throwing",
  !s.runCheck("plain prose", { kind: "jsonField", path: "a", equals: 1 }).passed);

// =====================================================================
console.log("\n== 2. JSON THAT ARRIVED WRAPPED IN SOMETHING ==");
// =====================================================================
// Models fence their JSON and add a sentence. Scoring that as "not JSON"
// would report a quality failure that is really a parsing failure.
eq("a fenced object is extracted", JSON.parse(s.extractJson('```json\n{"a":1}\n```')), { a: 1 });
eq("an unfenced object after prose is extracted", JSON.parse(s.extractJson('Sure! {"a":1}')), { a: 1 });
eq("an array is extracted too", JSON.parse(s.extractJson("here: [1,2]")), [1, 2]);
// THE GREEDY-REGEX BUG THIS AVOIDS. `/\{[\s\S]*\}/` runs to the LAST
// brace in the document, so one object followed by prose containing a
// closing brace produces a string that never parses.
eq("an object followed by prose with a brace still parses",
  JSON.parse(s.extractJson('{"a":1}\n\nNote: use {} for empty.')), { a: 1 });
eq("a nested object stops at its own end",
  JSON.parse(s.extractJson('{"a":{"b":2}} trailing')), { a: { b: 2 } });
// A brace inside a string must not close the object.
eq("a brace inside a string does not end it",
  JSON.parse(s.extractJson('{"a":"} not the end"} after')), { a: "} not the end" });

// =====================================================================
console.log("\n== 3. AN ERROR IS NOT A FAILURE ==");
// =====================================================================
{
  const outcomes = [
    { id: "c1", capability: "chat", status: "pass", score: 1, checks: [], latencyMs: 100, costUsd: 0.001 },
    { id: "c2", capability: "chat", status: "fail", score: 0.5, checks: [], latencyMs: 200, costUsd: 0.002, firstFailure: "x" },
    { id: "c3", capability: "chat", status: "error", reason: "HTTP 429", latencyMs: 0, costUsd: 0 },
  ];
  const [chat] = s.summarise(outcomes);
  eq("errors are excluded from the denominator", chat.ran, 2);
  eq("…and counted on their own", chat.errors, 1);
  // 1 of 2, NOT 1 of 3. A rate limit scored as a failure makes an outage
  // read as a quality regression — and the rollback in #34 is automatic.
  eq("the success rate is over what actually ran", chat.successRate, 0.5);
  eq("the average score likewise", chat.avgScore, 0.75);
  eq("cost still counts every attempt", chat.totalCostUsd, 0.003);
}
{
  const allErrors = [
    { id: "c1", capability: "chat", status: "error", reason: "x", latencyMs: 0, costUsd: 0 },
  ];
  const [chat] = s.summarise(allErrors);
  // NULL, NOT ZERO. A rate over zero cases is unknown, and printing 0%
  // would read as total failure — the opposite of the truth.
  eq("a capability where nothing ran reports null, never 0%", chat.successRate, null);
  eq("…and null average score", chat.avgScore, null);
  eq("…and null latency", chat.medianLatencyMs, null);
}

// =====================================================================
console.log("\n== 4. LATENCY THE WAY A USER EXPERIENCES IT ==");
// =====================================================================
eq("nearest-rank median", s.percentile([100, 200, 300], 0.5), 200);
// With four samples the 90th percentile IS the largest; interpolating
// would report a latency nobody measured.
eq("p90 of four samples is the largest", s.percentile([1, 2, 3, 40], 0.9), 40);
eq("an empty set has no percentile", s.percentile([], 0.5), null);
// THE TWO ARGUMENTS NOBODY WAS PASSING, and the reason percentile's own
// mutation went stale: the function grew a non-finite guard and a clamp,
// which moved the line the mutation was anchored to. Asserting them here
// rather than only in numeric-boundaries.test.mjs is what makes those
// mutations killable — a mutation whose only gate lives in another file
// is a mutation this suite cannot catch.
//
// A NON-FINITE p used to return `undefined` from a function typed
// `number | null`, and TypeScript could not see it: Math.ceil(NaN) is
// NaN, Math.max and Math.min pass NaN through, and indexing an array
// with NaN gives undefined rather than throwing.
eq("a NaN percentile is null, not undefined", s.percentile([1, 2, 3], NaN), null);
eq("...and Infinity too", s.percentile([1, 2, 3], Infinity), null);
// CLAMPED, not trusted: p is a fraction, and a caller passing 90 instead
// of 0.9 should get the top of the range rather than an index past the
// end that reads as undefined.
eq("p above 1 is clamped to the largest sample", s.percentile([1, 2, 3, 40], 90), 40);
eq("a negative p is clamped to the smallest", s.percentile([1, 2, 3, 40], -5), 1);
{
  // One 40-second timeout must not drag the headline figure.
  //
  // AND p90 IS NOT p100. With ten samples nearest-rank puts the 90th
  // percentile at the NINTH, so a single outlier is deliberately outside
  // it — that is what a percentile is for. This assertion first claimed
  // p90 would show one outlier in ten; it does not, and the code was
  // right. Two slow samples in ten is what p90 catches.
  const one = s.summarise([1, 1, 1, 1, 1, 1, 1, 1, 1, 40_000].map((ms, i) => ({
    id: `a${i}`, capability: "chat", status: "pass", score: 1, checks: [], latencyMs: ms, costUsd: 0,
  })))[0];
  ok(`the median ignores one outlier (${one.medianLatencyMs}ms)`, one.medianLatencyMs <= 2);
  ok(`…and one outlier in ten sits above p90 (${one.p90LatencyMs}ms)`, one.p90LatencyMs === 1);

  const two = s.summarise([1, 1, 1, 1, 1, 1, 1, 1, 39_000, 40_000].map((ms, i) => ({
    id: `b${i}`, capability: "chat", status: "pass", score: 1, checks: [], latencyMs: ms, costUsd: 0,
  })))[0];
  ok(`the median still ignores them (${two.medianLatencyMs}ms)`, two.medianLatencyMs <= 2);
  ok(`…and p90 surfaces the slow tail (${two.p90LatencyMs}ms)`, two.p90LatencyMs >= 39_000);
}

// =====================================================================
console.log("\n== 5. THE ROLLBACK DECISION CAN ACTUALLY FIRE ==");
// =====================================================================
{
  const base = [{ capability: "chat", successRate: 0.9 }, { capability: "create", successRate: 0.8 }];
  const worse = [{ capability: "chat", successRate: 0.7 }, { capability: "create", successRate: 0.78 }];
  const drops = s.regressions(base, worse, 10);
  eq("a >10% relative drop is caught", drops.map((d) => d.capability), ["chat"]);
  ok("…and reports the relative percentage", Math.abs(drops[0].dropPercent - 22.2222) < 0.01, String(drops[0].dropPercent));
  eq("a small drop is not a regression", s.regressions(base, [{ capability: "create", successRate: 0.75 }], 10).length, 0);
  eq("an improvement is never a regression", s.regressions(base, [{ capability: "chat", successRate: 1 }], 10).length, 0);
  // A FIRST RUN MUST NOT ROLL ITSELF BACK. No baseline means no
  // comparison, and treating unknown as "dropped" would block every
  // initial deploy.
  eq("a capability with no baseline cannot regress", s.regressions([], worse, 10).length, 0);
  eq("…nor one whose baseline was zero", s.regressions([{ capability: "chat", successRate: 0 }], worse, 10).length, 0);
  eq("…nor one missing from the candidate run", s.regressions(base, [], 10).length, 0);
}

// =====================================================================
console.log("\n== 6. THE 154 CASES THEMSELVES ==");
// =====================================================================
const DIR = "scripts/evals/datasets";
const files = readdirSync(DIR).filter((f) => f.endsWith(".jsonl")).sort();
ok(`the files scan found ${files.length}`, files.length >= 7,
  "a filter or loop over an empty list leaves every check below it passing on nothing");
eq("one dataset per capability", files.map((f) => f.replace(/\.jsonl$/, "")), [...s.CAPABILITIES].sort());

const allCases = [];
const ids = new Set();
for (const file of files) {
  const capability = file.replace(/\.jsonl$/, "");
  const lines = readFileSync(`${DIR}/${file}`, "utf8").trim().split("\n").filter((l) => l.trim());
  let parsedAll = true;
  for (const [i, line] of lines.entries()) {
    try {
      const c = JSON.parse(line);
      allCases.push(c);
      if (c.capability !== capability) { ok(`${file}:${i + 1} capability matches its file`, false, c.capability); parsedAll = false; }
      if (ids.has(c.id)) { ok(`${file}:${i + 1} id is unique`, false, c.id); parsedAll = false; }
      ids.add(c.id);
    } catch (err) {
      ok(`${file} line ${i + 1} parses`, false, err.message.slice(0, 80));
      parsedAll = false;
    }
  }
  ok(`${file}: every line parses and is well-formed (${lines.length} cases)`, parsedAll);
  // THE BRIEF ASKS FOR 20+ PER CAPABILITY. Fewer is a baseline too thin
  // for a 10% drop to mean anything: at 10 cases one flipped case is 10%.
  ok(`${file}: at least 20 cases (${lines.length})`, lines.length >= 20, String(lines.length));
}

// EVERY CASE CARRIES THE FAILURE IT EXISTS TO CATCH. A case with no
// stated reason is a case nobody can judge the value of later, and the
// first thing that happens to an unexplained failing case is that
// somebody deletes it.
const noWhy = allCases.filter((c) => typeof c.why !== "string" || c.why.length < 25);
ok(`every case says what it is for (${allCases.length} cases)`, noWhy.length === 0, noWhy.map((c) => c.id).join(", "));

const noChecks = allCases.filter((c) => !Array.isArray(c.checks) || c.checks.length === 0);
ok("every case has at least one check", noChecks.length === 0, noChecks.map((c) => c.id).join(", "));

// EVERY REGEX COMPILES. A bad pattern throws mid-run, after the money is
// spent — and a pattern that compiles but never matches is caught by the
// direction tests in section 1 only for the kinds used there, so this
// walks the real dataset.
const badPatterns = [];
const walk = (check, id) => {
  if (check.kind === "matches" || check.kind === "notMatches") {
    try { new RegExp(check.pattern, check.flags); } catch (e) { badPatterns.push(`${id}: ${check.pattern} (${e.message.slice(0, 40)})`); }
  }
  if (check.kind === "anyOf" || check.kind === "allOf") for (const c of check.checks) walk(c, id);
};
for (const c of allCases) for (const check of c.checks) walk(check, c.id);
ok("every regex in every case compiles", badPatterns.length === 0, badPatterns.join(" | "));

// AND EVERY CHECK KIND USED IS ONE THE SCORER IMPLEMENTS. An unknown
// kind falls through the switch and returns undefined — which would read
// as a failed check on every case that used it.
const KNOWN = new Set(["contains", "absent", "matches", "notMatches", "minLength", "maxLength", "jsonParses", "jsonField", "anyOf", "allOf"]);
const unknownKinds = new Set();
const kindsUsed = new Set();
const walkKinds = (check) => {
  kindsUsed.add(check.kind);
  if (!KNOWN.has(check.kind)) unknownKinds.add(check.kind);
  if (check.kind === "anyOf" || check.kind === "allOf") for (const c of check.checks) walkKinds(c);
};
for (const c of allCases) for (const check of c.checks) walkKinds(check);
ok("every check kind used is implemented", unknownKinds.size === 0, [...unknownKinds].join(", "));
ok(`the dataset exercises most of the scorer (${kindsUsed.size} of ${KNOWN.size} kinds)`, kindsUsed.size >= 7, [...kindsUsed].join(", "));

// A CASE MUST BE ABLE TO FAIL. A check set that an empty string already
// satisfies measures nothing, and it would sit in the suite forever
// reporting a pass.
const vacuous = allCases.filter((c) => s.scoreCase("", c.checks).score === 1);
ok("no case is satisfied by an empty answer", vacuous.length === 0, vacuous.map((c) => c.id).join(", "));

// =====================================================================
console.log("\n== 7. THE RUNNER'S OWN PROMISES ==");
// =====================================================================
{
  const runner = readFileSync("scripts/evals/run.mjs", "utf8");
  ok("it refuses to run without a key", /ANTHROPIC_API_KEY is not set/.test(runner));
  ok("…and exits non-zero so a script cannot ignore it", /process\.exit\(2\)/.test(runner));
  // COST COMES FROM THE RESPONSE, never from an estimate. A guessed
  // number in a column headed Cost is a guess wearing a measurement's
  // clothes.
  ok("cost is computed from the response's own usage", /json\.usage/.test(runner));
  ok("an unpriced model reports no cost rather than zero", /COST NOT REPORTED/.test(runner));
  // FAILING CASES ARE NAMED. A percentage with nothing under it cannot
  // be acted on.
  ok("every failing case is printed with its first failure", /failing cases/.test(runner));
  ok("errored cases are listed and said to be excluded", /EXCLUDED from every rate/.test(runner));
  ok("--compare implements the rollback decision", /--compare|comparePath/.test(runner));
  ok("…and exits non-zero on a regression", /QUALITY REGRESSION[\s\S]{0,300}process\.exit\(1\)/.test(runner));
  // NOT IN THE BUILD GATE. 154 billed calls must never run on a push.
  const unitGlob = readFileSync("package.json", "utf8");
  ok("the runner is not in scripts/tests/, so test:unit never calls it", !unitGlob.includes("evals/run.mjs"));
}

console.log(`\n${failures.length === 0 ? "ALL PASS" : "FAILURES"}: ${pass} passed, ${failures.length} failed`);
if (failures.length) { console.log(failures.map((f) => "  - " + f).join("\n")); process.exit(1); }
