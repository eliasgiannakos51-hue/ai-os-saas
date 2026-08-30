// A PRODTEST THAT ONLY EVER SAW ONE SCREEN, AND ONE THAT ONLY EVER USED A MOUSE.
//
// V4.6. chat-scroll.prodtest.mjs ran at 1280x900 with a wheel and nothing
// else. Deleting the fix it exists to defend left ALL ELEVEN of its
// desktop checks green; adding a 390x844 device driven by real CDP touch
// events turned one red. The race a wheel never opens, a thumb does.
//
// That was one file. This is the census: how many others are in the same
// position, and which of them are about INTERACTION — because the
// distinction is what decides whether it matters.
//
//   A prodtest that MEASURES something — contrast, a route's speed, the
//   HTML a published site emits — is not made more truthful by a second
//   viewport. It measures one thing and it is the right thing.
//
//   A prodtest that DRIVES something — a scroll, a drag, a tap, a
//   dismissal — is a claim about how a person's hand meets the page, and
//   a mouse is not a hand. Those are the ones that need both.
//
// So the file scans, splits by that distinction, and holds a ratchet on
// the interaction half only. The measurement half is printed as a census
// and not failed on, because failing it would be demanding work that buys
// nothing.
//
// Run: node scripts/tests/interaction-coverage.test.mjs
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
const files = readdirSync(DIR).filter((f) => f.endsWith(".prodtest.mjs"));

// WHAT COUNTS AS DRIVING THE PAGE. Not "does it use Playwright" — every
// prodtest here does — but "does it act as a person's hand": a click, a
// drag, a wheel, a key. Reading the DOM and taking a screenshot is
// observation, and observation is device-independent in a way that input
// is not.
const INPUT = [
  /\bpage\.click\(/,
  /\.click\(\)/,
  /\bpage\.mouse\./,
  /\bpage\.keyboard\./,
  /\bpage\.fill\(/,
  /\bpage\.tap\(/,
  /\bpage\.hover\(/,
  /\bdispatchTouchEvent\b/,
  /\bpage\.selectOption\(/,
  /\bpage\.dragAndDrop\(/,
];

// EVIDENCE OF A SECOND DEVICE. A viewport list, several newContext calls
// with different sizes, or a touch context. Counting DISTINCT widths
// rather than occurrences: `{ width: 1280 }` written twice is one device.
function widthsIn(src) {
  const found = new Set();
  for (const m of src.matchAll(/width:\s*(\d{3,4})\b/g)) found.add(Number(m[1]));
  for (const m of src.matchAll(/\bWIDTHS\s*=\s*\[([^\]]*)\]/g)) {
    for (const n of m[1].matchAll(/\d{3,4}/g)) found.add(Number(n[0]));
  }
  return [...found].sort((a, b) => a - b);
}

// AND THE DISTINCTION INSIDE "DRIVES", which is the one that decides
// whether a missing touch device is a real gap or a chore.
//
// A CLICK IS A CLICK. `page.click()` on a button dispatches a pointer
// sequence the app handles identically whether a mouse or a finger
// produced it; running it again with hasTouch:true asserts the same
// thing twice and costs a build.
//
// A SCROLL IS NOT A SCROLL. A wheel emits discrete deltas whose events
// are dispatched promptly; a drag is continuous, keeps moving after the
// finger lifts, and interleaves differently with re-renders. That
// difference is not theoretical — it is the entire content of V4.6
// #11.1: with the follow fix reverted, all eleven of chat-scroll's
// desktop checks stayed green and the touch one went red.
//
// So the files that need a second device are the ones that SCROLL or
// DRAG, and those are the ones this file fails on.
const MOTION = [
  /\bpage\.mouse\.wheel\(/,
  /\bscrollTop\s*=/,
  /\bscrollBy\(/,
  /\bscrollIntoView\(/,
  /\bdragAndDrop\(/,
  /\bmouse\.down\(/,
];

const report = [];
for (const file of files) {
  const src = stripComments(readFileSync(join(DIR, file), "utf8"));
  const widths = widthsIn(src);
  const drives = INPUT.some((re) => re.test(src));
  const moves = MOTION.some((re) => re.test(src));
  const hasTouch = /hasTouch:\s*true/.test(src);
  const realTouch = /dispatchTouchEvent/.test(src);
  report.push({ file, widths, drives, moves, hasTouch, realTouch });
}

console.log(`== every prodtest, what it drives and what it drives it on (${report.length}) ==`);
check(
  `there are prodtests to census (${report.length})`,
  report.length >= 20,
  `${report.length} — a census over a handful says nothing about the suite`
);

const driving = report.filter((r) => r.drives);
const observing = report.filter((r) => !r.drives);

console.log(`\n-- DRIVES THE PAGE (${driving.length}) --`);
for (const r of driving.sort((a, b) => a.file.localeCompare(b.file))) {
  const mark = r.realTouch ? "touch+mouse" : r.hasTouch ? "touch flag only" : "mouse only";
  console.log(
    `  ${r.widths.length >= 2 ? "  " : "!!"} ${r.file.padEnd(38)} ${String(r.widths.length).padStart(2)} width(s) ${
      r.widths.join("/") || "—"
    }  ${mark}`
  );
}
console.log(`\n-- OBSERVES ONLY (${observing.length}) --`);
for (const r of observing.sort((a, b) => a.file.localeCompare(b.file))) {
  console.log(`     ${r.file.padEnd(38)} ${r.widths.join("/") || "—"}`);
}

// ---------------------------------------------------------------------
console.log("\n== the ratchet ==");
// SINGLE-VIEWPORT INTERACTION TESTS, held down rather than fixed in one
// pass. Each one is a separate piece of work — a touch driver, a mobile
// layout to understand, assertions that mean the same thing at 375px —
// and doing fourteen of them badly is worse than doing them one at a
// time. So the number may only go DOWN. Lower it in the same commit that
// adds the device; never raise it.
//
// THE NAMES ARE HERE, not just the count, because a count can be
// satisfied by fixing the easy ones. These are the files, and the two
// that were fixed first are the two the bugs came from.
const SINGLE_VIEWPORT_DRIVERS = driving.filter((r) => r.widths.length < 2).map((r) => r.file);
const MOUSE_ONLY_DRIVERS = driving.filter((r) => !r.realTouch).map((r) => r.file);
// THE ONES THAT MATTER: they move the page, and only a mouse has ever
// moved it.
const MOUSE_ONLY_MOTION = driving.filter((r) => r.moves && !r.realTouch).map((r) => r.file);

console.log(`        drives the page:               ${driving.length}`);
console.log(`        ...on a single viewport:       ${SINGLE_VIEWPORT_DRIVERS.length}`);
console.log(`        ...with a mouse only:          ${MOUSE_ONLY_DRIVERS.length}`);
console.log(`        ...MOVES the page, mouse only: ${MOUSE_ONLY_MOTION.length}  ${MOUSE_ONLY_MOTION.join(", ") || "none"}`);

// EVERY CEILING IS THE MEASURED NUMBER, not a round one. The first draft
// of this file wrote 15 for both, which was a guess: the real figures
// were 14 and 24, so one ceiling passed by luck and the other failed
// while describing nothing. A ratchet set to a number nobody counted is
// a ratchet that either does not bind or cries wolf.
//
// These may only go DOWN. Lower one in the same commit that adds the
// device; never raise one.
const SINGLE_VIEWPORT_CEILING = 14;
const MOUSE_ONLY_CEILING = 24;

check(
  `single-viewport interaction tests: ${SINGLE_VIEWPORT_DRIVERS.length}, ceiling ${SINGLE_VIEWPORT_CEILING}`,
  SINGLE_VIEWPORT_DRIVERS.length <= SINGLE_VIEWPORT_CEILING,
  SINGLE_VIEWPORT_DRIVERS.join(", ")
);
check(
  `mouse-only interaction tests: ${MOUSE_ONLY_DRIVERS.length}, ceiling ${MOUSE_ONLY_CEILING}`,
  MOUSE_ONLY_DRIVERS.length <= MOUSE_ONLY_CEILING,
  MOUSE_ONLY_DRIVERS.join(", ")
);
// AND THE ONE THAT IS ZERO, because this is the class the bug came from.
// A file that scrolls or drags and has never done it with a finger is
// making a claim it has not tested. No ratchet here and no
// grandfathering: the number is zero.
//
// A ZERO NEEDS A FLOOR UNDER IT, or it is the vacuity shape wearing a
// strict face. Measured: exactly TWO prodtests move the page at all, so
// "zero mouse-only movers" is a statement about two files and not about
// twenty-five. Printing both, with what each one does, is the only way
// the number can be read for what it is.
const MOVERS = report.filter((r) => r.moves);
console.log(`\n        every prodtest that moves the page (${MOVERS.length}):`);
for (const m of MOVERS) {
  console.log(
    `          ${m.file.padEnd(34)} ${m.drives ? "drives" : "observes"}  ` +
      `${m.realTouch ? "real touch" : "mouse only"}`
  );
}
check(
  `there are page-movers to check at all (${MOVERS.length})`,
  MOVERS.length >= 2,
  `${MOVERS.length} — "no mouse-only mover" over an empty set is true and worthless`
);
// chat-measure.prodtest.mjs moves the page and is NOT in this check, on
// purpose: it scrolls to bring text into view so it can be photographed,
// which is observation. It makes no claim about what happens when a
// person scrolls. chat-scroll.prodtest.mjs makes exactly that claim, and
// is the one that carries a real touch device.
check(
  `NO test that DRIVES the page moves it with a mouse alone (${MOUSE_ONLY_MOTION.length})`,
  MOUSE_ONLY_MOTION.length === 0,
  `${MOUSE_ONLY_MOTION.join(", ")} — each scrolls or drags and has only ever done so with a mouse. ` +
    "A wheel's scroll events are dispatched promptly and a thumb's are not; that difference is the whole of V4.6 #11.1."
);

// ---------------------------------------------------------------------
console.log("\n== the two that were fixed, named individually ==");
// A COUNT CAN BE SATISFIED BY THE WRONG TWO. These are the files the
// reported bugs came from, asserted by name so that losing either one's
// device is a decision rather than a drift in a total.
const byName = new Map(report.map((r) => [r.file, r]));
const scroll = byName.get("chat-scroll.prodtest.mjs");
check(
  "chat-scroll drives BOTH a desktop wheel and a real touch device",
  Boolean(scroll?.drives && scroll.widths.length >= 2 && scroll.realTouch),
  JSON.stringify(scroll)
);
check(
  "...and its touch is CDP-dispatched, not a dispatchEvent that scrolls nothing",
  Boolean(scroll?.realTouch),
  "a dispatched touch event is untrusted; the browser does not scroll for it and the test asserts about nothing"
);
const measure = byName.get("chat-measure.prodtest.mjs");
check(
  "chat-measure covers five widths",
  Boolean(measure && measure.widths.length >= 5),
  JSON.stringify(measure)
);

// AND THE INSTRUMENT ITSELF, on samples. A scanner that finds no input
// calls its way to a clean report.
console.log("\n== the scanner, on samples it must get right ==");
check("a click is driving", INPUT.some((re) => re.test("await page.click('#x');")));
check("a wheel is driving", INPUT.some((re) => re.test("await page.mouse.wheel(0, -400);")));
check("a CDP touch is driving", INPUT.some((re) => re.test('cdp.send("Input.dispatchTouchEvent", {})')));
check("a wheel MOVES the page", MOTION.some((re) => re.test("await page.mouse.wheel(0, -400);")));
check("a scrollTop assignment MOVES it too", MOTION.some((re) => re.test("el.scrollTop = 0;")));
check("a plain click does NOT move it", !MOTION.some((re) => re.test("await page.click('#x');")));
check(
  "a screenshot is NOT driving",
  !INPUT.some((re) => re.test("const shot = await page.screenshot();"))
);
check(
  "...nor is reading the DOM",
  !INPUT.some((re) => re.test("await page.evaluate(() => document.title);"))
);
check(
  "a click inside a comment is not a click",
  !INPUT.some((re) => re.test(stripComments("// await page.click('#x');\nconst a = 1;")))
);
check(
  "widths are counted DISTINCT, not per occurrence",
  JSON.stringify(widthsIn("width: 1280 ... width: 1280 ... width: 390")) === JSON.stringify([390, 1280]),
  JSON.stringify(widthsIn("width: 1280 ... width: 1280 ... width: 390"))
);

console.log(`\n${failures.length === 0 ? "ALL PASS" : "FAILURES"}: ${pass} passed, ${failures.length} failed`);
process.exit(failures.length === 0 ? 0 : 1);
