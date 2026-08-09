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

console.log(`\n${failures.length === 0 ? "ALL PASS" : "FAILURES"}: ${pass} passed, ${failures.length} failed`);
process.exit(failures.length === 0 ? 0 : 1);
