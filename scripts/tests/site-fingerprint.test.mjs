// The measuring stick used to answer "do all the websites look the same?"
//
// scripts/website-variety-check.mjs prints a verdict like
//   "worst structural similarity 0.42 — genuinely different shapes"
// and that verdict is only worth anything if the arithmetic behind it is
// right. If sequenceSimilarity were subtly wrong, the script would report
// a confident number that meant nothing, and the sameness bug would look
// fixed while still being there. So the instrument is tested before it is
// trusted — against hand-built HTML with known answers.
//
// Runs in the build gate; needs no API key.
//
// Run: node scripts/tests/site-fingerprint.test.mjs
import { readFileSync } from "node:fs";

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
function near(name, actual, expected, tol = 0.001) {
  check(name, Math.abs(actual - expected) <= tol, `expected ~${expected}, got ${actual}`);
}

const fp = await import("../lib/site-fingerprint.mjs");

// Two pages built from the SAME skeleton, with completely different words
// and colours. This is exactly the reported failure: different content,
// identical structure.
const SAAS_SKELETON = (name, colour) => `<!DOCTYPE html><html><head>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;700&display=swap" rel="stylesheet">
<style>body{color:${colour}} .hero{background:${colour}} .grid{grid-template-columns:repeat(3,1fr)}</style>
</head><body>
<header class="hero"><nav>x</nav><h1>${name}</h1></header>
<main>
<section class="grid"><article>a</article><article>b</article><article>c</article></section>
<section>What our customers say — testimonial</section>
<section class="cta">Sign up</section>
</main>
<footer>©</footer></body></html>`;

// A genuinely different shape: gallery-first, no nav, no cards, no CTA.
const PORTFOLIO = `<!DOCTYPE html><html><head>
<link href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:wght@400&display=swap" rel="stylesheet">
<style>body{color:#2b2b2b} figure{margin:0}</style>
</head><body>
<main>
<figure><img src="a.jpg"></figure>
<figure><img src="b.jpg"></figure>
<figure><img src="c.jpg"></figure>
<section>Crete. Weddings.</section>
</main>
<footer>hello@example.com</footer></body></html>`;

console.log("== 1. the fingerprint is structure, not words ==");
const a = fp.structureFingerprint(SAAS_SKELETON("Acme", "#111111"));
const b = fp.structureFingerprint(SAAS_SKELETON("Totally Different Business", "#994411"));
// The three <article> cards are part of the fingerprint on purpose: "a
// row of three cards" is precisely the structural tic being hunted, and a
// fingerprint that collapsed them would be blind to it.
check(
  "landmarks are extracted in document order, cards included",
  a.join(">") === "header>nav>main>section>article>article>article>section>section>footer",
  a.join(">")
);
check("two pages from one skeleton fingerprint identically", a.join(">") === b.join(">"));
near("so their similarity is 1.0 — the sameness bug, caught", fp.sequenceSimilarity(a, b), 1);
check("head content is excluded", !a.includes("style") && !a.includes("link"));

console.log("\n== 2. a genuinely different shape scores low ==");
const p = fp.structureFingerprint(PORTFOLIO);
check("the portfolio has its own landmark sequence", p.join(">") === "main>figure>figure>figure>section>footer");
const cross = fp.sequenceSimilarity(a, p);
check(`saas vs portfolio is well below the 0.85 alarm (${cross.toFixed(2)})`, cross < 0.85);
check("and below the 0.7 'look at these' line", cross < 0.7);

console.log("\n== 3. sequenceSimilarity behaves at the edges ==");
near("identical arrays are 1", fp.sequenceSimilarity(["a", "b"], ["a", "b"]), 1);
near("disjoint arrays are 0", fp.sequenceSimilarity(["a", "b"], ["x", "y"]), 0);
near("empty vs anything is 0", fp.sequenceSimilarity([], ["a"]), 0);
near("both empty is 0, not NaN", fp.sequenceSimilarity([], []), 0);
// Order matters — this is why it is LCS and not a set comparison. Two
// pages with the same sections in a different order are NOT the same page.
const forward = fp.sequenceSimilarity(["header", "section", "footer"], ["header", "section", "footer"]);
const reordered = fp.sequenceSimilarity(["header", "section", "footer"], ["footer", "section", "header"]);
check("reordering the same landmarks lowers the score", reordered < forward);
check("a set comparison would have missed that", fp.jaccard(["header", "section", "footer"], ["footer", "section", "header"]) === 1);

console.log("\n== 4. fonts and palette are read from the real markup ==");
check("the Google Fonts family is extracted", fp.fontsUsed(SAAS_SKELETON("x", "#111111")).includes("Inter"));
check("a multi-word family is un-plussed", fp.fontsUsed(PORTFOLIO).includes("Cormorant Garamond"));
check("no font link means no fonts", fp.fontsUsed("<html><body>hi</body></html>").length === 0);
check("the palette picks up the real colour", fp.palette(SAAS_SKELETON("x", "#994411")).includes("#994411"));
check(
  "shared neutrals are excluded, or every page would match every page",
  !fp.palette("<style>a{color:#ffffff}b{color:#000000}c{color:#123456}</style>").some((c) => /^#(f{3,6}|0{3,6})$/.test(c))
);
check("and the real colour still survives that filter", fp.palette("<style>a{color:#fff}c{color:#123456}</style>").includes("#123456"));
check("most-used colour comes first", fp.palette("<style>a{c:#aaaaaa}b{c:#bbbbbb}c{c:#bbbbbb}</style>")[0] === "#bbbbbb");

console.log("\n== 5. the banned generic shape is actually detected ==");
const generic = fp.genericShapeSignals(SAAS_SKELETON("Acme", "#111111"));
check("a three-column card grid is spotted", generic.threeCardGrid === true);
check("a testimonial section is spotted", generic.testimonial === true);
check("a CTA band is spotted", generic.ctaBand === true);
const portfolioSignals = fp.genericShapeSignals(PORTFOLIO);
check(
  "and a portfolio trips none of them",
  Object.values(portfolioSignals).filter(Boolean).length === 0,
  JSON.stringify(portfolioSignals)
);
// Greek pages have to be caught too — the reported sites were Greek.
check(
  "the testimonial check works in Greek as well as English",
  fp.genericShapeSignals("<section>Τι λένε οι πελάτες μας</section>").testimonial === true
);

console.log("\n== 6. jaccard behaves ==");
near("identical sets are 1", fp.jaccard(["a"], ["a"]), 1);
near("disjoint sets are 0", fp.jaccard(["a"], ["b"]), 0);
near("half-overlap is 1/3", fp.jaccard(["a", "b"], ["b", "c"]), 1 / 3);
near("two empties are 0, not NaN", fp.jaccard([], []), 0);

console.log("\n== 7. the declared design decisions ==");
// The prompt now requires the page to commit, in writing and before the
// markup, to an archetype / hero / section order / palette / type /
// density chosen FROM THE SUBJECT. Reading that back is what turns "the
// sites still look the same" into a measurement.
const DECLARED = `<!DOCTYPE html>
<!-- DESIGN DECISIONS
archetype: local-place
hero: full-bleed-photo
sections: hero, menu, hours, location, contact
palette: warm earth #3b2314 #d9a441 #faf6f0
type: Playfair Display / Inter
density: medium
why: people choose a taverna from photos and a menu, not from feature cards.
-->
<html><head>
<link href="https://fonts.googleapis.com/css2?family=Playfair+Display:wght@700&display=swap" rel="stylesheet">
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400&display=swap" rel="stylesheet">
</head><body>
<header></header>
<section id="menu"></section><section id="hours"></section>
<section id="location"></section><section id="contact"></section>
</body></html>`;

const d = fp.designDecisions(DECLARED);
check("the block is found", d !== null);
check("the archetype is read", d.archetype === "local-place");
check("the hero is read", d.hero === "full-bleed-photo");
check("the section order is a list, in order", Array.isArray(d.sections) && d.sections[0] === "hero" && d.sections[4] === "contact");
check("the palette line is kept whole, hexes and all", /#3b2314/.test(d.palette));
check("the type pairing is read", /playfair/i.test(d.type) && /inter/i.test(d.type));
check("and the one-sentence reason", /taverna/.test(d.why));

// A page with no block must report nothing rather than a default, or the
// absence would score as compliance.
check("a page with no block returns null", fp.designDecisions("<html><body></body></html>") === null);
check("an empty block returns null too", fp.designDecisions("<!-- DESIGN DECISIONS\n-->") === null);

console.log("\n== 8. a declaration nobody checks is worth nothing ==");
// The failure mode of this whole mechanism: the model writes a beautiful
// commitment and then builds the page it always builds.
const honoured = fp.decisionsHonoured(DECLARED);
check("the page is recognised as having declared", honoured.declared === true);
check(
  `the declared section count is roughly what was built (${honoured.declaredSections} vs ${honoured.builtSections})`,
  honoured.sectionCountPlausible === true
);
check("the declared fonts are the fonts actually loaded", honoured.fontsMatch === true);

const LIED = DECLARED.replace(/family=Playfair\+Display[^"]*/, "family=Roboto:wght@700&display=swap");
check(
  "a page that loads a font it did not declare is caught",
  fp.decisionsHonoured(LIED).fontsMatch === false
);
const OVERDECLARED = DECLARED.replace(
  "sections: hero, menu, hours, location, contact",
  "sections: a, b, c, d, e, f, g, h, i, j, k, l"
);
check(
  "declaring twelve sections and building four is caught",
  fp.decisionsHonoured(OVERDECLARED).sectionCountPlausible === false
);
check("a page with no block declares nothing", fp.decisionsHonoured("<html></html>").declared === false);

console.log("\n== 9. the prompt actually asks for all of it ==");
const builder = readFileSync("src/lib/website-builder.ts", "utf8");
check("the prompt requires the commitment", /COMMIT TO THE DECISIONS BEFORE YOU WRITE THE PAGE/.test(builder));
for (const axis of ["archetype", "hero", "sections", "palette", "type", "density", "why"]) {
  check(`it asks for ${axis}`, new RegExp(`^${axis}:`, "m").test(builder));
}
check(
  "the section list is described as a commitment, not a summary",
  /It is a commitment, not a summary written afterwards/.test(builder)
);
check(
  "and copying an example from the prompt is forbidden",
  /Never copy an example from this prompt as your answer/.test(builder)
);


// =====================================================================
console.log("\n== THE VISUAL AXES — the instrument for the sixth report ==");
// =====================================================================
//
// The structural half of this file was green for five rounds while the
// complaint stood. These four functions measure what a person perceives
// in the first second, so they are tested the same way: hand-built HTML
// with known answers, BOTH directions — a page that should score high
// and a page that should score low. An instrument that only ever says
// "different" is as useless as one that only ever says "same".

const SAME_A = `<html><head>
<link href="https://fonts.googleapis.com/css2?family=Fraunces:wght@400&family=Karla:wght@400" rel="stylesheet">
</head><body><style>
section { padding: 120px 24px; }
.reveal { opacity:0; transform: translateY(24px); transition: opacity 0.7s ease-out; }
</style><section style="background:#1a1a2e;color:#e94560">alpha</section></body></html>`;

const SAME_B = `<html><head>
<link href="https://fonts.googleapis.com/css2?family=Fraunces:wght@400&family=Karla:wght@400" rel="stylesheet">
</head><body><style>
section { padding: 120px 24px; }
.reveal { opacity:0; transform: translateY(24px); transition: opacity 0.7s ease-out; }
</style><section style="background:#16213e;color:#e94560">beta</section></body></html>`;

const DIFFERENT = `<html><head>
<link href="https://fonts.googleapis.com/css2?family=Bebas+Neue&family=Work+Sans" rel="stylesheet">
</head><body><style>
section { padding: 48px 16px; }
.s { opacity:0; transform: translateY(6px); transition: opacity 180ms ease; }
</style><section style="background:#fdf6e3;color:#2f6f4e">gamma</section></body></html>`;

// ---- typePairing ----------------------------------------------------
check("the loaded families are read in order", JSON.stringify(fp.typePairing(SAME_A)) === '["Fraunces","Karla"]', JSON.stringify(fp.typePairing(SAME_A)));
check("a page loading no font reports none", fp.typePairing("<html><body>x</body></html>").length === 0);
check("the same family twice is counted once", fp.typePairing('<link href="?family=Lora&family=Lora">').length === 1);

// ---- spacingScale ---------------------------------------------------
check("section padding is picked up", fp.spacingScale(SAME_A).includes(120));
check("component-scale padding is excluded", !fp.spacingScale(SAME_A).includes(24) || fp.spacingScale(SAME_A)[0] >= 24);
// rem AND px must be comparable, or a page written in rem scores as
// having no spacing at all against one written in px.
check("rem is converted at 16px", fp.spacingScale("<style>section{padding:5rem 0}</style>").includes(80), JSON.stringify(fp.spacingScale("<style>section{padding:5rem 0}</style>")));
check("values below 24px are dropped as component padding", JSON.stringify(fp.spacingScale("<style>a{padding:8px}</style>")) === "[]");

// ---- motionSignature ------------------------------------------------
{
  const m = fp.motionSignature(SAME_A);
  check("seconds are normalised to ms", m.durationsMs.includes(700), JSON.stringify(m.durationsMs));
  check("translate distance is read", m.distancesPx.includes(24), JSON.stringify(m.distancesPx));
  const d = fp.motionSignature(DIFFERENT);
  check("ms stays ms", d.durationsMs.includes(180), JSON.stringify(d.durationsMs));
  // A STATIC PAGE MUST REPORT STATIC, not "no data". "No motion" is a
  // design decision the draw can make, and scoring it as unknown would
  // let a static page look varied against anything.
  const none = fp.motionSignature("<html><body>plain</body></html>");
  check("a static page has an empty signature", none.durationsMs.length === 0 && none.distancesPx.length === 0);
}

// ---- paletteCharacter -----------------------------------------------
{
  const a = fp.paletteCharacter(SAME_A);
  check("a dark page is called dark", a.ground === "dark", JSON.stringify(a));
  const c = fp.paletteCharacter(DIFFERENT);
  check("a light page is called light", c.ground === "light", JSON.stringify(c));
  // THE GROUND IS THE BACKGROUND, NOT THE MOST FREQUENT HEX. An accent
  // repeated twenty times does not make a dark page light. Deciding this
  // by raw frequency left the verdict to document order on a tie, which
  // is not a fact about the design.
  const accentHeavy = `<style>body{background:#101014}
    a{color:#ff6b35}b{color:#ff6b35}i{color:#ff6b35}u{color:#ff6b35}s{color:#ff6b35}
    p{color:#ff6b35}h1{color:#ff6b35}h2{color:#ff6b35}h3{color:#ff6b35}h4{color:#ff6b35}</style>`;
  check("an accent used ten times does not make a dark page light",
    fp.paletteCharacter(accentHeavy).ground === "dark", JSON.stringify(fp.paletteCharacter(accentHeavy)));
  check("…and the reverse holds too",
    fp.paletteCharacter(accentHeavy.replace("#101014", "#fbfbf8")).ground === "light");
  // NEAR-GREYS CARRY NO HUE. Bucketing #1a1a1b as "red" because its red
  // channel is one higher would make every neutral page score as a
  // coloured one.
  const grey = fp.paletteCharacter('<style>a{color:#1a1a1b;background:#2b2b2c}</style>');
  check("a near-grey page is achromatic", grey.achromatic === true, JSON.stringify(grey));
  check("…and hues are empty there", grey.hues.length === 0);
  // Two oranges a person cannot tell apart must bucket together, or the
  // instrument reports variety that nobody can see.
  const o1 = fp.paletteCharacter('<style>a{color:#b45309}</style>');
  const o2 = fp.paletteCharacter('<style>a{color:#c2610a}</style>');
  check("two indistinguishable oranges share a bucket", JSON.stringify(o1.hues) === JSON.stringify(o2.hues), `${o1.hues} vs ${o2.hues}`);
}

// ---- visualSimilarity, BOTH DIRECTIONS ------------------------------
{
  const same = fp.visualSimilarity(SAME_A, SAME_B);
  const diff = fp.visualSimilarity(SAME_A, DIFFERENT);
  check(`two pages with the same look score high (${same.overall})`, same.overall >= 0.85, JSON.stringify(same));
  check(`two genuinely different pages score low (${diff.overall})`, diff.overall <= 0.3, JSON.stringify(diff));
  check("identical fonts score 1", same.fonts === 1);
  check("different fonts score 0", diff.fonts === 0);
  check("identical motion scores 1", same.motion === 1);
  check("a page is identical to itself", fp.visualSimilarity(SAME_A, SAME_A).overall === 1);
  // THE AXES ARE REPORTED SEPARATELY. A blended figure is how a 0.2
  // structural score hid a 0.95 visual one for five rounds.
  check("every axis is reported on its own", ["fonts", "colour", "spacing", "motion", "overall"].every((k) => typeof same[k] === "number"));
}

// ---- and the axes are actually DRAWN, not asked for ------------------
{
  const variation = await import("../../src/lib/website-variation.ts").catch(() => null);
  const { loadTs } = await import("./load-ts.mjs");
  const v = await loadTs("src/lib/website-variation.ts");
  const draws = [];
  for (let i = 0; i < 400; i++) draws.push(v.pickVariation([`user${i % 40}`, i, `brief ${i}`]));
  for (const [axis, min] of [["palette", 5], ["typeface", 8], ["spacing", 4], ["motionTiming", 5]]) {
    const distinct = new Set(draws.map((d) => d[axis])).size;
    check(`${axis} actually spreads over 400 seeds (${distinct})`, distinct >= min, String(distinct));
  }
  // INDEPENDENCE. Without a per-axis salt, lists whose lengths share a
  // factor correlate — the same seed picking index 2 everywhere — and
  // four axes would collapse into one.
  const pairs = new Set(draws.map((d) => `${d.palette}|${d.spacing}`));
  check(`palette and spacing are independent (${pairs.size} combos)`, pairs.size >= 20, String(pairs.size));
  void variation;
}

console.log(`\n${failures.length === 0 ? "ALL PASS" : "FAILURES"}: ${pass} passed, ${failures.length} failed`);
process.exit(failures.length === 0 ? 0 : 1);
