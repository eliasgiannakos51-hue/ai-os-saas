// "Every generated website looks the same", and "it partly ignores my
// instructions".
//
// WHAT THE PROMPT ACTUALLY CONTAINED. There was never a literal template —
// no hardcoded "hero / three features / testimonial / footer" list. What
// there was, was worse, because it was invisible:
//
//   1. An explicit order to be identical: ANIMATIONS opened with
//      "reproduce these patterns consistently rather than inventing new
//      ones each time". Same three effects, same elements, every site.
//   2. Literal values that get copied verbatim: a sunset-to-purple
//      gradient written as four real hex codes, under a caveat saying
//      "pick colours that fit". A caveat does not beat four concrete
//      values sitting above it.
//   3. Exactly three font "vibe" mappings, so every site landed on one of
//      three typographic looks.
//   4. AND — the actual cause — TOTAL SILENCE ABOUT STRUCTURE. The prompt
//      was exhaustively specific about mechanics (fonts, animation CSS,
//      images, forms, safety) and said nothing about a lawyer's page
//      needing a different SHAPE from a cafe's. A model given detailed
//      mechanics and no structural guidance falls back on its strongest
//      prior for "make me a website": the generic centred-hero SaaS
//      landing page. The prompt's silence produced it, not a template
//      inside it.
//
// AND WHY INSTRUCTIONS GOT IGNORED: the static prompt is ~16,500
// characters against a typical brief of ~250 — 66:1 — nothing said the
// user's words outranked it, and the brief was not even last in the
// message (a list of storage URLs was).
//
// Message ORDER is asserted against the real wire format in
// website-continuation.itest.mjs sections 16-18. This file asserts the
// prompt's content, in the build gate.
//
// Run: node scripts/tests/website-variety.test.mjs
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

const src = readFileSync("src/lib/website-builder.ts", "utf8");
function section(name) {
  const start = src.indexOf(`const ${name} = \``);
  if (start < 0) return "";
  const from = start + `const ${name} = \``.length;
  return src.slice(from, src.indexOf("`;", from));
}

console.log("== 1. the instruction to be identical every time is gone ==");
const animations = section("ANIMATIONS_SECTION");
check(
  "ANIMATIONS no longer orders consistency over invention",
  !/reproduce these patterns consistently/.test(animations)
);
check("they are framed as reference implementations", /REFERENCE IMPLEMENTATIONS/.test(animations));
check("with an explicit 'one, or none'", /Most good sites use one, or none/.test(animations));
check("using all of them is named as a failure", /Using all five on every site is a failure/.test(animations));
check("and restraint is allowed to be correct", /BETTER with no animation at all/.test(animations));

console.log("\n== 2. no literal palette left to copy ==");
// Four real hex codes under a "pick colours that fit" caveat is a palette,
// whatever the caveat says.
check("the sunset/purple gradient literals are gone", !/#ff7e5f|#feb47b|#6a11cb|#2575fc/.test(animations));
check("replaced by named placeholders", /COLOR_1, COLOR_2, COLOR_3, COLOR_4/.test(animations));
check(
  "and the reason is stated where it will be read",
  /literal purple\/orange gradient on a law firm/.test(animations)
);
// The only hex values left anywhere in the prompt should be neutral
// shadow/overlay rgba, not brand colours.
const promptHexes = [...src.matchAll(/`[^`]*`/gs)]
  .map((m) => m[0])
  .join("")
  .match(/#[0-9a-fA-F]{6}\b/g) ?? [];
const brandish = promptHexes.filter((h) => !/^#(fff|000)/i.test(h) && h !== "#1d4ed8");
check(
  `no brand-looking hex codes remain in the prompt (found ${brandish.length})`,
  brandish.length === 0,
  brandish.join(", ")
);

console.log("\n== 3. structure is now taught, not left silent ==");
const shape = section("SITE_SHAPE_SECTION");
check("a SITE SHAPE section exists at all", shape.length > 500);
check("it is the FIRST decision, before markup", /DECIDE THIS FIRST, BEFORE YOU WRITE ANY HTML/.test(shape));
check(
  "and it is placed before fonts and animations in the prompt",
  src.indexOf("${SITE_SHAPE_SECTION}") < src.indexOf("${FONTS_SECTION}")
);
// The archetypes have to be genuinely DIFFERENT, not one shape relabelled.
const ARCHETYPES = [
  "LOCAL PLACE",
  "PROFESSIONAL SERVICES",
  "PORTFOLIO / CREATIVE",
  "PRODUCT / SAAS / APP",
  "EVENT / CAMPAIGN / SINGLE PURPOSE",
  "PERSONAL / CV / WRITING",
  "CATALOGUE / LISTINGS",
];
for (const a of ARCHETYPES) check(`${a} is described`, shape.includes(a));
check("they are examples, not a closed enum", /not an enum/.test(shape));

console.log("\n== 4. the three briefs in the report get different shapes ==");
// cafe -> menu and hours high, photo-led
check("a cafe is told to put the menu high, not after feature cards", /menu, the price list, the timetable — HIGH ON THE PAGE/.test(shape));
check("with hours, address and phone as primary content", /Opening hours, address, a maps link and a tappable phone number/.test(shape));
// lawyer -> restrained, credentials, no icon cards
check("a lawyer is told to be restrained and typographic", /credibility-led and restrained/.test(shape));
check("explicitly NOT icon cards", /not icon cards, which read as unserious here/.test(shape));
check("with real credentials", /bar\/association membership/.test(shape));
// photographer -> work first, no testimonials
check("a photographer leads with the work itself", /The work IS the page/.test(shape));
check("often before any headline", /before any headline at all/.test(shape));
check("and without the marketing furniture", /no feature cards, no testimonials section unless asked/.test(shape));

console.log("\n== 5. the default shape is banned by name ==");
check("the generic landing page is forbidden explicitly", /FORBIDDEN DEFAULT/.test(shape));
check(
  "and described precisely enough to be recognised",
  /three feature cards with icons, a testimonial, a CTA band, a fat footer/.test(shape)
);
check("with the one case where it IS right", /ONE case where the familiar shape is correct/.test(shape));
check(
  "and a plain statement of what failure looks like",
  /would look like the same page with the words swapped, you have not done this step/.test(shape)
);

console.log("\n== 6. variety is required on every axis, not just structure ==");
for (const axis of ["HERO:", "NAVIGATION:", "SECTION RHYTHM:", "PALETTE:", "TYPOGRAPHY:", "DENSITY:"]) {
  check(`${axis} is a named axis of variation`, shape.includes(axis));
}
check("the over-used SaaS palette is called out", /Avoid the default indigo-to-violet gradient/.test(shape));

console.log("\n== 7. typography has more than three outcomes ==");
const fonts = section("FONTS_SECTION");
const mappings = (fonts.match(/^\s*\* /gm) ?? []).length;
check(`there are more than three vibe mappings (${mappings})`, mappings >= 6);
check("legal/medical gets its own, distinct direction", /legal \/ medical \/ financial \/ institutional/.test(fonts));
check("editorial gets its own", /editorial \/ writing \/ personal/.test(fonts));
check("and the over-used default is named", /most over-used font on the web/.test(fonts));
check("with the reason it was three before", /three mappings used to be listed here/i.test(fonts));

console.log("\n== 8. the user's brief is stated to outrank the prompt ==");
const precedence = section("USER_BRIEF_PRECEDENCE");
check("a precedence block exists", precedence.length > 200);
check("everything above is demoted to defaults", /Everything above is DEFAULT behaviour/.test(precedence));
check("the brief wins on contradiction", /the brief wins/.test(precedence));
check("no splitting the difference", /Do not compromise between the two/.test(precedence));
check(
  "and no substituting the model's own judgement",
  /do not decide the user would prefer your judgement/.test(precedence)
);
check("format, safety and honesty stay non-negotiable", /cannot override/.test(precedence));
check("it is appended to the generate prompt", /text: USER_BRIEF_PRECEDENCE/.test(src));
check(
  "and to the edit prompt too",
  (src.match(/text: USER_BRIEF_PRECEDENCE/g) ?? []).length === 2
);

console.log("\n== 9. the brief is positioned last, in both directions ==");
check("a labelled brief block is built", /function buildUserBriefBlock/.test(src));
check("generation puts image metadata first", /buildReferenceImageUrlList\(images\)\.trim\(\)\}\\n\\n\$\{buildUserBriefBlock/.test(src));
check("the edit path puts the change request last", /\$\{buildReferenceImageUrlList\(images\)\}\\n\\nTHE USER'S CHANGE REQUEST/.test(src));
check("and labels it as overriding too", /apply exactly this, and nothing else\. It overrides/.test(src));

console.log("\n== 10. the self-check verifies coverage, item by item ==");
const selfCheck = section("FINAL_SELF_CHECK_SECTION");
check("it enumerates explicit requirements first", /write down, for yourself, every EXPLICIT requirement/.test(selfCheck));
check("then checks them one at a time", /one item at a time against the HTML/.test(selfCheck));
check('"addressed in spirit" is rejected', /Not "addressed in spirit" — present/.test(selfCheck));
check(
  "a requirement the model disagrees with is still binding",
  /DO IT ANYWAY; it is their site/.test(selfCheck)
);
check("and it ends on the sameness question", /generic template with this business's words swapped in/.test(selfCheck));
// It must not reference a section the edit prompt does not include.
check(
  "it does not point at SITE SHAPE, which the edit prompt lacks",
  !/go back to SITE SHAPE/.test(selfCheck)
);

console.log("\n== 11. the ratio the brief has to compete against ==");
// Not a pass/fail on size — a recorded measurement, so a future edit that
// doubles the prompt is visible rather than silent.
const SECTIONS = [
  "SITE_SHAPE_SECTION",
  "FONTS_SECTION",
  "ANIMATIONS_SECTION",
  "IMAGE_RULES_HEADER",
  "WEB_SEARCH_SECTION",
  "FUNCTIONAL_ELEMENTS_SECTION",
  "PLACEHOLDER_DATA_SECTION",
  "FINAL_SELF_CHECK_SECTION",
];
let total = 0;
for (const name of SECTIONS) {
  const len = section(name).length;
  total += len;
  console.log(`        ${name.padEnd(30)} ${String(len).padStart(6)} chars`);
}
console.log(`        ${"TOTAL (sections only)".padEnd(30)} ${String(total).padStart(6)} chars ~ ${Math.round(total / 4)} tokens`);
check(
  `the prompt has not run away (${total} chars, ceiling 30000)`,
  total < 30000,
  "if this fires, the brief is competing against even more text — trim before adding"
);

console.log(`\n${failures.length === 0 ? "ALL PASS" : "FAILURES"}: ${pass} passed, ${failures.length} failed`);
process.exit(failures.length === 0 ? 0 : 1);
