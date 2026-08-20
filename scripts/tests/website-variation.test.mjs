// The per-site design draw: deterministic, diverse, and actually wired.
//
// WHAT WAS REPORTED, four times: "the sites still have the same template
// feel". The prompt ASKED for variety; nothing ever CHOSE any — the
// system prompt is byte-identical per call (deliberately, for caching)
// and no per-site directive existed. lib/website-variation.ts is that
// missing selection step; this file proves its properties and its wiring.
//
// Run: node scripts/tests/website-variation.test.mjs
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

const v = await loadTs("src/lib/website-variation.ts");
const {
  pickVariation,
  variationDirective,
  MOTION_VOCABULARIES,
  HERO_PATTERNS,
  LAYOUT_GRIDS,
  SECTION_RHYTHMS,
  TYPE_SCALES,
} = v;

console.log("== 1. the vocabularies exist, for real this time ==");
// "Motion vocabularies (6 types)" was CLAIMED to exist before; nothing in
// the repo defined them. This is the check that claim needs.
check(`there are exactly 6 motion vocabularies (${MOTION_VOCABULARIES.length})`, MOTION_VOCABULARIES.length === 6);
check(`5 hero patterns (${HERO_PATTERNS.length})`, HERO_PATTERNS.length === 5);
check(`4 layout grids (${LAYOUT_GRIDS.length})`, LAYOUT_GRIDS.length === 4);
check(`3 section rhythms (${SECTION_RHYTHMS.length})`, SECTION_RHYTHMS.length === 3);
check(`3 type scales (${TYPE_SCALES.length})`, TYPE_SCALES.length === 3);
check(
  "every vocabulary names its mechanics, not just a vibe word",
  MOTION_VOCABULARIES.every((m) => m.includes("—") && m.length > 40)
);

console.log("\n== 2. the draw is deterministic (a regenerate reproduces it) ==");
const a = pickVariation(["user-1", 0, "a bakery site"]);
const b = pickVariation(["user-1", 0, "a bakery site"]);
check("same seed, same draw", JSON.stringify(a) === JSON.stringify(b));

console.log("\n== 3. consecutive sites draw differently ==");
// The seed includes the user's site COUNT — that is what guarantees the
// user's next site cannot repeat the previous draw wholesale. Measured
// across ten consecutive sites, not asserted from hope:
const draws = Array.from({ length: 10 }, (_, i) =>
  pickVariation(["user-1", i, "a bakery site"])
);
const distinct = new Set(draws.map((d) => JSON.stringify(d)));
check(`10 consecutive sites produce ${distinct.size} distinct draws (>= 7)`, distinct.size >= 7);
const heroes = new Set(draws.map((d) => d.hero));
const motions = new Set(draws.map((d) => d.motion));
check(`heroes actually rotate (${heroes.size} of ${HERO_PATTERNS.length} seen)`, heroes.size >= 3);
check(`motion vocabularies actually rotate (${motions.size} of 6 seen)`, motions.size >= 3);

console.log("\n== 4. the axes are independent ==");
// Salted hashing: without the per-axis salt, lists whose lengths share a
// factor pick correlated indices and "variety" collapses to a few combos.
const many = Array.from({ length: 60 }, (_, i) => pickVariation(["u", i, "brief"]));
const combos = new Set(many.map((d) => `${d.hero}|${d.motion}`));
check(`hero and motion combine freely (${combos.size} combos in 60 draws, >= 12)`, combos.size >= 12);

console.log("\n== 5. the directive says who wins ==");
const text = variationDirective(a);
check(
  "it carries all six axes",
  ["SECTION ORDER:", "HERO:", "LAYOUT GRID:", "SECTION RHYTHM:", "TYPE SCALE:", "MOTION VOCABULARY:"].every((k) =>
    text.includes(k)
  )
);
// THE STRUCTURAL AXIS. Five composition axes were not enough — "same
// template" was reported a fifth time, because every archetype hard-coded
// ONE section order, so two cafés were both instructed into the same
// skeleton and only their surface differed.
check("the section order is named as non-negotiable", /not negotiable/.test(text));
check("and it says why: two of a kind in one order IS the defect", /same template. defect/.test(text));
check("the shape's NEVER list still stands", /NEVER list still stands/.test(text));
check("the user's brief beats everything", /the brief beats everything/.test(text));

console.log("\n== 6. wired into the generation, in the right place ==");
const processRoute = readFileSync("src/app/api/websites/generate/process/route.ts", "utf8");
check(
  "the process route draws per site (user id + site count + brief)",
  /pickVariation\(\[user\.id, priorSites \?\? 0, description\]\)/.test(processRoute)
);
check(
  "and hands the directive to generateWebsiteHtml",
  /variationDirective\(/.test(processRoute) && /generateWebsiteHtml\([\s\S]*?variation\s*\)/.test(processRoute)
);
const builder = readFileSync("src/lib/website-builder.ts", "utf8");
check(
  "the builder puts the draw in the USER message, brief still last",
  /variationText\?\.trim\(\) \?\? "",\s*buildUserBriefBlock\(description\)/.test(builder)
);
// THE REAL PROPERTY, not a word search. The old check looked for the
// string "variation" anywhere above SYSTEM_PROMPT, which a static
// sentence mentioning the directive trips without changing anything that
// matters. What matters is that the CACHED block is built from a
// module-level constant and never from the per-call draw — so that is
// what is measured, from the function that assembles it.
{
  const fn = builder.slice(builder.indexOf("function buildGenerateSystemBlocks"));
  const body = fn.slice(0, fn.indexOf("\n}"));
  const cachedLines = body.split("\n").filter((l) => l.includes("cache_control"));
  check(`there really is a cached block (${cachedLines.length})`, cachedLines.length >= 1);
  check(
    "every cached block is a bare module constant, not a per-call value",
    cachedLines.every((l) => /text: [A-Z_]+,/.test(l))
  );
  check(
    "the per-call draw is not in the system blocks at all",
    !/variationText|variationDirective/.test(body)
  );
  // ...and it really does reach the model, in the user message.
  check(
    "it rides in the user message instead",
    /variationText\?\.trim\(\) \?\? ""/.test(builder)
  );
}

console.log(`\n${failures.length === 0 ? "ALL PASS" : "FAILURES"}: ${pass} passed, ${failures.length} failed`);
process.exit(failures.length === 0 ? 0 : 1);
