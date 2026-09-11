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
import { parseShapeOrders } from "./lib/site-shape-orders.mjs";

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
const { pickVariation, SECTION_ORDERS } = await loadTs("src/lib/website-variation.ts");

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
console.log("\n== PART B1: the 42 section plans the prompt can actually order ==\n");

// Parsed out of the SHIPPED prompt, not retyped here — if someone deletes
// an ORDER, this measurement changes with it. The parser is shared with
// website-variety.test.mjs; see scripts/tests/lib/site-shape-orders.mjs
// for why the prompt numbers its sections instead of spelling each order
// out in prose.
const prompt = readFileSync("src/lib/website-builder.ts", "utf8");
const plans = parseShapeOrders(prompt);
const shapes = [...new Set(plans.map((p) => p.shape))];
const LETTERS = ["A", "B", "C", "D", "E", "F"];
check(`42 plans found in the prompt (${plans.length})`, plans.length === 42, JSON.stringify(shapes));
check(`across 7 archetypes (${shapes.length})`, shapes.length === 7);
check(
  "every archetype offers all six letters",
  shapes.every((s) => LETTERS.every((l) => plans.some((p) => p.shape === s && p.letter === l))),
  shapes.filter((s) => !LETTERS.every((l) => plans.some((p) => p.shape === s && p.letter === l))).join(", ")
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
  console.log(`     ${s.padEnd(22)} mean ${(mine.reduce((a, b) => a + b.score, 0) / mine.length).toFixed(2)} over ${mine.length} pairs`);
}
const scores = sameShapePairs.map((p) => p.score);
const mean = scores.reduce((a, b) => a + b, 0) / scores.length;
const worst = sameShapePairs.reduce((a, b) => (b.score > a.score ? b : a));

// THE NUMBER THAT ANSWERS THE COMPLAINT, and the mean above is not it.
//
// `mean` is the average over pairs of DIFFERENT letters. It leaves out
// the case the whole round is about: two people drawing the SAME letter,
// where the similarity is 1.000 by construction. Three orders made that
// happen a third of the time; six make it a sixth. So the honest figure
// is the expected similarity between two strangers' skeletons, collisions
// included:
//
//   E = P(same letter) x 1.0 + P(different) x mean-over-different
//
// before (3 orders):  1/3 x 1.000 + 2/3 x 0.490 = 0.660
// after  (6 orders):  1/6 x 1.000 + 5/6 x 0.509 = 0.591
//
// AND THIS IS WHY THE PER-PAIR MEAN WENT UP while the answer got better.
// With three letters you can choose the three most distant permutations;
// with six you must take the whole space, near neighbours included. A
// gate on `mean` alone would have called using more of the space a
// regression, which is the shape docs/shapes.md calls a gate measuring
// the thing that is easy to measure.
const collision = 1 / 6;
const expected = collision * 1 + (1 - collision) * mean;
console.log(
  `\n     over different letters: mean ${mean.toFixed(3)}  worst ${worst.score.toFixed(3)} (${worst.pair})  n=${scores.length}` +
    `\n     EXPECTED between two strangers, collisions included: ${expected.toFixed(3)}  (three orders gave 0.660)\n`
);
check(
  `no two orders of one archetype are the same plan (worst ${worst.score.toFixed(3)} < 1)`,
  worst.score < 1,
  worst.pair
);
check(
  `two strangers' skeletons score ${expected.toFixed(3)} on average (<= 0.62)`,
  expected <= 0.62,
  "three orders gave 0.660; a rise here means the space shrank or the orders drifted together"
);
check(
  `and no single pair is near-identical (worst ${worst.score.toFixed(3)} <= 0.65)`,
  worst.score <= 0.65,
  worst.pair
);

// ===========================================================================
console.log("\n== PART B2: what the draw actually hands out ==\n");

const letterOf = (v) => v.order.trim()[0];
// THE PRODUCTION PATH, WHICH IS THE CYCLE. pickVariation still accepts a
// bare seed — the two measurement scripts have no user behind them — but
// the route passes `cycle`, so a test that omits it measures a code path
// nobody is served by. Section B3 below checks that the route really
// passes it.
const forUser = (user, n, description) =>
  pickVariation([user, n, description], { userKey: user, priorSites: n });

for (const description of ["a taverna in Thessaloniki", "a law office", "a wedding photographer"]) {
  const sequence = Array.from({ length: 30 }, (_, i) => letterOf(forUser("user-1", i, description)));
  const counts = sequence.reduce((acc, c) => ((acc[c] = (acc[c] ?? 0) + 1), acc), {});
  console.log(`     ${description.padEnd(28)} ${sequence.join("")}  ${JSON.stringify(counts)}`);
  check(
    `${description}: all six orders appear over 30 sites`,
    Object.keys(counts).length === SECTION_ORDERS.length,
    JSON.stringify(counts)
  );
  // THE PROMISE THE CYCLE MAKES, AND THE ONE A DRAW COULD NOT.
  //
  // This was a probabilistic check when the order was hashed like every
  // other axis, and the numbers were bad: measured over 4,000 constructed
  // people, 59.9% of their second-to-fifth sites repeated a skeleton they
  // already had, and 1.0% got the same order five times running. A fair
  // die repeats; that is what dice do.
  //
  // The order is now drawn once per person and stepped. So this is an
  // exact statement about a real person's first six sites, and it is
  // asserted as one rather than as a percentage with slack in it.
  const firstCycle = Array.from({ length: SECTION_ORDERS.length }, (_, i) =>
    letterOf(forUser("user-1", i, description))
  );
  check(
    `${description}: one person's first ${SECTION_ORDERS.length} sites use every order exactly once`,
    new Set(firstCycle).size === SECTION_ORDERS.length,
    firstCycle.join("")
  );
  // ...AND THE BALANCE IS NOW EXACT, not "within sampling error". A cycle
  // over 600 consecutive sites gives each letter exactly 100. The old
  // check allowed a 40% share because a hash genuinely wanders; allowing
  // that here would pass a draw that had silently gone back to hashing.
  const large = Array.from({ length: 600 }, (_, i) => letterOf(forUser("user-1", i, description)));
  const largeCounts = large.reduce((acc, c) => ((acc[c] = (acc[c] ?? 0) + 1), acc), {});
  const shares = Object.values(largeCounts);
  check(
    `${description}: 600 sites split exactly evenly (${shares.join("/")})`,
    shares.length === SECTION_ORDERS.length && shares.every((n) => n === 600 / SECTION_ORDERS.length),
    JSON.stringify(largeCounts)
  );
}

// Before the ORDER axis existed, the section order was not drawn at all:
// two sites of the same subject were built from the same single list, so
// this number was 1.000 by construction. This is what it is now.
const AXES = ["hero", "grid", "rhythm", "typeScale", "motion", "order"];
const draws = Array.from({ length: 60 }, (_, i) => forUser(`user-${i}`, 0, "a taverna in Thessaloniki"));
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
// THE NUMBER TWO DIFFERENT PEOPLE CANNOT ESCAPE, and it is stated as the
// arithmetic it is: their draws cannot see each other, so the floor is
// 1/SECTION_ORDER_COUNT and nothing in this repository can lower it
// without remembering what every account was given. Three orders made
// that floor 33.3%; six make it 16.7%. Measured over 20,000 constructed
// pairs in scripts/tests/section-order-space.test.mjs, which is where the
// before-and-after numbers live.
check(
  `the structural axis is drawn, not fixed: same order in ${((sameOrder / pairs) * 100).toFixed(1)}% of pairs, not 100%`,
  sameOrder / pairs < 0.28,
  `1/${SECTION_ORDERS.length} = ${((100 / SECTION_ORDERS.length)).toFixed(1)}% is the floor for two strangers; 100% is what it was before the axis existed`
);
check(
  `on average two sites share ${(sharedTotal / pairs).toFixed(2)} of 6 axes (≤ 2.5)`,
  sharedTotal / pairs <= 2.5
);

// ===========================================================================
console.log("\n== PART B3: the draw reaches the prompt ==\n");
const variationSrc = readFileSync("src/lib/website-variation.ts", "utf8");
check(
  "the ORDER axis walks a cycle rather than drawing independently",
  /order: cycle\s*\?\s*SECTION_ORDERS\[orderIndexFor\(/.test(variationSrc)
);
// AN EXCLUSION THAT IS COMPUTED AND NOT DELIVERED IS NOT AN EXCLUSION.
// lib/website-variation.ts's own header records this repository shipping
// exactly that once — four visual axes were drawn and left out of the
// directive, and every gate stayed green because every gate checked that
// the axes EXISTED. The cycle is optional in the function signature, so
// the only thing that makes it real is the route passing it.
const routeSrc = readFileSync("src/app/api/websites/generate/process/route.ts", "utf8");
check(
  "the process route hands the cycle to the draw",
  /pickVariation\(\[user\.id, priorSites \?\? 0, description\], \{\s*userKey: user\.id,\s*priorSites: priorSites \?\? 0,\s*\}\)/.test(routeSrc)
);
check(
  "and the prompt tells the model the letter is not negotiable",
  /not a suggestion and it is not a tie-break/.test(prompt)
);

// ===========================================================================
console.log("\n== PART C: the produced page is measured, not trusted ==\n");
// THE DIRECTIVE IS AN INSTRUCTION, AND RULE 23 OF THIS PROJECT'S WORKING
// RULES IS THAT AN INSTRUCTION A MODEL CAN IGNORE WILL BE IGNORED.
//
// Everything above is about the space of orders the model is TOLD to
// build. None of it is evidence that the page that came back has the
// structure it was asked for — the same reason
// lib/websites-greek-spelling-check.ts is a check and not a prompt line.
// So the route compares the produced page against the person's previous
// one and writes a note when they are the same skeleton.
{
  const similarity = await loadTs("src/lib/website-structural-similarity.ts");
  const notes = await loadTs("src/lib/website-generation-notes.ts");

  // ONE PLACE FOR THE THRESHOLD. It was a local constant in
  // website-pairs-check.mjs carrying a comment about not drifting from
  // website-variety-check.mjs, which is two copies; the route made three.
  check("the same-skeleton line is exported from the module that measures it", similarity.SAME_SKELETON === 0.85);
  check("...and the similar-skeleton line with it", similarity.SIMILAR_SKELETON === 0.7);
  const pairsScript = readFileSync("scripts/website-pairs-check.mjs", "utf8");
  check(
    "the pairs script reads them instead of restating them",
    /const \{ SAME_SKELETON, SIMILAR_SKELETON \} = structural;/.test(pairsScript) &&
      !/^const SAME_SKELETON = /m.test(pairsScript)
  );

  check(
    "the route compares the new page against the previous one",
    /compareStructure\(htmlContent, previousHtml\)/.test(routeSrc)
  );
  check("...and raises the note above the shared threshold", /similarity >= SAME_SKELETON/.test(routeSrc));
  check(
    "...reading the previous site from the same owner only",
    /\.eq\("user_id", user\.id\)[\s\S]{0,200}?\.neq\("id", websiteId\)/.test(routeSrc)
  );
  // NEVER FAILS THE GENERATION. The owner has already paid for the page;
  // a courtesy note that throws would lose it.
  check(
    "...inside a try/catch that logs instead of throwing",
    /stage: "sameSkeleton"/.test(routeSrc)
  );
  // AND NEVER REGENERATES. Two branches of one shop SHOULD match.
  check(
    "the route does not regenerate on a match",
    !/sameSkeleton[\s\S]{0,400}generateWebsiteHtml/.test(routeSrc)
  );

  // THE COLUMN IS READ DEFENSIVELY, like every other note.
  const good = notes.parseGenerationNotes([{ kind: "sameSkeleton", percent: 92, against: "Καφέ Λιμάνι" }]);
  check("a well-formed note survives the parse", good.length === 1 && good[0].percent === 92);
  for (const bad of [
    { kind: "sameSkeleton", percent: 0, against: "x" },
    { kind: "sameSkeleton", percent: 101, against: "x" },
    { kind: "sameSkeleton", percent: 92.5, against: "x" },
    { kind: "sameSkeleton", percent: 92, against: "   " },
    { kind: "sameSkeleton", percent: "92", against: "x" },
    { kind: "sameSkeleton", against: "x" },
  ]) {
    check(`malformed note dropped: ${JSON.stringify(bad)}`, notes.parseGenerationNotes([bad]).length === 0);
  }
  check(
    "a very long name is cut rather than rendered whole",
    notes.parseGenerationNotes([{ kind: "sameSkeleton", percent: 90, against: "x".repeat(500) }])[0].against.length === 80
  );

  // IT REACHES A PERSON, IN THEIR LANGUAGE. A note nothing renders is a
  // column nobody reads.
  const workspace = readFileSync("src/components/website-builder/website-builder-workspace.tsx", "utf8");
  check('the workspace has a case for it', /case "sameSkeleton":/.test(workspace));
  check("...and passes both values to the translation", /notes\.sameSkeleton", \{ percent: note\.percent, name: note\.against \}/.test(workspace));
  for (const locale of ["en", "el", "es", "fr", "de", "it", "pt", "zh", "ja", "ar"]) {
    const text = JSON.parse(readFileSync(`messages/${locale}.json`, "utf8"))
      .dashboard.websiteBuilder.notes.sameSkeleton;
    check(
      `${locale}: the note exists and carries both placeholders`,
      typeof text === "string" && text.includes("{name}") && text.includes("{percent}"),
      String(text).slice(0, 60)
    );
    // ICU: a single-quoted placeholder is LITERAL TEXT in every language
    // — the mistake CLAUDE.md records shipping. scripts/check-i18n.js
    // fails the build on it; checked here too because this key was added
    // in ten languages at once.
    check(`${locale}: the placeholders are not quote-escaped`, !/'\{(name|percent)\}'/.test(text));
  }
}

console.log(`\n${failures.length === 0 ? "ALL PASS" : "FAILURES"}: ${pass} passed, ${failures.length} failed`);
if (failures.length) process.exit(1);
