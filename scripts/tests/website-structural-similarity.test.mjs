// "Τα sites μοιάζουν ακόμα σαν το ίδιο template" — the fifth report, and
// the first time it is a NUMBER rather than an opinion.
//
// Everything in this file is measured, nothing is asserted from hope. It
// does two separate jobs and keeps them apart on purpose:
//
//   PART A validates the metric itself against pages whose relationship is
//   known by construction (identical, re-skinned, reordered, different).
//   A metric nobody checked is just another opinion with a decimal point.
//
//   PART B measures the REAL prompt and the REAL draw: the 21 section
//   plans the builder can be told to build, and the letters the variation
//   draw actually hands out over a user's next 30 sites.
//
// WHAT IT CANNOT DO, stated rather than implied: it cannot generate three
// real sites and compare them, because that needs an ANTHROPIC_API_KEY and
// outbound network, and this environment has neither. Part B therefore
// measures the diversity the system GUARANTEES IF the model obeys the
// order it is given — an upper bound on sameness from the input side, not
// a measurement of finished pages.
//
// Run: node scripts/tests/website-structural-similarity.test.mjs
import { readFileSync } from "node:fs";
import { loadTs } from "./load-ts.mjs";

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

const { compareStructure, compareTokenSequences, structuralSignature, averagePairwiseSimilarity } =
  await loadTs("src/lib/website-structural-similarity.ts");
const { pickVariation } = await loadTs("src/lib/website-variation.ts");

// ===========================================================================
console.log("== PART A: the metric, against pages whose relationship is known ==\n");

const HERO_FIRST = `<!doctype html><html><body>
  <header><nav><ul><li><a>Menu</a></li></ul></nav></header>
  <main>
    <section><img src="a.jpg"><h1>Taverna</h1></section>
    <section><h2>Menu</h2><ul><li>Souvlaki</li></ul></section>
    <section><h2>Find us</h2><iframe src="map"></iframe></section>
    <section><h2>Gallery</h2><figure><img src="b.jpg"></figure></section>
  </main>
  <footer><p>© 2026</p></footer>
</body></html>`;

// Same page, different paint: colours, fonts, wording, class names. Not one
// structural element moved.
const RESKINNED = HERO_FIRST
  .replace(/Taverna/g, "Ταβέρνα το Στέκι")
  .replace(/<section>/g, `<section class="pt-32 bg-emerald-900 font-serif">`)
  .replace(/Souvlaki/g, "Μπριάμ");

// Same ingredients, served in a different order — this is exactly what an
// ORDER letter changes.
const MENU_FIRST = `<!doctype html><html><body>
  <header><nav><ul><li><a>Menu</a></li></ul></nav></header>
  <main>
    <section><h2>Menu</h2><ul><li>Souvlaki</li></ul></section>
    <section><img src="a.jpg"><h1>Taverna</h1></section>
    <section><h2>Gallery</h2><figure><img src="b.jpg"></figure></section>
    <section><h2>Find us</h2><iframe src="map"></iframe></section>
  </main>
  <footer><p>© 2026</p></footer>
</body></html>`;

// A different archetype entirely: a text-led professional page. No photos,
// no map, a form instead of a gallery.
const LAW_OFFICE = `<!doctype html><html><body>
  <header><h1>Papadopoulos &amp; Partners</h1></header>
  <main>
    <article><h2>Practice areas</h2><ol><li>Corporate</li></ol></article>
    <article><h2>Credentials</h2><table><tr><td>1998</td></tr></table></article>
    <article><h2>People</h2><h3>Maria</h3><h3>Nikos</h3></article>
    <form><button>Send</button></form>
  </main>
  <footer><p>Contact</p></footer>
</body></html>`;

const same = compareStructure(HERO_FIRST, HERO_FIRST);
check(`a page against itself is 1.000 (${same.similarity.toFixed(3)})`, same.similarity === 1);
check(
  "the signature is not empty (it would make everything score 1)",
  structuralSignature(HERO_FIRST).length >= 15,
  `${structuralSignature(HERO_FIRST).length} tokens`
);
check(
  "symmetric",
  compareStructure(HERO_FIRST, LAW_OFFICE).similarity === compareStructure(LAW_OFFICE, HERO_FIRST).similarity
);

const reskin = compareStructure(HERO_FIRST, RESKINNED);
check(
  `a re-skin is still the same page: 1.000 (${reskin.similarity.toFixed(3)})`,
  reskin.similarity === 1,
  "if this drops, the metric is measuring paint, not structure"
);

const reorder = compareStructure(HERO_FIRST, MENU_FIRST);
check(
  `reordering the SAME sections lowers the score (${reorder.similarity.toFixed(3)} < 1)`,
  reorder.similarity < 1
);
check(
  `…while composition stays 1.000, because nothing was added or removed (${reorder.composition.toFixed(3)})`,
  reorder.composition === 1
);

const different = compareStructure(HERO_FIRST, LAW_OFFICE);
check(
  `a different archetype scores below a reorder (${different.similarity.toFixed(3)} < ${reorder.similarity.toFixed(3)})`,
  different.similarity < reorder.similarity
);
check(
  `…and below 0.3, the owner's target for "these are not the same template" (${different.similarity.toFixed(3)})`,
  different.similarity < 0.3,
  "measured, not tuned: no weights exist in this metric to turn"
);
check(
  "two empty documents are identical, not divided by zero",
  compareTokenSequences([], []).similarity === 1
);
check("a page against nothing scores 0", compareTokenSequences(["header"], []).similarity === 0);
check("…and nothing against a page scores 0, the same way", compareTokenSequences([], ["header"]).similarity === 0);

// A one-section page and a ten-section page are not the same page, and the
// score for them must still be a score: normalising by the SHORTER of the
// two sequences puts it outside 0..1 and makes a short page look like a
// perfect match for any long one that starts the same way.
const SHORT = ["header", "main", "footer"];
const LONG = ["header", "main", "section", "h2", "section", "h2", "section", "h2", "footer"];
const lengthMismatch = compareTokenSequences(SHORT, LONG);
check(
  `a short page against a long one stays inside 0..1 (${lengthMismatch.similarity.toFixed(3)})`,
  lengthMismatch.similarity >= 0 && lengthMismatch.similarity <= 1,
  JSON.stringify(lengthMismatch)
);
check(
  `…and is not scored as a match (${lengthMismatch.similarity.toFixed(3)} < 0.6)`,
  lengthMismatch.similarity < 0.6
);
check(
  "every comparison in this file is inside 0..1",
  [
    compareStructure(HERO_FIRST, LAW_OFFICE),
    compareStructure(HERO_FIRST, MENU_FIRST),
    compareStructure(LAW_OFFICE, RESKINNED),
    compareTokenSequences(LONG, SHORT),
  ].every((c) => c.similarity >= 0 && c.similarity <= 1 && c.composition >= 0 && c.composition <= 1)
);

// The signature written out in full, because every property above depends
// on it being this and not something else. Opening tags only: counting the
// closing ones too doubles every token, which makes every page look more
// like every other page — and no assertion phrased as a ratio can see that.
const EXPECTED_SIGNATURE = [
  "header", "nav", "ul",
  "main",
  "section", "img", "h1",
  "section", "h2", "ul",
  "section", "h2", "iframe",
  "section", "h2", "figure", "img",
  "footer",
];
check(
  "the signature is exactly the landmarks, in document order, opening tags only",
  JSON.stringify(structuralSignature(HERO_FIRST)) === JSON.stringify(EXPECTED_SIGNATURE),
  JSON.stringify(structuralSignature(HERO_FIRST))
);
check(
  "markup inside a <script> is not structure",
  JSON.stringify(
    structuralSignature(HERO_FIRST.replace("<main>", `<script>const t = "<section><h2><footer>";</script><main>`))
  ) === JSON.stringify(EXPECTED_SIGNATURE)
);
check(
  "…nor inside a <style>, or an inline <svg>",
  JSON.stringify(
    structuralSignature(
      HERO_FIRST.replace("<main>", `<style>section{}</style><svg><figure></figure></svg><main>`)
    )
  ) === JSON.stringify(EXPECTED_SIGNATURE)
);

// ===========================================================================
console.log("\n== PART B1: the 21 section plans the prompt can actually order ==\n");

// Parsed out of the SHIPPED prompt, not retyped here — if someone deletes
// an ORDER line, this measurement changes with it.
const prompt = readFileSync("src/lib/website-builder.ts", "utf8");
const plans = [];
let shape = null;
for (const line of prompt.split("\n")) {
  const shapeMatch = line.match(/^- ([a-z][a-z-]+):/);
  if (shapeMatch) {
    shape = shapeMatch[1];
    continue;
  }
  const orderMatch = line.trim().match(/^ORDER ([ABC]):\s*(.+?)\.?$/);
  if (orderMatch && shape) {
    plans.push({
      shape,
      letter: orderMatch[1],
      sections: orderMatch[2].split(">").map((s) => s.trim()).filter(Boolean),
    });
  }
}
const shapes = [...new Set(plans.map((p) => p.shape))];
check(`21 plans found in the prompt (${plans.length})`, plans.length === 21, JSON.stringify(shapes));
check(`across 7 archetypes (${shapes.length})`, shapes.length === 7);
check(
  "every archetype offers all three letters",
  shapes.every((s) => ["A", "B", "C"].every((l) => plans.some((p) => p.shape === s && p.letter === l)))
);

const sameShapePairs = [];
for (let i = 0; i < plans.length; i++) {
  for (let j = i + 1; j < plans.length; j++) {
    if (plans[i].shape !== plans[j].shape) continue;
    sameShapePairs.push({
      pair: `${plans[i].shape} ${plans[i].letter}/${plans[j].letter}`,
      score: compareTokenSequences(plans[i].sections, plans[j].sections).similarity,
    });
  }
}
for (const s of shapes) {
  const mine = sameShapePairs.filter((p) => p.pair.startsWith(`${s} `));
  console.log(`     ${s.padEnd(22)} ${mine.map((m) => `${m.pair.split(" ")[1]}=${m.score.toFixed(2)}`).join("  ")}`);
}
const scores = sameShapePairs.map((p) => p.score);
const mean = scores.reduce((a, b) => a + b, 0) / scores.length;
const worst = sameShapePairs.reduce((a, b) => (b.score > a.score ? b : a));
console.log(
  `\n     mean ${mean.toFixed(3)}  worst ${worst.score.toFixed(3)} (${worst.pair})  n=${scores.length}\n`
);
check(
  `no two orders of one archetype are the same plan (worst ${worst.score.toFixed(3)} < 1)`,
  worst.score < 1,
  worst.pair
);
check(
  `the three orders are genuinely different plans, on average (mean ${mean.toFixed(3)} ≤ 0.50)`,
  mean <= 0.5,
  "a rise here means the orders drifted back towards one another"
);
check(
  `and no single pair is near-identical (worst ${worst.score.toFixed(3)} ≤ 0.65)`,
  worst.score <= 0.65,
  worst.pair
);

// ===========================================================================
console.log("\n== PART B2: what the draw actually hands out ==\n");

const letterOf = (v) => v.order.trim()[0];
for (const description of ["a taverna in Thessaloniki", "a law office", "a wedding photographer"]) {
  const sequence = Array.from({ length: 30 }, (_, i) => letterOf(pickVariation(["user-1", i, description])));
  const counts = sequence.reduce((acc, c) => ((acc[c] = (acc[c] ?? 0) + 1), acc), {});
  const commonest = Math.max(...Object.values(counts));
  console.log(`     ${description.padEnd(28)} ${sequence.join("")}  ${JSON.stringify(counts)}`);
  check(
    `${description}: all three orders appear over 30 sites`,
    Object.keys(counts).length === 3,
    JSON.stringify(counts)
  );
  check(
    `${description}: no order takes more than half (${commonest}/30)`,
    commonest <= 15,
    JSON.stringify(counts)
  );
}

// Before the ORDER axis existed, the section order was not drawn at all:
// two sites of the same subject were built from the same single list, so
// this number was 1.000 by construction. This is what it is now.
const AXES = ["hero", "grid", "rhythm", "typeScale", "motion", "order"];
const draws = Array.from({ length: 60 }, (_, i) => pickVariation([`user-${i}`, 0, "a taverna in Thessaloniki"]));
let identical = 0;
let sameOrder = 0;
let pairs = 0;
let sharedTotal = 0;
for (let i = 0; i < draws.length; i++) {
  for (let j = i + 1; j < draws.length; j++) {
    pairs++;
    const shared = AXES.filter((a) => draws[i][a] === draws[j][a]).length;
    sharedTotal += shared;
    if (shared === AXES.length) identical++;
    if (draws[i].order === draws[j].order) sameOrder++;
  }
}
console.log(
  `\n     60 users, identical brief, first site each: identical on all six axes ${identical}/${pairs}` +
    ` (${((identical / pairs) * 100).toFixed(2)}%)`
);
console.log(
  `     same SECTION ORDER: ${sameOrder}/${pairs} (${((sameOrder / pairs) * 100).toFixed(1)}%)` +
    `  ·  mean shared axes ${(sharedTotal / pairs).toFixed(2)} of 6\n`
);
check(
  `two users with the same brief rarely draw the same site: ${((identical / pairs) * 100).toFixed(2)}% ≤ 1%`,
  identical / pairs <= 0.01
);
check(
  `the structural axis is drawn, not fixed: same order in ${((sameOrder / pairs) * 100).toFixed(1)}% of pairs, not 100%`,
  sameOrder / pairs < 0.45,
  "1/3 is the floor for a three-way draw; 100% is what it was before the axis existed"
);
check(
  `on average two sites share ${(sharedTotal / pairs).toFixed(2)} of 6 axes (≤ 2.5)`,
  sharedTotal / pairs <= 2.5
);

// ===========================================================================
console.log("\n== PART B3: the draw reaches the prompt ==\n");
const variationSrc = readFileSync("src/lib/website-variation.ts", "utf8");
check("the ORDER axis is part of the drawn variation", /order:\s*pick\(SECTION_ORDERS/.test(variationSrc));
check(
  "and the prompt tells the model the letter is not negotiable",
  /not a suggestion and it is not a tie-break/.test(prompt)
);

console.log(`\n${failures.length === 0 ? "ALL PASS" : "FAILURES"}: ${pass} passed, ${failures.length} failed`);
if (failures.length) process.exit(1);
