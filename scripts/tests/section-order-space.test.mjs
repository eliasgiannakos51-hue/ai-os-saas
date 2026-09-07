#!/usr/bin/env node
/*
 * "DO TWO SITES OF THE SAME KIND COME OUT ALIKE?" — ANSWERED WITHOUT
 * SPENDING ANYTHING.
 *
 * scripts/website-pairs-check.mjs answers that by generating twenty real
 * sites for about $7.50 and scoring the pages. It is the right instrument
 * for what the MODEL does: whether it obeys the section order it was
 * given, what the pages look like, whether the copy differs.
 *
 * But the STRUCTURAL half of the answer never needed a model at all. The
 * section order is chosen by lib/website-variation.ts before one token is
 * generated, and it is the axis the whole "same template" complaint is
 * about. So the probability that two people's sites of one kind get the
 * same skeleton is a property of that function — computable exactly, in
 * milliseconds, for nothing. A paid run estimates this number from three
 * samples; this derives it from twenty thousand.
 *
 * THE NUMBERS THIS FILE WAS WRITTEN TO RECORD, all measured here on
 * 2026-09-07, before and after:
 *
 *                                        before      after
 *   two strangers, same kind, 1st site    33.3%       16.7%
 *   one person's sites 2..N repeat one    59.9%        0
 *   one person, five sites, all the same   1.0%        0
 *
 * The "before" column is what three section orders and an independent
 * hash per site give you, and no wording in any prompt could have moved
 * it: 1 in 3 is what a three-sided die does. The "after" column is six
 * orders (which halves the stranger collision — it cannot do better,
 * see below) and a per-person CYCLE instead of a draw (which removes the
 * repeat entirely, which a draw cannot).
 *
 * WHAT IS NOT CLAIMED. Nothing here says two sites LOOK different. The
 * order is an instruction, and rule 23 of this project's working rules is
 * that an instruction a model can ignore will be ignored — which is why
 * the process route now MEASURES the produced page against the person's
 * previous one (compareStructure, note kind "sameSkeleton") instead of
 * trusting the directive. This file is about the space of instructions;
 * website-pairs-check.mjs is about what comes back.
 *
 * Run: node scripts/tests/section-order-space.test.mjs
 */
import { loadTs } from "./load-ts.mjs";

let pass = 0;
const failures = [];
function check(name, cond, detail) {
  if (cond) {
    pass++;
    console.log(`  PASS  ${name}`);
  } else {
    failures.push(name);
    console.log(`  FAIL  ${name}${detail !== undefined ? `\n        ${detail}` : ""}`);
  }
}

const v = await loadTs("src/lib/website-variation.ts");
const { pickVariation, orderIndexFor, SECTION_ORDERS, SECTION_ORDER_COUNT } = v;
const N = SECTION_ORDERS.length;
const letterOf = (d) => d.order.trim()[0];
const forUser = (user, n, brief) => pickVariation([user, n, brief], { userKey: user, priorSites: n });

// ---------------------------------------------------------------------
console.log("== 1. the size of the space ==");
{
  // THE NAME DOES NOT CARRY THE NUMBER, and that is a lesson from this
  // file's own mutation suite rather than a style choice: a check called
  // `there are ${N} section orders` renames itself to "there are 3" the
  // moment the list shrinks, so the mutation that shrinks it reports
  // WRONG — red on a clause whose name no longer matches the one it aimed
  // at. Every runner in this directory matches failures by name.
  check("there are six section orders", N === 6, String(N));
  check("...and the exported count agrees with the list", SECTION_ORDER_COUNT === N);
  check(
    "every letter A-F is offered exactly once",
    ["A", "B", "C", "D", "E", "F"].every((l) => SECTION_ORDERS.filter((o) => o.trim()[0] === l).length === 1),
    SECTION_ORDERS.map((o) => o.trim()[0]).join("")
  );
}

// ---------------------------------------------------------------------
console.log("\n== 2. two strangers, same kind of business ==");
{
  // THE WORST CASE, and the one website-pairs-check.mjs generates: two
  // different people, first site each, briefs that name different places
  // and specialities. Nothing can be remembered between them.
  const PAIRS = 20_000;
  let same = 0;
  for (let i = 0; i < PAIRS; i++) {
    const a = letterOf(forUser(`personA${i}`, 0, `a taverna, brief ${i}`));
    const b = letterOf(forUser(`personB${i}`, 0, `a taverna, other brief ${i}`));
    if (a === b) same++;
  }
  const rate = same / PAIRS;
  console.log(`\n  same section order in ${same}/${PAIRS} pairs = ${(rate * 100).toFixed(1)}%`);
  console.log(`  the arithmetic floor for ${N} orders is ${(100 / N).toFixed(1)}%\n`);
  // THE BAR IS THE FLOOR PLUS SAMPLING ROOM, not a round number chosen to
  // pass. At n=20,000 and p=1/6 the standard deviation of the rate is
  // 0.26 percentage points, so 1.5 points of slack is about six sigma:
  // a real regression (back to three orders, 33.3%) is nowhere near it,
  // and noise cannot reach it.
  check(
    `two strangers collide at about 1 in ${N} (${(rate * 100).toFixed(1)}%)`,
    Math.abs(rate - 1 / N) < 0.015,
    `expected ~${(100 / N).toFixed(1)}%, and 33.3% is what three orders gave`
  );
  // AND IT IS A FLOOR, said out loud. A reader who sees 16.7% should not
  // go looking for the change that makes it 0: two accounts' draws cannot
  // see each other, and the only scheme that would fix this has to
  // remember what every account was ever given.
  check("...which is a floor, not a defect to fix", rate > 0.5 / N);
}

// ---------------------------------------------------------------------
console.log("\n== 3. one person's own sites ==");
{
  const PEOPLE = 4_000;
  let repeats = 0;
  let comparisons = 0;
  const distinctHisto = new Map();
  for (let u = 0; u < PEOPLE; u++) {
    const seen = [];
    for (let n = 0; n < N; n++) seen.push(letterOf(forUser(`person${u}`, n, "a taverna in Thessaloniki")));
    for (let n = 1; n < N; n++) {
      comparisons++;
      if (seen.slice(0, n).includes(seen[n])) repeats++;
    }
    const k = new Set(seen).size;
    distinctHisto.set(k, (distinctHisto.get(k) ?? 0) + 1);
  }
  console.log(`\n  sites 2..${N} landing on an order already used: ${repeats}/${comparisons}`);
  for (const [k, n] of [...distinctHisto].sort()) console.log(`  ${k} distinct orders in the first ${N}: ${n} people`);
  console.log("");
  // ZERO, EXACTLY. This is the property a hash cannot have — the same
  // measurement over the previous draw was 9,581 of 16,000 (59.9%), and
  // 40 of 4,000 people got ONE order for all five of their first five
  // sites. A cycle cannot repeat before it has been all the way round.
  check(`nobody repeats an order inside their first ${N} sites (${repeats} of ${comparisons})`, repeats === 0);
  check(
    `every person sees all ${N} orders in their first ${N} sites`,
    distinctHisto.get(N) === PEOPLE,
    JSON.stringify([...distinctHisto])
  );
  // ...AND THE FIRST REPEAT IS EXACTLY AT SITE N+1, not later by luck.
  const firstRepeatIndices = new Set();
  for (let u = 0; u < 500; u++) {
    const seen = [];
    for (let n = 0; n < N + 2; n++) seen.push(letterOf(forUser(`p${u}`, n, "x")));
    firstRepeatIndices.add(seen.findIndex((x, i) => seen.slice(0, i).includes(x)));
  }
  check(
    `the first repeat is site ${N + 1} for everyone`,
    firstRepeatIndices.size === 1 && firstRepeatIndices.has(N),
    [...firstRepeatIndices].join(", ")
  );
}

// ---------------------------------------------------------------------
console.log("\n== 4. the cycle did not fix the order by fixing everything ==");
{
  // A CYCLE THAT ALSO PINNED THE OTHER NINE AXES would give one person
  // the same site nine-tenths of the time and pass every check above.
  // The nine COMPOSITION axes still come from the seed.
  const seen = new Set();
  for (let n = 0; n < 20; n++) {
    const d = forUser("one-person", n, "the same brief every time");
    seen.add(JSON.stringify({ ...d, order: "" }));
  }
  check(`one person's 20 sites give ${seen.size} distinct composition draws (= 20)`, seen.size === 20);
  // AND THE ORDER IS STILL DETERMINISTIC: a regenerate of the same site
  // must reproduce it, or the stored HTML and the directive disagree.
  const once = forUser("determinism", 3, "a brief");
  const twice = forUser("determinism", 3, "a brief");
  check("the same person at the same site count draws the same order", once.order === twice.order);
}

// ---------------------------------------------------------------------
console.log("\n== 5. the index function itself ==");
{
  check("index 0 <= i < count for a normal call", orderIndexFor("u", 0, N) >= 0 && orderIndexFor("u", 0, N) < N);
  check("stepping by one steps the index by one", orderIndexFor("u", 4, N) === (orderIndexFor("u", 3, N) + 1) % N);
  // A COUNT FROM THE DATABASE CAN BE ANYTHING. `priorSites` is a nullable
  // count the caller coalesces to 0 — but a negative remainder in
  // JavaScript is negative, and SECTION_ORDERS[-1] is undefined, which
  // reaches the model as the string "undefined" in the directive.
  for (const bad of [-1, -7, 1.5, NaN, Infinity]) {
    const i = orderIndexFor("u", bad, N);
    check(`priorSites=${bad} still indexes inside the list (${i})`, Number.isInteger(i) && i >= 0 && i < N);
  }
  // DIFFERENT PEOPLE GET DIFFERENT STARTING POINTS, or the cycle is one
  // global rota and every account is in lockstep.
  const starts = new Set(Array.from({ length: 400 }, (_, i) => orderIndexFor(`person${i}`, 0, N)));
  check(`starting points spread across the list (${starts.size} of ${N})`, starts.size === N);
}

console.log(`\n${failures.length === 0 ? "ALL PASS" : "FAILED"}: ${pass} passed, ${failures.length} failed`);
if (failures.length) {
  for (const f of failures) console.log(`  - ${f}`);
  process.exit(1);
}
