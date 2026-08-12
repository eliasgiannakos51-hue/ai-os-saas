// "Every site still has the same structure" — the third report of it.
//
// Two fixes had already gone in: a SITE SHAPE section listing archetypes,
// and a DESIGN DECISIONS block requiring the page to commit in writing to
// an archetype before writing markup. The complaint came back anyway.
//
// So the question stopped being "does the prompt say to vary the shape"
// (it does, at length) and became "does the prompt CONTRADICT itself". It
// did, in two specific ways, and both are the kind that a model resolves
// against the abstract instruction every time.
//
// ONE. The FORBIDDEN DEFAULT forbids a shape in prose: centred hero over a
// gradient, a row of three feature cards, a testimonial, a CTA band, a fat
// footer. The ANIMATIONS section then hands over ready-made, copy-paste
// CSS for THREE of those five — a .card hover transform, a gradient
// labelled "hero sections, CTAs", and a stagger animation hardcoded to
// exactly three children. Concrete beats abstract. A model given
// copy-paste CSS for a three-card row and a prose sentence saying not to
// build one will build one.
//
// TWO. SITE SHAPE called its archetypes "a list of examples, not an enum"
// while DESIGN DECISIONS demanded the page declare "one of:" that same
// list. An instruction that is optional in one paragraph and mandatory in
// another is optional.
//
// This file measures both, against the real prompt string.
//
// Run: node scripts/tests/prompt-shape-conflict.test.mjs
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

const builder = readFileSync("src/lib/website-builder.ts", "utf8");

// The prompt is assembled from named template literals. Pulling out the
// two that matter keeps this measuring the PROMPT rather than the file's
// explanatory comments — several of which quote the very phrases being
// searched for, and would otherwise trip every check.
function section(name) {
  const m = builder.match(new RegExp(`const ${name} = \`([\\s\\S]*?)\`;`));
  if (!m) throw new Error(`section ${name} not found in website-builder.ts`);
  return m[1];
}
const ANIMATIONS = section("ANIMATIONS_SECTION");
const SHAPE = section("SITE_SHAPE_SECTION");

// ---------------------------------------------------------------------
console.log("== 1. the sections exist and are what we think they are ==");
check("the animations section was extracted", ANIMATIONS.length > 500);
check("the site-shape section was extracted", SHAPE.length > 1000);
check("the forbidden default is stated in the shape section", /FORBIDDEN DEFAULT/.test(SHAPE));

console.log("\n== 2. the prompt must not hand over CSS for the shape it forbids ==");
// Each entry: the forbidden element, and the concrete support the prompt
// was giving for building it anyway.
const CONFLICTS = [
  {
    element: "a row of three feature cards",
    // A ready-made .card hover effect is an invitation to build a card row.
    pattern: /\.card\s*\{|\.card:hover/,
    what: "ready-made .card / .card:hover CSS",
  },
  {
    element: "three of anything, by construction",
    // nth-child(1)(2)(3) and nothing else says "three items" more clearly
    // than any prose can say "not three items".
    pattern: /nth-child\(1\)[\s\S]{0,200}nth-child\(2\)[\s\S]{0,200}nth-child\(3\)\s*\{[^}]*\}\s*\n\s*@keyframes/,
    what: "a stagger animation hardcoded to exactly three children",
  },
  {
    element: "a centred hero over a gradient, and a CTA band",
    pattern: /hero sections?,\s*CTAs?/i,
    what: 'a gradient explicitly recommended for "hero sections, CTAs"',
  },
];

for (const c of CONFLICTS) {
  check(
    `the animations section does not supply ${c.what}`,
    !c.pattern.test(ANIMATIONS),
    `FORBIDDEN DEFAULT rules out "${c.element}", but the prompt supplies ${c.what}`
  );
}

// The scanner has to be shown to work, or "0 conflicts" means nothing.
console.log("\n== 2b. the conflict scanner actually detects a conflict ==");
check(
  "it catches a .card hover block",
  CONFLICTS[0].pattern.test(".card { transition: transform 0.3s ease; }\n.card:hover { transform: translateY(-6px); }")
);
check(
  "it catches a three-child stagger",
  CONFLICTS[1].pattern.test(
    ".stagger-item:nth-child(1) { animation-delay: 0.1s; }\n.stagger-item:nth-child(2) { animation-delay: 0.2s; }\n.stagger-item:nth-child(3) { animation-delay: 0.3s; }\n@keyframes fadeInUp { }"
  )
);
check("it catches the hero/CTA recommendation", CONFLICTS[2].pattern.test("Animated gradient background — hero sections, CTAs."));
check(
  "and it does not fire on animation CSS that carries no structure",
  !CONFLICTS[0].pattern.test(".reveal { opacity: 0; }\n.reveal.is-visible { opacity: 1; }")
);

console.log("\n== 3. the archetype choice is mandatory, not a suggestion ==");
// It cannot be "a list of examples, not an enum" here and "one of:" in the
// DESIGN DECISIONS block. One of those two wins, and it is the permissive
// one, every time.
check(
  'the shape list is no longer described as "not an enum"',
  !/not an enum/i.test(SHAPE),
  "DESIGN DECISIONS requires one of a fixed list; this sentence says the list is optional"
);
check(
  'nor as "a list of examples"',
  !/this is a list of examples/i.test(SHAPE)
);
check("choosing one is stated as required", /CHOOSE EXACTLY ONE/.test(SHAPE));

console.log("\n== 4. every declarable archetype has a concrete structure ==");
// The DESIGN DECISIONS block offers an enum. Every value in it must be
// defined somewhere with a real structural spec, or the model is being
// asked to declare a word that means nothing.
const enumLine = builder.match(/archetype: <one of: ([^>]+)>/);
check("the declaration offers a fixed set of archetypes", Boolean(enumLine));
const archetypes = (enumLine?.[1] ?? "").split("|").map((s) => s.trim()).filter(Boolean);
check(`there are 5-8 of them (${archetypes.length}): ${archetypes.join(", ")}`, archetypes.length >= 5 && archetypes.length <= 8);

for (const a of archetypes) {
  check(`${a}: is defined in the shape section`, new RegExp(`^- ${a}\\b`, "mi").test(SHAPE), SHAPE.slice(0, 0));
}

// The four axes that make two archetypes structurally different rather
// than differently worded. Each definition must set all of them.
const AXES = [
  ["FIRST", /FIRST:/],
  ["ORDER", /ORDER:/],
  ["TYPE", /TYPE:/],
  ["IMAGES", /IMAGES:/],
  ["NEVER", /NEVER:/],
];
const definitions = SHAPE.split(/\n(?=- [a-z-]+:)/).filter((b) => /^- [a-z-]+:/.test(b));
check(`each archetype has its own definition block (${definitions.length})`, definitions.length === archetypes.length);
// Without this, section 5's "distinct >= min(4, definitions.length)"
// passes with a green tick when definitions is EMPTY — which is exactly
// the state the first run was in. A vacuous pass on the assertion that
// proves the archetypes differ is worse than no assertion.
check("and there is something to compare in the first place", definitions.length >= 5, `${definitions.length} found`);
for (const def of definitions) {
  const name = def.match(/^- ([a-z-]+):/)?.[1] ?? "?";
  for (const [axis, re] of AXES) {
    check(`${name}: states ${axis}`, re.test(def), def.slice(0, 160));
  }
}

console.log("\n== 5. the archetypes are actually different from each other ==");
// The failure this catches: six archetypes whose specs all say the same
// thing in different words, which would produce six identical pages and
// six confident declarations.
function axisValue(def, axis) {
  return (def.match(new RegExp(`${axis}:\\s*([^\\n]+)`))?.[1] ?? "").toLowerCase().trim();
}
for (const [axis] of AXES) {
  const values = definitions.map((d) => axisValue(d, axis));
  const distinct = new Set(values.filter(Boolean));
  check(
    `${axis} takes ${distinct.size} distinct values across ${definitions.length} archetypes`,
    distinct.size >= Math.min(4, definitions.length),
    values.join(" | ")
  );
}
// The two the brief named explicitly as a contrast: text-first vs
// image-first. If those two collide, nothing else matters.
const editorial = definitions.find((d) => /^- editorial:/.test(d)) ?? "";
const gallery = definitions.find((d) => /^- gallery:/.test(d)) ?? "";
check("an editorial archetype exists", Boolean(editorial));
check("a gallery archetype exists", Boolean(gallery));
check(
  "editorial leads with text, gallery leads with images",
  /text/i.test(axisValue(editorial, "FIRST")) && /image|photo|work/i.test(axisValue(gallery, "FIRST")),
  `editorial FIRST="${axisValue(editorial, "FIRST")}" gallery FIRST="${axisValue(gallery, "FIRST")}"`
);
check(
  "and they disagree about image density",
  axisValue(editorial, "IMAGES") !== axisValue(gallery, "IMAGES")
);

console.log("\n== 6. the generic shape is still allowed exactly once ==");
// product-landing is the one brief for which the familiar shape is
// correct. Banning it outright would be its own kind of wrong.
check("product-landing is one of the archetypes", archetypes.includes("product-landing"));
// This assertion was written against the OLD wording ("the ONE case where
// the familiar shape is correct") and went red when the section was
// rewritten. The prompt is stronger now, not weaker — the restriction
// moved into product-landing's own NEVER clause, which is where a model
// reading that archetype will actually encounter it. So the assertion
// follows the guarantee rather than the sentence it used to live in.
const productLanding = definitions.find((d) => /^- product-landing:/.test(d)) ?? "";
check(
  "product-landing's own definition restricts it to real software products",
  /NEVER:[^\n]*not actually a software product/i.test(productLanding),
  productLanding.slice(-220)
);
check(
  "and says plainly it is wrong for every other brief",
  /wrong answer for every other brief/i.test(productLanding)
);

console.log(`\n${failures.length === 0 ? "ALL PASS" : "FAILURES"}: ${pass} passed, ${failures.length} failed`);
process.exit(failures.length === 0 ? 0 : 1);
