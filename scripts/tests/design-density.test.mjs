// HOW DENSE THIS PRODUCT IS ALLOWED TO BE.
//
// Redesign phase 4 asked for fewer lines, fewer boxes, more air and
// bigger type, and every one of those is a number before it is a
// judgement. scripts/design-census.mjs produces the numbers; this file
// is what stops them going back up.
//
// CEILINGS, NOT TARGETS. Each one is the count measured the day the
// change landed. Lowering a ceiling is free and needs no discussion;
// raising one needs a line here saying what was added and why, which is
// the only mechanism that has ever kept a number in this repository from
// drifting.
//
// AND TWO FLOORS, because the failure this repository keeps finding is
// not a red gate — it is a green one that measures nothing. A census
// that stops matching reports zero borders and zero frames, and zero is
// under every ceiling above. So the scan must also prove it still found
// the product.
//
// Run: node scripts/tests/design-density.test.mjs
import { census } from "../design-census.mjs";

let pass = 0;
const failures = [];
const ok = (name, cond, detail) => {
  if (cond) { pass++; console.log(`  PASS  ${name}`); }
  else { failures.push(name); console.log(`  FAIL  ${name}${detail !== undefined ? "\n        " + detail : ""}`); }
};

const r = census();
const type = Object.values(r.byType).reduce((a, b) => a + b, 0);
const small = r.byType["text-xs"] + r.byType["text-sm"];

console.log("== 1. the scan reached the product ==");
ok(`source files scanned (${r.files})`, r.files >= 800,
  "a census over a handful of files is under every ceiling below and means nothing");
ok(`frames found (${r.counts.frames})`, r.counts.frames >= 500,
  "zero frames passes every ceiling here — this floor is what makes the ceilings mean something");
ok(`sized text found (${type})`, type >= 800);

console.log("\n== 2. the lines ==");
// 683 the day phase 4 started (677 border utilities + 6 divide), 544
// after 140 card frames became .surface — see globals.css. The rest are
// NOT card noise and the breakdown is why this is not 342: 54 are
// inputs, ~144 are outline buttons and chips (which phase 4 asked for
// MORE of, not fewer), ~50 are status callouts whose border carries the
// meaning, and 13 are cards on the page colour that have no other
// separation.
//
// 560 -> 583, AND IT IS THE ONE DIRECTION THIS NUMBER IS NOT SUPPOSED TO
// MOVE, so the reason is here rather than in a commit message. Phase
// 4's other half — one filled accent control per screen — demoted 45
// buttons from a filled accent to an accent OUTLINE, and an outline is
// a border. It is the same 45 lines the clause above already names as
// the kind phase 4 asked for more of: every one of them REPLACED a
// filled orange rectangle rather than being added beside one, so the
// screens got quieter while this count went up. scripts/tests/
// one-primary-action.test.mjs is where that trade is measured from the
// other side; the number there went from 138 filled controls across the
// pages to 46, and then to 39 once the surfaces were told apart.
// No slack: 583 is the measured count, not a round number above it.
ok(`border utilities (${r.counts.borders}), ceiling 583`, r.counts.borders <= 583);
ok(`divide rules (${r.counts.divides}), ceiling 6`, r.counts.divides <= 6);

console.log("\n== 3. the glow and the gradient titles ==");
// ZERO, and the definition is in design-census.mjs: a glow is a BLURRED
// accent shadow. A `0 0 0 1px` ring is an edge and is not counted, which
// is why the sidebar's active row and the focus ring both survive.
ok(`blurred accent shadows (${r.counts.accentShadows}), forbidden`, r.counts.accentShadows === 0,
  "a title or a control that glows orange has no contrast ratio a checker can read");
ok(`gradient titles (${r.counts.gradientText}), forbidden`, r.counts.gradientText === 0);

console.log("\n== 4. the type scale ==");
// THE FINDING PHASE 4 STARTED FROM: 1,135 of 1,203 sized elements — 94%
// — were text-xs or text-sm. The classes did not move; what they MEAN
// did (tailwind.config.ts), so this ratio is expected to stay high and
// is recorded rather than gated. What IS gated is that the scale exists:
// a product with no element above text-base has no hierarchy to read.
console.log(`        ${small} of ${type} (${Math.round((100 * small) / type)}%) at the two smallest sizes`);
const big = type - small - r.byType["text-base"];
ok(`elements above text-base (${big})`, big >= 40,
  "every heading in the product would be within 2px of its body text");
ok("the scale is declared in the config, not per component",
  /fontSize:\s*\{[\s\S]*?xs:\s*\["0\.8125rem"/.test(
    (await import("node:fs")).readFileSync("tailwind.config.ts", "utf8")));
ok("...and in rem, so the Settings font-size control still scales it",
  !/fontSize:\s*\{[\s\S]{0,600}?\d+px/.test(
    (await import("node:fs")).readFileSync("tailwind.config.ts", "utf8")),
  "a px scale switches off html { font-size: var(--app-font-size) }");

console.log("\n== 5. the card is declared once ==");
const css = (await import("node:fs")).readFileSync("src/app/globals.css", "utf8");
ok("globals.css declares .surface", /\.surface\s*\{/.test(css));
ok("...and .surface-tight", /\.surface-tight\s*\{/.test(css));
ok("...and lifts a nested one so it does not vanish",
  /\.surface\s+\.surface[\s,]/.test(css),
  "a borderless panel inside a borderless panel is the same colour with no line between them");
ok("...with the phase 4 padding, in rem",
  /\.surface\s*\{[^}]*p-\[1\.75rem\]/.test(css) && /\.surface-tight\s*\{[^}]*p-\[1\.5rem\]/.test(css),
  "28px where the card was p-5 (20px) is +40%; 24px where it was p-4 (16px) is +50%");

console.log(`\n${failures.length === 0 ? "ALL PASS" : "FAILURES"}: ${pass} passed, ${failures.length} failed`);
process.exit(failures.length === 0 ? 0 : 1);
