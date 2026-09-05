// A GATE THAT MEASURES WHERE THINGS ENDED UP, NOT WHAT WAS DECIDED.
//
// V4.6, and it is catalogued in docs/shapes.md as
// SHAPE: a gate measuring final STATE instead of BEHAVIOUR
//
// chat-scroll.prodtest.mjs asserted the
// view's final position: "the view stayed where the reader put it (585px
// from bottom)". With the follow fix reverted the view ALSO ended at
// 585px — the flick's own momentum carried it back up after the last
// chunk landed — so the assertion passed on both the fixed and the broken
// build. What differed was the DECISION: "notify" versus "scroll", and
// the visible consequence was the affordance, not the pixel.
//
// A position is a state. "Was a new-message button offered" is a
// behaviour. The first can be reached by two different routes and the
// gate cannot tell them apart; the second cannot.
//
// ------------------------------------------------------------------
// WHAT THIS FILE CAN AND CANNOT DETECT
// ------------------------------------------------------------------
//
// It cannot read intent. "Does this assertion distinguish the two
// routes" is not a property of the text — the only way to know is to
// break the code and watch, which is what the mutation suites are for.
//
// What it CAN do is find the shape that made the failure possible: a
// gate whose assertions are all about numbers that came out of a
// measurement, with nothing about what the code CHOSE. So it counts, per
// gate, how many assertions compare a measured quantity against a
// threshold versus how many assert a discrete outcome — a decision, a
// mode, a rendered affordance, an enum — and reports the ones that are
// entirely the former.
//
// That is a HEURISTIC and it is named as one. A gate on this list is not
// automatically wrong; a light-theme contrast gate SHOULD be all
// numbers, because contrast is a number. The list is where to look, and
// the ratchet stops it growing.
//
// Run: node scripts/tests/gate-state-vs-behaviour.test.mjs
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { stripComments } from "../check-mutation-markers.mjs";

let pass = 0;
const failures = [];
function check(name, cond, detail) {
  if (cond) {
    pass++;
    console.log(`  PASS  ${name}`);
  } else {
    failures.push(name);
    console.log(`  FAIL  ${name}${detail ? "\n        " + detail : ""}`);
  }
}

const DIR = "scripts/tests";

// A THRESHOLD COMPARISON: a measured quantity against a number. These are
// the assertions that can be reached by two different routes.
const THRESHOLD = /[><]=?\s*-?\d|\.length\s*[><=]|Math\.(abs|round|max|min)\(/;
// A DISCRETE OUTCOME: a decision, a mode, a class, a visible element, a
// string the code chose. These cannot be reached by accident.
// `.test(` IS A DECISION, and leaving it out was this classifier's own
// first mistake. A gate that asserts `!/bg-panel/.test(wrapper)` is
// asking "did the code choose to draw a card" — a discrete outcome that
// cannot be reached by two routes — and the first draft classified every
// such gate as threshold-only. chat-measure.test.mjs and
// user-scoped-queries.test.mjs both landed on the list for that reason:
// two gates that assert almost nothing BUT decisions, reported as
// asserting none.
const DECISION =
  /===\s*["'`]|toBe\(["'`]|isVisible\(\)|toBeVisible|decideFollow|=== *(true|false)|\.includes\(["'`]|JSON\.stringify|\bkind ===|\bmode ===|\.test\(|\bBoolean\(/;

// AND A THIRD CATEGORY THE FIRST DRAFT WAS BLIND TO: exact equality.
//
// Several files here use `check(name, actual, expected)` — three
// arguments, compared for exact equality rather than against a
// threshold. purchased-credits.itest.mjs is entirely that shape:
// `check("balance untouched", r.remaining, 7400)`. My classifier saw no
// `>` and no `===` and counted it as neither, so a file asserting exact
// credit balances was reported as having only threshold assertions —
// the opposite of the truth. An exact value is the STRONGEST of the
// three: 7400 cannot be arrived at by an approximate route the way "more
// than 300px" can.
const EXACT = /^\s*(check|ok|checkTrue)\([^,]+,[^,]+,[^)]+\)\s*;/;

function classify(file) {
  const src = stripComments(readFileSync(join(DIR, file), "utf8"));
  // One assertion per `check(`/`ok(` call, read to the end of its line
  // plus the next two — the condition is often on the following line.
  const lines = src.split("\n");
  let threshold = 0;
  let decision = 0;
  let exact = 0;
  for (let i = 0; i < lines.length; i++) {
    if (!/^\s*(check|ok|checkTrue)\(/.test(lines[i])) continue;
    const body = lines.slice(i, i + 4).join(" ");
    // EXACT FIRST. A three-argument equality is unambiguous, and reading
    // it as a threshold because a number appears somewhere in the line
    // is how purchased-credits ended up on the wrong list.
    if (EXACT.test(lines[i])) {
      exact++;
      continue;
    }
    const t = THRESHOLD.test(body);
    const d = DECISION.test(body);
    // An assertion can be both; it is counted as a decision, because one
    // discrete clause is enough to tell the two routes apart.
    if (d) decision++;
    else if (t) threshold++;
  }
  return { file, threshold, decision, exact, total: threshold + decision + exact };
}

const gates = readdirSync(DIR)
  .filter((f) => /\.(test|itest|prodtest)\.mjs$/.test(f))
  .map(classify)
  .filter((g) => g.total >= 4);

console.log(`== gates classified (${gates.length}, of those with 4+ assertions) ==`);
check(
  `there are gates to classify (${gates.length})`,
  gates.length >= 40,
  `${gates.length} — a census over a handful says nothing about the suite`
);

// ALL STATE, NOTHING DISCRETE. The shape the scroll test had: every
// assertion is a measured quantity against a bound, and none is a
// decision the code made or a value it must hit exactly.
const stateOnly = gates.filter((g) => g.decision === 0 && g.exact === 0);
console.log(`\n-- assertions are ALL thresholds, none discrete or exact (${stateOnly.length}) --`);
for (const g of stateOnly.sort((a, b) => b.threshold - a.threshold)) {
  console.log(`     ${g.file.padEnd(40)} ${g.threshold} threshold assertions, 0 discrete, 0 exact`);
}

// AND THE OPPOSITE END, printed because it is the shape to copy.
const mixed = gates.filter((g) => (g.decision > 0 || g.exact > 0) && g.threshold > 0);
console.log(`\n     ${mixed.length} gates assert both a quantity and something discrete — the shape to copy.`);

// ---------------------------------------------------------------------
console.log("\n== the ratchet ==");
// MEASURED, NOT ROUND. Every gate on the list is a place where a change
// could pass for the wrong reason, and the number may only go DOWN —
// lower it in the same commit that adds a decision assertion.
//
// NOT ALL OF THEM ARE WRONG, and that is why this is a ratchet rather
// than a target. A contrast gate is all numbers because contrast is a
// number; there is no decision in it to assert. The list is where to
// look first, not a list of defects.
// PINNED TO A LITERAL, and the first draft of this line wrote
// `stateOnly.length` — a ceiling compared against itself, which is
// shape #11 (a check that cannot go red) inside the file about shape
// #17. It could never have failed and it could never have passed for a
// reason. The number below was measured on the merged tree.
// THREE, AND ALL THREE ARE LEGITIMATE. landing-mobile measures a layout,
// navigation-latency and public-route-speed measure time. A latency
// assertion has no decision in it to assert — the quantity IS the
// property — so this is not a backlog of three defects, it is the floor
// the shape can reach in a suite that contains speed tests.
//
// The number went 21 -> 7 -> 3 as the classifier learned that `.test()`
// and three-argument exact equality are discrete. Two of those steps
// were the instrument being wrong, not the suite getting better, and
// saying so is the difference between a measurement and a score.
const STATE_ONLY_CEILING = 3;
console.log(`        gates asserting only thresholds: ${stateOnly.length}`);
check(
  `state-only gates: ${stateOnly.length}, ceiling ${STATE_ONLY_CEILING}`,
  stateOnly.length <= STATE_ONLY_CEILING,
  stateOnly.map((g) => g.file).join(", ")
);

// ---------------------------------------------------------------------
console.log("\n== the one this shape was found in ==");
// chat-scroll is the file this shape came from, so it is
// asserted by name rather than left to a count. It must assert a
// DECISION — the affordance — and not only a position.
const scroll = readFileSync(join(DIR, "chat-scroll.prodtest.mjs"), "utf8");
check(
  "chat-scroll asserts the affordance, not only the position",
  /new-message affordance is offered instead/.test(scroll) && /isVisible\(\)/.test(scroll),
  "the only assertions left are about pixels, which both the fixed and the broken build reach"
);
check(
  "...and its own comment records that the position was the same either way",
  /585px from the bottom either way/.test(scroll),
  "the note explaining why a position assertion could not tell the two apart is gone"
);

// AND THE CLASSIFIER, on samples it must get right.
console.log("\n== the classifier, on samples ==");
const T = (s) => THRESHOLD.test(s);
const D = (s) => DECISION.test(s);
check("a pixel threshold is a threshold", T("check('x', s.fromBottom > 300);"));
check("...and is not a decision", !D("check('x', s.fromBottom > 300);"));
check("a visibility assertion is a decision", D("check('x', await jump.isVisible());"));
check("a decision string is a decision", D('check("x", decideFollow(race) === "notify");'));
check("a length comparison is a threshold", T("check('x', rows.length >= 3);"));
check("a regex test is a decision, not a threshold", D("check('x', !/bg-panel/.test(wrapper));"));
check(
  "a three-argument exact equality is its own category",
  classify("purchased-credits.itest.mjs").exact > 0,
  JSON.stringify(classify("purchased-credits.itest.mjs"))
);
check(
  "an assertion that is both counts as a decision",
  D('check("x", list.length > 0 && mode === "split");') &&
    classify("chat-scroll.prodtest.mjs").decision > 0
);

console.log(`\n${failures.length === 0 ? "ALL PASS" : "FAILURES"}: ${pass} passed, ${failures.length} failed`);
process.exit(failures.length === 0 ? 0 : 1);
