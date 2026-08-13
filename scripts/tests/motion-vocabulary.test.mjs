// "ίδια animations, ίδια συμπεριφορά, ίδιο feel παρά το SITE SHAPE fix"
//
// The report is accurate and the SITE SHAPE fix could not have addressed
// it. That fix changed what a page is MADE OF — archetype, section order,
// type, density. It said nothing about how a page BEHAVES, and behaviour is
// what a visitor meets first: the same sections fading up on the same
// scroll trigger over the same 0.7 seconds, the same 6px lift under the
// cursor, the same animated gradient. Two pages with completely different
// section orders still feel like one page when they move identically.
//
// The prompt's only guidance on movement was five reference snippets and
// "use one, or none". "One or none" leaves the choice unmade, and an
// unmade choice resolves to the model's strongest prior — which for "make
// me a website" is scroll-reveal plus hover-lift on everything.
//
// So motion becomes the same kind of object the archetype already is: a
// closed list of six vocabularies, two or three permitted per archetype,
// declared by name with a reason in the DESIGN DECISIONS block, and read
// back off the finished CSS afterwards. This file tests all three parts.
//
// Runs in the build gate; needs no API key and makes no network call.
//
// Run: node scripts/tests/motion-vocabulary.test.mjs
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
    console.log(`  FAIL  ${name}${detail ? "\n        " + detail : ""}`);
  }
}
function eq(name, actual, expected) {
  check(name, actual === expected, `expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
}

const raw = await import("../lib/site-fingerprint.mjs");
// A function the instrument does not have yet must read as a FAILED check,
// not as a crashed test run — otherwise "does this catch the bug?" cannot
// be answered by running it against the code from before the fix.
// It answers [] to everything, which supports .length/.some/.join/spread
// and yields `undefined` for any named field — so each check fails on its
// own terms and the run stays readable end to end.
const fp = new Proxy(raw, {
  get: (target, prop) => (prop in target ? target[prop] : () => []),
});
// The strict loader (no external imports allowed) — website-motion.ts is
// pure on purpose so it can be exercised as itself here.
const motion = await loadTs("src/lib/website-motion.ts");
const builderSource = readFileSync("src/lib/website-builder.ts", "utf8");

// ---------------------------------------------------------------------
console.log("== 1. the spec exists, once ==");

eq("six vocabularies", motion.MOTION_VOCABULARIES.length, 6);
check(
  "and they are the six that were asked for",
  ["still", "subtle", "editorial", "bold", "playful", "cinematic"].every((v) =>
    motion.MOTION_VOCABULARIES.includes(v)
  ),
  motion.MOTION_VOCABULARIES.join(", ")
);
// The instrument duplicates the list in .mjs (it cannot import TypeScript).
// A spec written twice with nothing comparing the copies is a spec that
// will drift, so the comparison is the test.
// Guarded rather than destructured: an instrument that does not export the
// list at all is the state this whole change started from, and a test that
// throws there reports a crash instead of reporting the finding.
check(
  "the fingerprint's copy of the list is the same list",
  Array.isArray(fp.MOTION_VOCABULARIES) &&
    JSON.stringify([...fp.MOTION_VOCABULARIES].sort()) === JSON.stringify([...motion.MOTION_VOCABULARIES].sort()),
  `fingerprint: ${Array.isArray(fp.MOTION_VOCABULARIES) ? fp.MOTION_VOCABULARIES.join(",") : "(not exported)"} / spec: ${motion.MOTION_VOCABULARIES.join(",")}`
);
eq("seven archetypes", motion.SITE_ARCHETYPES.length, 7);

// A one-to-one archetype->motion map would make motion a synonym for
// archetype and add no variety whatsoever: every café would move exactly
// like every other café, forever. The permission sets have to leave room.
check(
  "every archetype allows at least two vocabularies, so two sites of the same kind can still differ",
  motion.SITE_ARCHETYPES.every((a) => motion.ARCHETYPE_MOTION[a].length >= 2),
  motion.SITE_ARCHETYPES.map((a) => `${a}:${motion.ARCHETYPE_MOTION[a].length}`).join(" ")
);
// ...and at the same time every set has to actually forbid something,
// otherwise "choose one of six" is not a constraint at all.
check(
  "and no archetype allows all six, so the choice is genuinely constrained",
  motion.SITE_ARCHETYPES.every((a) => motion.ARCHETYPE_MOTION[a].length <= 3),
  motion.SITE_ARCHETYPES.map((a) => `${a}:${motion.ARCHETYPE_MOTION[a].join("/")}`).join(" ")
);
check(
  "every permitted value is a real vocabulary",
  motion.SITE_ARCHETYPES.every((a) => motion.ARCHETYPE_MOTION[a].every((m) => motion.isMotionVocabulary(m)))
);
// The specific judgement that matters most: a page selling professional
// judgement must not be able to bounce.
eq("a lawyer's page cannot be playful", motion.isMotionAllowedForArchetype("professional-services", "playful"), false);
eq("a lawyer's page can be still", motion.isMotionAllowedForArchetype("professional-services", "still"), true);
eq("an event cannot be still", motion.isMotionAllowedForArchetype("event", "still"), false);
eq("a product page cannot be cinematic", motion.isMotionAllowedForArchetype("product-landing", "cinematic"), false);
eq("an unknown word is not allowed anywhere", motion.isMotionAllowedForArchetype("gallery", "swooshy"), false);

// ---------------------------------------------------------------------
console.log("\n== 2. the prompt actually carries the spec ==");

check("the generation prompt has a MOTION VOCABULARY section", /MOTION VOCABULARY — CHOOSE EXACTLY ONE/.test(builderSource));
check(
  "the DESIGN DECISIONS template asks for a motion line",
  /^motion: <one of: \$\{MOTION_VOCABULARIES\.join/m.test(builderSource)
);
check(
  "and for a why-motion line — the 'ΓΙΑΤΙ' half of the requirement",
  /^why-motion: <one sentence naming what actually moves/m.test(builderSource)
);
// Interpolated, not retyped: the prose a model reads is generated from the
// same constant the checker grades against, so the two cannot disagree.
check(
  "the prompt interpolates the vocabulary list rather than restating it",
  builderSource.includes("${MOTION_VOCABULARIES.join(\" | \")}")
);
check(
  "the prompt interpolates the reduced-motion block rather than restating it",
  builderSource.includes("${REDUCED_MOTION_BLOCK}")
);
for (const archetype of motion.SITE_ARCHETYPES) {
  check(
    `the ${archetype} shape states its permitted motion from the spec`,
    builderSource.includes(`MOTION: \${allowedMotionFor("${archetype}")}`)
  );
}

// (γ) interaction style per archetype — navigation, CTA, forms, mobile.
console.log("\n== 3. every archetype states its interaction style ==");
// Split the shape list into one block per archetype so a line belonging to
// a neighbour cannot satisfy the check for this one.
const shapeBlocks = new Map();
for (const archetype of motion.SITE_ARCHETYPES) {
  const start = builderSource.indexOf(`\n- ${archetype}:`);
  if (start === -1) continue;
  const rest = builderSource.slice(start + 1);
  const end = rest.search(/\n- (?:local-place|professional-services|gallery|editorial|catalogue|event|product-landing):|\nFORBIDDEN DEFAULT/);
  shapeBlocks.set(archetype, end === -1 ? rest : rest.slice(0, end));
}
eq("all seven shapes were found in the prompt", shapeBlocks.size, 7);
for (const [archetype, block] of shapeBlocks) {
  const interaction = block.split("\n").find((l) => l.trim().startsWith("INTERACTION:")) ?? "";
  check(`${archetype} has an INTERACTION line`, interaction.length > 0);
  // All four surfaces the request named, in that archetype's own line.
  const lower = interaction.toLowerCase();
  check(`  ...covering navigation`, /\bnavigation\b/.test(lower), interaction.slice(0, 120));
  check(`  ...covering the action (CTA)`, /\baction\b/.test(lower), interaction.slice(0, 120));
  check(`  ...covering forms`, /\bform\b/.test(lower), interaction.slice(0, 120));
  check(`  ...covering mobile`, /\bmobile\b/.test(lower), interaction.slice(0, 120));
  check(`${archetype}'s MOTION line matches the spec exactly`, block.includes(`MOTION: \${allowedMotionFor("${archetype}")}`));
}

// The interaction lines have to be DIFFERENT from each other, or they are
// one instruction printed seven times and the sameness bug is untouched.
const interactionLines = [...shapeBlocks.values()].map(
  (b) => b.split("\n").find((l) => l.trim().startsWith("INTERACTION:")) ?? ""
);
eq("no two archetypes share an interaction line", new Set(interactionLines).size, interactionLines.length);

// ---------------------------------------------------------------------
console.log("\n== 4. the instrument reads motion back off a page ==");

const STILL_PAGE = `<!DOCTYPE html>
<!-- DESIGN DECISIONS
archetype: professional-services
hero: typographic
sections: name, practice areas, credentials, people, contact
palette: ink and bone #1a1a1a #f7f5f2
type: Libre Baskerville / Libre Baskerville
density: medium
motion: still
why-motion: nothing moves; a page selling judgement should not advertise.
why: a three-partner commercial practice is bought on seriousness.
-->
<html><head><style>a{color:#1a1a1a}a:hover{color:#8a6a3b}</style></head>
<body><header><h1>Παπαδόπουλος & Συνεργάτες</h1></header><main><section>x</section></main></body></html>`;

const CINEMATIC_PAGE = `<!DOCTYPE html>
<!-- DESIGN DECISIONS
archetype: gallery
hero: full-bleed-photo
sections: work, work, statement, contact
palette: warm monochrome #101010 #e8e2d9
type: Epilogue / Epilogue
density: sparse
motion: cinematic
why-motion: the photographs drift slowly behind fixed type; nothing else moves.
why: a wedding portfolio is bought on the pictures.
-->
<html><head><style>
.hero{background-attachment:fixed;background-size:cover}
.fade{animation:slowFade 1400ms ease-out both}
@keyframes slowFade{from{opacity:0}to{opacity:1}}
@media (prefers-reduced-motion: reduce){*,*::before,*::after{animation-duration:0.01ms !important;transition-duration:0.01ms !important}}
</style></head><body><main><figure><img src="a.jpg"></figure></main></body></html>`;

// The exact failure the checker exists for: a page that SAYS still and
// then animates. Before this test existed nothing anywhere read the
// declaration back, so this page scored as a compliant one.
const LYING_PAGE = STILL_PAGE.replace(
  "<style>",
  "<style>.reveal{opacity:0;transform:translateY(24px);transition:opacity 0.7s ease-out}@keyframes fadeInUp{from{opacity:0}to{opacity:1}}"
);

eq("a declared vocabulary is parsed", fp.designDecisions(STILL_PAGE)?.motion, "still");
eq("and so is the reason", typeof fp.designDecisions(STILL_PAGE)?.["why-motion"], "string");
check(
  "a hyphenated key is not silently dropped",
  Boolean(fp.designDecisions(CINEMATIC_PAGE)?.["why-motion"]?.includes("drift slowly"))
);
eq("a trailing gloss does not become a different decision", fp.designDecisions(
  STILL_PAGE.replace("motion: still", "motion: still — nothing moves at all")
)?.motion, "still");

const stillSignals = fp.motionSignals(STILL_PAGE);
eq("a still page measures zero keyframes", stillSignals.keyframes, 0);
eq("a still page measures zero transforms", stillSignals.transforms, 0);
eq("a still page is not using scroll-reveal", stillSignals.scrollReveal, false);

const cineSignals = fp.motionSignals(CINEMATIC_PAGE);
eq("a cinematic page measures its parallax", cineSignals.parallax, true);
eq("a cinematic page measures its slowest movement", cineSignals.longestMs, 1400);
eq("and its reduced-motion guard", cineSignals.reducedMotionGuard, true);
// 0.01ms is the reduced-motion override, not a design decision — counting
// it would report every compliant page as having sub-millisecond motion.
check("the reduced-motion override is not counted as a duration", cineSignals.typicalMs >= 1);

// Found by running the instrument, not by reading it. The mandatory
// prefers-reduced-motion block CONTAINS `transition-duration` and
// `animation-duration` declarations, so counting its contents made every
// accessible page measure as a moving one — and a page that declared
// "still" and correctly shipped the guard was reported as having a
// transition. It penalised exactly the pages that did the right thing.
const STILL_WITH_GUARD = STILL_PAGE.replace(
  "<style>",
  "<style>@media (prefers-reduced-motion: reduce){*,*::before,*::after{animation-duration:0.01ms !important;animation-iteration-count:1 !important;transition-duration:0.01ms !important;scroll-behavior:auto !important}}"
);
eq(
  "the reduced-motion block's own declarations are not counted as transitions",
  fp.motionSignals(STILL_WITH_GUARD).transitions,
  0
);
eq("...nor as animations", fp.motionSignals(STILL_WITH_GUARD).animations, 0);
eq(
  "...so a still page that ships the guard is still measured as motionless",
  fp.motionFingerprint(STILL_WITH_GUARD).join(","),
  "motionless"
);
eq(
  "...and is not accused of contradicting itself",
  fp.motionContradictions(STILL_WITH_GUARD, motion.ARCHETYPE_MOTION).length,
  0
);

eq("an honest still page has no contradictions", fp.motionContradictions(STILL_PAGE, motion.ARCHETYPE_MOTION).length, 0);
eq("an honest cinematic page has no contradictions", fp.motionContradictions(CINEMATIC_PAGE, motion.ARCHETYPE_MOTION).length, 0);

const lies = fp.motionContradictions(LYING_PAGE, motion.ARCHETYPE_MOTION);
check("a page that declares still and then animates is caught", lies.length > 0, JSON.stringify(lies));
check(
  "and the report names the specific contradiction",
  lies.some((l) => /@keyframes/.test(l)) && lies.some((l) => /transform/.test(l)),
  JSON.stringify(lies)
);

// Mandatory accessibility guard.
const NO_GUARD = CINEMATIC_PAGE.replace(/@media \(prefers-reduced-motion[^}]*}[^}]*}/, "");
check(
  "a moving page with no prefers-reduced-motion block is caught",
  fp.motionContradictions(NO_GUARD, motion.ARCHETYPE_MOTION).some((l) => /prefers-reduced-motion/.test(l))
);
// ...and stillness is exempt, because there is nothing to reduce.
check(
  "a still page is not asked for a reduced-motion block",
  !fp.motionContradictions(STILL_PAGE, motion.ARCHETYPE_MOTION).some((l) => /prefers-reduced-motion/.test(l))
);

// A vocabulary its archetype forbids.
const FORBIDDEN = STILL_PAGE.replace("motion: still", "motion: playful").replace(
  "why-motion: nothing moves",
  "why-motion: everything bounces"
);
check(
  "a vocabulary the archetype forbids is caught",
  fp.motionContradictions(FORBIDDEN, motion.ARCHETYPE_MOTION).some((l) => /does not permit/.test(l)),
  JSON.stringify(fp.motionContradictions(FORBIDDEN, motion.ARCHETYPE_MOTION))
);
// A claim of movement with nothing moving is the mirror-image lie and has
// to be caught too, or "declare cinematic, build nothing" becomes free.
check(
  "declaring cinematic on a page where nothing moves is caught",
  fp.motionContradictions(
    STILL_PAGE.replace("archetype: professional-services", "archetype: gallery").replace("motion: still", "motion: cinematic"),
    motion.ARCHETYPE_MOTION
  ).some((l) => /nothing on the page is slow/.test(l))
);
check(
  "a missing motion line is itself a finding",
  fp.motionContradictions(STILL_PAGE.replace(/^motion: still$/m, ""), motion.ARCHETYPE_MOTION).some((l) =>
    /no motion declared/.test(l)
  )
);

// ---------------------------------------------------------------------
console.log("\n== 5. 'the animations are the same' becomes a number ==");

// Two pages with DIFFERENT structure and the same behaviour — precisely
// the case the structural score cannot see and the user was describing.
const SAME_BEHAVIOUR_A = `<html><head><style>
.reveal{opacity:0;transform:translateY(24px);transition:opacity 0.7s ease-out,transform 0.7s ease-out}
.lift{transition:transform 0.3s ease}.lift:hover{transform:translateY(-6px)}
</style></head><body><header><h1>A</h1></header><section class="reveal">x</section></body></html>`;
const SAME_BEHAVIOUR_B = `<html><head><style>
.reveal{opacity:0;transform:translateY(24px);transition:opacity 0.7s ease-out,transform 0.7s ease-out}
.lift{transition:transform 0.3s ease}.lift:hover{transform:translateY(-6px)}
</style></head><body><main><figure class="reveal">y</figure><figure class="lift">z</figure><article>q</article></main><footer>f</footer></body></html>`;

const structural = fp.sequenceSimilarity(fp.structureFingerprint(SAME_BEHAVIOUR_A), fp.structureFingerprint(SAME_BEHAVIOUR_B));
const behavioural = fp.jaccard(fp.motionFingerprint(SAME_BEHAVIOUR_A), fp.motionFingerprint(SAME_BEHAVIOUR_B));
check(
  "two structurally different pages that move identically score 1.00 on motion",
  behavioural === 1,
  `motion similarity ${behavioural}`
);
check(
  "...while the structural score alone would have called them different",
  structural < 0.6,
  `structural similarity ${structural.toFixed(2)}`
);
check(
  "a still page and a cinematic page do not share a motion fingerprint",
  fp.jaccard(fp.motionFingerprint(STILL_PAGE), fp.motionFingerprint(CINEMATIC_PAGE)) < 0.4,
  `${fp.motionFingerprint(STILL_PAGE)} vs ${fp.motionFingerprint(CINEMATIC_PAGE)}`
);
check("a page with no motion says so", fp.motionFingerprint(STILL_PAGE).includes("motionless"));

// ---------------------------------------------------------------------
console.log("\n== 6. collisions, including on motion ==");

const decisionsOf = (slug, html) => ({ slug, decisions: fp.designDecisions(html) });

const noCollision = fp.declarationCollisions([
  decisionsOf("law-firm", STILL_PAGE),
  decisionsOf("photographer", CINEMATIC_PAGE),
]);
eq("two genuinely different declarations do not collide", noCollision.filter((c) => c.full).length, 0);

// Same archetype and hero, different motion: a partial, and NOT a failure —
// two cafés should both be local-place.
const partial = fp.declarationCollisions([
  decisionsOf("cafe-a", CINEMATIC_PAGE),
  decisionsOf("cafe-b", CINEMATIC_PAGE.replace("motion: cinematic", "motion: still").replace(/@media \(prefers-reduced-motion[^}]*}[^}]*}/, "")),
]);
eq("same shape, different movement is reported...", partial.length, 1);
eq("...but is not a full collision", partial[0]?.full, false);
check("and it names what actually matched", Boolean(partial[0]?.matched?.includes("archetype")) && !partial[0]?.matched?.includes("motion"));

// The real failure: identical shape AND identical movement.
const full = fp.declarationCollisions([decisionsOf("a", CINEMATIC_PAGE), decisionsOf("b", CINEMATIC_PAGE)]);
eq("identical declarations are a full collision", full.filter((c) => c.full).length, 1);
check("and the collision reports the motion it collided on", full[0]?.values?.motion === "cinematic");

// This is the mechanism that makes the ΔΟΚΙΜΗ's "0 collisions" a property
// rather than a hope: a full collision needs the same ARCHETYPE, and the
// three test subjects route to three different archetypes.
console.log("\n== 7. the three test subjects cannot collide ==");
const SUBJECT_KEYWORDS = {
  "law-firm": "lawyer",
  photographer: "photographer",
  cafe: "café",
};
const routed = {};
for (const [slug, keyword] of Object.entries(SUBJECT_KEYWORDS)) {
  const owners = [...shapeBlocks.entries()].filter(([, block]) => {
    // Only the subject list — the first line of the shape — routes a brief.
    const subjects = block.split("\n")[0];
    return subjects.toLowerCase().includes(keyword.toLowerCase());
  });
  eq(`"${keyword}" is listed under exactly one archetype`, owners.length, 1);
  if (owners.length === 1) routed[slug] = owners[0][0];
}
console.log(`    routing: ${Object.entries(routed).map(([s, a]) => `${s} -> ${a}`).join(", ")}`);
eq("the three subjects route to three different archetypes", new Set(Object.values(routed)).size, 3);
check(
  "so a full declaration collision between them is impossible by construction",
  new Set(Object.values(routed)).size === Object.keys(routed).length
);

// And their prescribed section orders are near-disjoint, which is the
// upper bound on how similar the built pages can be if the ORDER lines are
// obeyed. This is a property of the PROMPT, measurable without an API key
// — not a claim about any particular generation.
const orderOf = (archetype) => {
  const line = (shapeBlocks.get(archetype) ?? "").split("\n").find((l) => l.trim().startsWith("ORDER:")) ?? "";
  return line
    .replace(/^\s*ORDER:\s*/, "")
    .replace(/\.\s*$/, "")
    .split(">")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
};
const slugs = Object.keys(routed);
let worstPrescribed = 0;
for (let i = 0; i < slugs.length; i++) {
  for (let j = i + 1; j < slugs.length; j++) {
    const s = fp.sequenceSimilarity(orderOf(routed[slugs[i]]), orderOf(routed[slugs[j]]));
    worstPrescribed = Math.max(worstPrescribed, s);
    console.log(`    prescribed order similarity  ${slugs[i]} vs ${slugs[j]}: ${s.toFixed(2)}`);
  }
}
check(
  `the prescribed section orders are below the 0.60 target (worst ${worstPrescribed.toFixed(2)})`,
  worstPrescribed < 0.6,
  `worst ${worstPrescribed.toFixed(2)}`
);

// ---------------------------------------------------------------------
console.log(`\n${pass} passed, ${failures.length} failed`);
if (failures.length) {
  console.log("FAILED:\n" + failures.map((f) => "  - " + f).join("\n"));
  process.exit(1);
}
