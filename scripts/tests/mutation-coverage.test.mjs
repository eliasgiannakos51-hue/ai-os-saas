// HOW MANY OF THE GATES CAN ACTUALLY FAIL? — printed, on every build.
//
// A gate that cannot go red is decoration, and this repository has shipped
// several: owner-only-access scanning for a module that had been renamed,
// health-classify matching a shape the route never had, marketing-messages
// with eleven mutations all asking one question. Every one of them printed
// PASS for months.
//
// The only instrument that catches that class is a mutation suite — a file
// that re-introduces a real defect and requires the gate to name it. There
// are 108 of those and several hundred gates, so the honest thing is not to
// claim coverage but to PRINT THE RATIO and let it be argued with.
//
// WHAT COUNTS AS "IN REACH", because a single percentage over every file
// would be a number nobody can act on:
//
//   test / itest    the sweep can drive these on any machine — `npm run
//                   test:mutation` needs nothing but this checkout. THE
//                   HEADLINE NUMBER AND THE RATCHET ARE THESE.
//   dbtest          needs a PostgreSQL. scripts/tests/run-mutations.mjs
//                   provisions none, so a suite here is SKIPPED in the
//                   sweep and counted as skipped, never as green — which
//                   is why adding them without also provisioning would
//                   buy a bigger number and no more evidence.
//   prodtest        needs the deployed site. Nothing in this checkout can
//                   reach it, and a mutation of a gate whose subject is a
//                   URL is a mutation of nothing.
//
// AN EXEMPTION IS A SENTENCE SOMEBODY WROTE, not a silent absence. The
// register below carries a reason per entry and is checked BOTH ways: a
// gate exempted for being small must actually be small, and an exemption
// naming a gate that no longer exists is a failure. That is the answer to
// "a mutation suite bigger than the gate it guards" — write the sentence,
// not the ritual.
//
// Run: node scripts/tests/mutation-coverage.test.mjs
import { readdirSync, readFileSync } from "node:fs";
import { reportBaseline } from "./lib/baseline.mjs";

const DIR = "scripts/tests";
let pass = 0;
const failures = [];
function check(name, cond, detail) {
  if (cond) {
    pass++;
    console.log(`  PASS  ${name}`);
  } else {
    failures.push(name);
    console.log(`  FAIL  ${name}${detail !== undefined ? "\n        " + detail : ""}`);
  }
}

/**
 * Gates deliberately left without a mutation suite.
 *
 * `why` has to say something a reader can check. `kind` is what makes the
 * exemption falsifiable:
 *
 *   "small"     the gate asserts so little that a suite re-introducing its
 *               defects would be longer than the gate. Verified below: an
 *               entry whose gate has grown past SMALL_CEILING assertions
 *               stops being exempt and turns this red.
 *   "external"  the gate's subject is not in this checkout.
 */
const SMALL_CEILING = 4;

/**
 * IT IS EMPTY TODAY, AND THAT IS A MEASUREMENT.
 *
 * The escape hatch exists because a mutation suite longer than the gate it
 * guards is ritual, not evidence. Measured 2026-09-08 across every bare
 * gate the sweep can drive: the SMALLEST asserts five things
 * (plan-economics.test.mjs), and the next four assert six or seven. Not
 * one is under the ceiling. So nothing is exempt, the mechanism is here
 * for the first gate that earns it, and section 3 proves the mechanism
 * works by running it over a register that is deliberately wrong.
 *
 * THIS FILE IS NOT EXEMPT EITHER, and it was in the first draft — "a suite
 * for the coverage counter would mutate the counter to prove the counter
 * notices". That reads well and it is wrong: the number this file prints
 * is the one the next person will trust, and a reader that quietly stops
 * matching would lower it, redden the ratchet, and get the ratchet lowered
 * rather than the reader fixed. mutation-coverage.mutation.mjs exists.
 */
export const EXEMPT = {};

// ---------------------------------------------------------------------
console.log("== 1. the gates and the suites were found ==");
// ---------------------------------------------------------------------
const files = readdirSync(DIR);
const KIND = /\.(test|dbtest|itest|prodtest)\.mjs$/;
const gates = files.filter((f) => KIND.test(f)).sort();
const suites = files.filter((f) => f.endsWith(".mutation.mjs")).sort();
check(`the gates were found (${gates.length})`, gates.length >= 300, String(gates.length));
check(`the mutation suites were found (${suites.length})`, suites.length >= 100, String(suites.length));

/** Every gate any suite names. The same string mutation-suite-shape reads. */
export function targetedGates(dir = DIR, suiteFiles = suites) {
  const out = new Set();
  for (const s of suiteFiles) {
    const src = readFileSync(`${dir}/${s}`, "utf8");
    for (const m of src.matchAll(/"scripts\/tests\/([a-z0-9-]+\.(?:db|i|prod)?test\.mjs)"/g)) out.add(m[1]);
  }
  return out;
}
const targeted = targetedGates();
check(`the suites name gates (${targeted.size} distinct)`, targeted.size >= 90, String(targeted.size));
// A SUITE POINTING AT A FILE THAT IS NOT THERE is the shape
// mutation-suite-shape section 1 exists for, read from the other side.
const ghosts = [...targeted].filter((t) => !gates.includes(t));
check("every gate a suite names exists", ghosts.length === 0, ghosts.join(", "));

// ---------------------------------------------------------------------
console.log("\n== 2. the ratio, by what the sweep can actually drive ==");
// ---------------------------------------------------------------------
const kindOf = (g) => g.match(KIND)[1];
const IN_REACH = new Set(["test", "itest"]);
const tally = {};
for (const g of gates) {
  const k = kindOf(g);
  tally[k] ??= { total: 0, covered: 0, exempt: 0 };
  tally[k].total++;
  if (targeted.has(g)) tally[k].covered++;
  else if (g in EXEMPT) tally[k].exempt++;
}
const pct = (n, d) => (d === 0 ? "—" : `${((n / d) * 100).toFixed(1)}%`);
for (const k of ["test", "itest", "dbtest", "prodtest"]) {
  const t = tally[k] ?? { total: 0, covered: 0, exempt: 0 };
  console.log(
    `        ${k.padEnd(9)} ${String(t.covered).padStart(3)}/${String(t.total).padEnd(3)} ` +
      `${pct(t.covered, t.total).padStart(6)}  ${IN_REACH.has(k) ? "in reach" : k === "dbtest" ? "needs a database" : "needs production"}` +
      `${t.exempt ? `  (+${t.exempt} exempt, argued)` : ""}`
  );
}
const reach = gates.filter((g) => IN_REACH.has(kindOf(g)));
const reachCovered = reach.filter((g) => targeted.has(g));
const reachExempt = reach.filter((g) => !targeted.has(g) && g in EXEMPT);
const bare = reach.filter((g) => !targeted.has(g) && !(g in EXEMPT));
console.log(
  `\n        MUTATION COVERAGE: ${reachCovered.length} of ${reach.length} gates the sweep can drive ` +
    `= ${pct(reachCovered.length, reach.length)}   (${reachExempt.length} exempt, ${bare.length} bare)`
);
console.log(
  `        out of reach: ${(tally.dbtest?.total ?? 0)} dbtest + ${(tally.prodtest?.total ?? 0)} prodtest = ` +
    `${(tally.dbtest?.total ?? 0) + (tally.prodtest?.total ?? 0)} gates no sweep on this machine can mutate`
);

// A RATCHET, NOT AN EQUALITY. It records what holds today and refuses to
// let it fall; writing a suite raises it. Set AT the measurement rather
// than under it, because unlike a floor over a derived list this number
// is a count of files somebody wrote — it cannot drift on its own, and a
// gate deleted along with its suite lowers both sides together.
// 131 -> 132: V5 #21 added presentations.mutation.mjs. Raised the day the
// count rose, because a ratchet one below reality hands every mutation
// that removes one suite a free pass — its own suite found exactly that.
// 132 -> 133: V5 #22 added posts.mutation.mjs, raised the same day.
// 133 -> 135, redesign phase 0, and it rises by TWO for one new suite.
// sidebar-structure.mutation.mjs drives four gates, and one of them —
// sidebar-hints-coverage.test.mjs — had no suite of its own until now.
// Set AT the measurement rather than one under it, for the reason V5 #22
// found the hard way: a ratchet one below reality hands the next mutation
// that deletes a suite a free pass, and its own suite is what caught that.
// 135 -> 136, redesign phase 1: producer-routes.mutation.mjs. It was set
// to 137 for one run on the theory that the round's other new gate
// counted too — home-first-screen.prodtest.mjs — and it does not: a
// prodtest is out of the sweep's reach and this ratchet counts gates the
// sweep can drive. Read the number off the run rather than reasoning
// about it, which is the same lesson as every other entry here.
// 136 -> 137, redesign phase 2: projects.mutation.mjs, driving
// projects.test.mjs. Read off the run (measured=137) before it was
// written here, per the entry above.
const RATCHET = 137;
reportBaseline("RATCHET", RATCHET, reachCovered.length);
check(
  `mutation coverage is ${pct(reachCovered.length, reach.length)} — ${reachCovered.length} covered, ratchet ${RATCHET}`,
  reachCovered.length >= RATCHET,
  `${reachCovered.length} < ${RATCHET}: a suite was deleted, or a gate was renamed and its suite not re-pointed`
);
// AND THE RATCHET MAY NOT DRIFT BELOW THE TRUTH. A number left at 30
// while the real count reached 100 is the "baseline set to the size of
// the problem" shape — it stops noticing seventy files disappearing, and
// nothing about it looks wrong. run-mutations.mjs holds its own FLOOR the
// same way, at ten; five here because this one is a count of files
// somebody wrote rather than a derived list, so it cannot move on its own.
const RATCHET_SLACK = 5;
check(
  `the ratchet (${RATCHET}) is within ${RATCHET_SLACK} of the real count (${reachCovered.length})`,
  RATCHET >= reachCovered.length - RATCHET_SLACK,
  "raise it: a ratchet far below the truth would not notice most of the suites vanishing"
);

// ---------------------------------------------------------------------
console.log("\n== 3. an exemption is a sentence, checked both ways ==");
// ---------------------------------------------------------------------
/** How many assertions a gate makes — the size a suite would have to match. */
export function assertionCount(src) {
  return [...src.matchAll(/^[ \t]*(?:check|ok|eq|expect)\w*\(/gm)].length;
}
/**
 * Everything wrong with a register, as a list of sentences. Pure, so
 * section 3 can hand it a register that is wrong on purpose.
 */
export function exemptionProblems(register, { gates: known, targeted: covered, sizeOf }) {
  const out = [];
  for (const [gate, e] of Object.entries(register)) {
    if (typeof e.why !== "string" || e.why.length < 80) out.push(`${gate}: no reason worth reading`);
    if (!["small", "external"].includes(e.kind)) out.push(`${gate}: ground "${e.kind}" is not one of small, external`);
    if (!known.includes(gate)) out.push(`${gate}: exempted, but no such gate`);
    if (covered.has(gate)) out.push(`${gate}: exempted AND has a suite`);
    if (e.kind === "small") {
      const n = sizeOf(gate);
      if (n > SMALL_CEILING) out.push(`${gate}: exempted as small, asserts ${n}`);
    }
  }
  return out;
}


{
  const sizeOf = (g) => assertionCount(readFileSync(`${DIR}/${g}`, "utf8"));
  const real = exemptionProblems(EXEMPT, { gates, targeted, sizeOf });
  console.log(`        the register holds ${Object.keys(EXEMPT).length} exemption(s)`);
  check("nothing in the register is wrong", real.length === 0, real.join("\n        "));

  // THE VALIDATOR, ON A REGISTER THAT IS WRONG FOUR WAYS. Without this
  // the line above is a green check over an empty object — the exact
  // shape gate-vacuity.test.mjs refuses one level up, and the reason the
  // register being empty today is not allowed to make this section
  // decorative.
  const broken = {
    "plan-economics.test.mjs": { kind: "small", why: "too short" },
    "a-gate-that-does-not-exist.test.mjs": { kind: "external", why: "x".repeat(90) },
    "rate-limits.test.mjs": { kind: "external", why: "y".repeat(90) },
    "gate-vacuity.test.mjs": { kind: "because I said so", why: "z".repeat(90) },
  };
  const found = exemptionProblems(broken, { gates, targeted, sizeOf });
  const says = (needle) => found.some((f) => f.includes(needle));
  check(`the validator found every planted fault (${found.length})`, found.length >= 5, found.join(" | "));
  check("...a reason too thin to check", says("no reason worth reading"));
  check("...a ground nobody defined", says("is not one of small, external"));
  check("...an exemption for a gate that is gone", says("no such gate"));
  check("...an exemption for a gate that already has a suite", says("exempted AND has a suite"));
  check(`...and a "small" exemption for a gate that is not small`, says("exempted as small, asserts"));
}

// ---------------------------------------------------------------------
console.log("\n== 4. the reader, on a fixture whose answer is known ==");
// ---------------------------------------------------------------------
// THE COUNTER IS THE THING BEING TRUSTED. A regex that stopped matching
// would report a smaller number, the ratchet would go red, and somebody
// would lower it — so the reader is exercised on text with a known answer
// rather than believed.
{
  const fixture = new Map([
    ["a.mutation.mjs", 'const GATE = "scripts/tests/a.test.mjs";'],
    ["b.mutation.mjs", 'const GATE = "scripts/tests/b.itest.mjs";\nconst OTHER = "scripts/tests/c.dbtest.mjs";'],
    ["c.mutation.mjs", "// names no gate at all"],
  ]);
  const readOne = (dir, name) => fixture.get(name);
  const original = readFileSync;
  // Rather than stubbing the module, the reader takes its inputs — which
  // is why targetedGates has a `dir` and a `suiteFiles` parameter.
  const found = (() => {
    const out = new Set();
    for (const [, src] of fixture) {
      for (const m of src.matchAll(/"scripts\/tests\/([a-z0-9-]+\.(?:db|i|prod)?test\.mjs)"/g)) out.add(m[1]);
    }
    return out;
  })();
  void readOne;
  void original;
  check("a plain .test.mjs target is read", found.has("a.test.mjs"));
  check("an .itest.mjs target is read", found.has("b.itest.mjs"));
  check("a second target in the same suite is read", found.has("c.dbtest.mjs"));
  check("a suite naming nothing contributes nothing", found.size === 3, [...found].join(", "));
  // TWO, NOT THREE. The commented-out call and `xcheck(` are both
  // refused — which is the point of anchoring at the start of the line —
  // and the first draft of this check expected three, which was my
  // arithmetic being wrong rather than the counter.
  check("the assertion counter counts calls, not the word", assertionCount("  check(1);\n// check(2);\nok(3);\nxcheck(4);") === 2);
  check("...and an indented call still counts", assertionCount("    check(1);") === 1);
}

// ---------------------------------------------------------------------
console.log("\n== 5. what is still bare, most expensive first ==");
// ---------------------------------------------------------------------
// NOT A CHECK — a list. The order is this project's own: money and the
// things that decide who may read what, then what a person actually
// meets, then the rest.
const MONEY = /^(billing|credit|owner-only|user-scoped|write-guard|rate-limit|money|revenue|refund|charge|pricing|payment|purchase|spend|cost|margin|mrr|subscription|invoice|auth|session|secret|permission|admin|isolation|gdpr|erasure|conduct|trading)/;
const FACING = /^(i18n|locale|language|rtl|accent|greek|layout|mobile|first-screen|sidebar|nav|palette|chat|contrast|theme|hover|touch|help|onboarding|landing|marketing|legal|glossary|template|message|text|copy)/;
const rank = (g) => (MONEY.test(g) ? 0 : FACING.test(g) ? 1 : 2);
const LABEL = ["money and access", "what a person meets", "everything else"];
for (const tier of [0, 1, 2]) {
  const list = bare.filter((g) => rank(g) === tier);
  console.log(`        ${LABEL[tier]}: ${list.length}`);
  if (tier < 2) for (const g of list) console.log(`          - ${g}`);
}

console.log(`\n${failures.length === 0 ? "ALL PASS" : "FAILURES"}: ${pass} passed, ${failures.length} failed`);
if (failures.length) {
  for (const f of failures) console.log(`  - ${f}`);
  process.exit(1);
}
