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

const src = readFileSync("src/lib/website-builder.ts", "utf8");
/** A prompt section that lives in its own module: called for real, so
 *  what is measured is what the model is sent. */
async function composed(file, exportName) {
  const mod = await loadTs(file);
  return String(mod[exportName]());
}

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
const promptLiterals = [...src.matchAll(/`[^`]*`/gs)];
check(`the prompt template literals were found (${promptLiterals.length})`,
  promptLiterals.length >= 5,
  "no literals means no hex codes to find, and the check below passes on nothing");
const promptHexes = promptLiterals
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
//
// THIS BLOCK WENT RED WHEN THE SECTION WAS REWRITTEN, and it is worth
// saying why rather than just re-pointing it. The old assertions matched
// PROSE — "LOCAL PLACE", "credibility-led and restrained", "The work IS
// the page". Every one of those guarantees still holds; the sentences
// carrying them do not, because the third report of "every site looks the
// same" traced back to this section being a soft list. It is now a closed
// set of seven, each fixing five structural axes.
//
// So these check the GUARANTEE — that seven distinct shapes exist and each
// one commits on every axis — which is both what the old assertions were
// reaching for and something prose-matching could never have proved.
const ARCHETYPES = [
  "local-place",
  "professional-services",
  "gallery",
  "editorial",
  "catalogue",
  "event",
  "product-landing",
];
for (const a of ARCHETYPES) check(`${a} is described`, new RegExp(`^- ${a}:`, "m").test(shape));

// ONE ASSERTION HERE IS DELIBERATELY INVERTED, not relaxed. It used to
// read `check("they are examples, not a closed enum", /not an enum/)`.
// That sentence WAS the bug: the DESIGN DECISIONS block demands the page
// declare "one of:" a fixed list, while this section told the model the
// list was optional, and a rule that is optional in one paragraph is
// optional. The list is closed now, and the test says so.
check("the list is a CLOSED set, which the old prompt explicitly denied", /CHOOSE EXACTLY ONE/.test(shape));
check("and the old permissive sentence is gone", !/not an enum/.test(shape));
check("the archetype named in the declaration must come from it", /must be one of these seven words/.test(shape));

console.log("\n== 4. the three briefs in the report get different shapes ==");
// Same guarantees as before, read off the structured definitions rather
// than off the sentences that used to express them.
function shapeBlock(name) {
  return shape.split(/\n(?=- [a-z-]+:)/).find((b) => b.startsWith(`- ${name}:`)) ?? "";
}
const localPlace = shapeBlock("local-place");
const professional = shapeBlock("professional-services");
const galleryShape = shapeBlock("gallery");

// cafe -> menu and hours high, photo-led
check("a cafe covers cafes", /caf|restaurant|taverna/i.test(localPlace));
check("it leads with a photograph of the place", /FIRST:[^\n]*photograph/i.test(localPlace));
// THREE orders per shape, not one. A single order per archetype is what
// made two tavernas the same page — the shape decided the sections AND
// their sequence, so every local-place site ever generated ran photo >
// menu > hours > gallery > map. Each letter must exist, and no two of
// them may be the same list.
const localOrders = [...localPlace.matchAll(/ORDER ([ABC]):\s*(.+)/g)].map((m) => [m[1], m[2].trim()]);
check(`local-place offers three orders (${localOrders.map(([l]) => l).join("")})`, localOrders.length === 3);
check(
  "ORDER A still leads with the photo and then the menu",
  /^photo\s*>\s*menu/i.test(localOrders.find(([l]) => l === "A")?.[1] ?? "")
);
check(
  "and the three are three different lists, not one list relabelled",
  new Set(localOrders.map(([, list]) => list)).size === 3,
  JSON.stringify(localOrders.map(([, l]) => l))
);
check(
  "at least one order does NOT lead with the photo",
  localOrders.some(([, list]) => !/^photo/i.test(list)),
  "if every letter opens the same way, the letter is decoration"
);
check("with hours, address and phone as primary content", /hours and address and phone/i.test(localPlace));
check("and marketing prose above the menu is forbidden", /NEVER:[^\n]*marketing prose above the menu/i.test(localPlace));

// lawyer -> restrained, credentials, no icon cards
check("a lawyer's page leads with text, not a picture", /FIRST:[^\n]*sentence of plain text/i.test(professional));
check("explicitly NOT icon cards", /NEVER:[^\n]*icon cards/i.test(professional));
check("nor animation or a gradient", /NEVER:[^\n]*gradients?, animation/i.test(professional));
check("with real credentials", /credentials and qualifications/i.test(professional));
check("and deliberately sparse photography", /IMAGES:\s*sparse/i.test(professional));

// photographer -> work first, no testimonials
check("a photographer leads with the work itself", /FIRST:[^\n]*the work itself/i.test(galleryShape));
check("often before any headline", /before any headline at all/i.test(galleryShape));
check(
  "and without the marketing furniture",
  /NEVER:[^\n]*feature cards, testimonials/i.test(galleryShape)
);

// The contrast the brief asked for by name: text-first versus image-first.
const editorialShape = shapeBlock("editorial");
check("editorial is text-first", /FIRST:[^\n]*name and one true sentence/i.test(editorialShape));
check("gallery is image-first", /FIRST:[^\n]*work itself/i.test(galleryShape));
check(
  "and the two disagree about images",
  /IMAGES:\s*almost none/i.test(editorialShape) && /IMAGES:\s*the maximum/i.test(galleryShape)
);

console.log("\n== 5. the default shape is banned by name ==");
check("the generic landing page is forbidden explicitly", /FORBIDDEN DEFAULT/.test(shape));
check(
  "and described precisely enough to be recognised",
  /three feature cards with icons, a testimonial, a CTA band, a fat footer/.test(shape)
);
// The permission for the familiar shape did not disappear — it moved into
// product-landing's own NEVER clause, which is where a model reading that
// archetype actually meets it, rather than in a sentence three paragraphs
// away that it may never re-read.
check(
  "with the one case where it IS right",
  /- product-landing:[\s\S]*?NEVER:[^\n]*not actually a software product/i.test(shape)
);
check(
  "and every other brief told plainly it is the wrong answer",
  /wrong answer for every other brief on this list/i.test(shape)
);
check(
  "and a plain statement of what failure looks like",
  /would look like the same page with the words swapped, you have not done this step/.test(shape)
);

console.log("\n== 6. variety is required on every axis, not just structure ==");
for (const axis of ["HERO:", "NAVIGATION:", "SECTION RHYTHM:", "PALETTE:", "TYPOGRAPHY:", "DENSITY:"]) {
  check(`${axis} is a named axis of variation`, shape.includes(axis));
}
check("the over-used SaaS palette is called out", /indigo-to-violet gradient/.test(shape));
// AND THE PALETTE IS NOW DRAWN, not merely asked for. "Derive it from the
// subject" is an instruction in a BYTE-IDENTICAL cached prompt, so it is
// the same instruction on every call and gets the same answer — the
// mechanism website-variation.ts was created to replace, applied to five
// axes and not to this one. V4 #32, sixth report.
check("the palette points at the per-site strategy", /PALETTE STRATEGY named in this site's DESIGN VARIATION block/.test(shape));

// NO MOTION LITERAL SURVIVES IN THE CACHED PROMPT.
//
// The ANIMATIONS section used to hand the model copy-pasteable CSS
// containing 0.7s, 0.3s, 24px, -6px and calc(n * 0.1s), while the drawn
// MOTION VOCABULARY promised 400-600ms and 60-90ms. A concrete snippet
// beats a prose range every time, so every animated site ever generated
// moved at exactly the same speed — invisible to five rounds of
// structural gates. The numbers are placeholders now; these check they
// stay that way.
for (const [token, why] of [
  ["MOTION_DURATION", "how long"],
  ["MOTION_DISTANCE", "how far"],
  ["MOTION_EASING", "what curve"],
  ["MOTION_STAGGER", "how far apart"],
  ["MOTION_AMBIENT", "how long an ambient loop takes"],
]) {
  check(`${token} is a placeholder (${why})`, animations.includes(token));
}
const literals = animations.match(/(?:transition|animation)[^;]*?\b\d+(?:\.\d+)?m?s\b/g) ?? [];
check(
  `no transition or animation carries a hard-coded duration (${literals.length})`,
  literals.length === 0,
  literals.join(" | ")
);
check(
  "the reveal distance is a placeholder too",
  !/translateY\(\s*-?\d+px\s*\)/.test(animations),
  (animations.match(/translateY\([^)]*\)/g) ?? []).join(" | ")
);
check("and the rule is stated once", /are PLACEHOLDERS, like the gradient's COLOR_1\.\.COLOR_4/.test(animations));

console.log("\n== 7. typography has more than three outcomes, AND THEY ARE DRAWN ==");
const fonts = section("FONTS_SECTION");
check("the over-used default is named", /most over-used font on the web/.test(fonts));

// WHAT THIS SECTION USED TO CHECK, and why it changed.
//
// It counted the seven subject-to-font mappings in the prompt and
// required at least six. That was the right INTENT — typography must have
// more than three outcomes — tested by the wrong PROPERTY: a mapping in a
// byte-identical cached prompt is prose, and prose is what the sixth
// "same template" report says the model reads past. Seven mappings
// produced seven looks.
//
// The mappings are gone and the pairing is DRAWN by code, one per site.
// So the count moved to where the choice is actually made, and the bar
// went UP: ten pairings selected deterministically beats seven suggested.
const variationSrc = readFileSync("src/lib/website-variation.ts", "utf8");
const pairings = (variationSrc.match(/^\s{2}"'[^"]+for headings/gm) ?? []).length;
check(`the type pairings are drawn, not suggested (${pairings})`, pairings >= 8);
check("…and TYPE_PAIRINGS is one of the drawn axes", /typeface: pick\(TYPE_PAIRINGS, "typeface"\)/.test(variationSrc));
check("the prompt defers to the drawn pairing", /TYPE PAIRING named in this site's DESIGN VARIATION block/.test(fonts));
check("…and says why the seven mappings were removed", /same seven looks across every site/.test(fonts));

// EVERY DRAWN FONT MUST BE LOADABLE. A pairing naming a family that is
// not in GOOGLE_FONTS_LIST is a page with a font-family the browser
// silently falls back on — invisible in every source gate, and the
// generated site quietly renders in Times New Roman.
const availableFonts = new Set(
  [...src.matchAll(/"([A-Z][A-Za-z0-9 +]+)"/g)].map((m) => m[1])
);
const namedFonts = [...new Set([...variationSrc.matchAll(/'([A-Z][A-Za-z0-9 ]+)'/g)].map((m) => m[1]))];
const unloadable = namedFonts.filter((f) => !availableFonts.has(f));
check(`every drawn font is in GOOGLE_FONTS_LIST (${namedFonts.length} named)`, unloadable.length === 0, unloadable.join(", "));
check("the scan actually found the drawn fonts", namedFonts.length >= 10, String(namedFonts.length));

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
// The user text became an ordered array when the per-site variation draw
// joined it: [image metadata, variation draw, brief], joined and
// filtered. The ORDER is the property: images first, the brief LAST —
// and the draw must sit between them, in the uncached user message.
check(
  "generation puts image metadata first, the draw and the brief's prohibitions between, and the brief last",
  /const userText = \[\s*buildReferenceImageUrlList\(images\)\.trim\(\),\s*variationText\?\.trim\(\) \?\? "",\s*negativeInstructionBlock\(parseNegativeInstructions\(description\)\),\s*buildUserBriefBlock\(description\),\s*\]/.test(
    src
  )
);
// The property is about the per-call VALUE, not the word. The prompt is
// allowed — required, even — to say "the DESIGN VARIATION block below
// names which letter to use": that sentence is identical on every call, so
// it caches. What must never appear above the cached constants is
// `variationText`, the value that differs per site: interpolating it into
// a cache_control block would re-prime the cache on every generation.
const beforeConstants = src.slice(0, src.indexOf("const SYSTEM_PROMPT"));
check(
  "the per-site draw is used by the request builder",
  /variationText/.test(src.slice(src.indexOf("export async function generateWebsiteHtml")))
);
check(
  "…and never inside a cached module constant",
  !/variationText/.test(beforeConstants),
  "a per-call value in a cache_control block re-primes the cache every generation"
);
check(
  "no cached block interpolates anything at all",
  !/\$\{[^}]*\}/.test(beforeConstants.slice(beforeConstants.indexOf("SITE_SHAPE_SECTION"))) ||
    !/text:\s*`/.test(src),
  "module constants must be literal strings, not templates over per-call state"
);
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
// THE SECTIONS THAT LIVE IN THEIR OWN FILES COUNT TOO.
//
// This list used to be the const declarations in website-builder.ts, and
// it read as "the prompt". It was not: the multi-page section arrived in
// its own module and the SEO section after it, both composed into the
// same system prompt, and neither was measured. The ceiling was
// therefore guarding a number that was smaller than the thing it was
// guarding — the exact instrument failure this file exists to catch in
// the prompt itself.
const COMPOSED = [
  ["multipageInstruction()", await composed("src/lib/website-multipage.ts", "multipageInstruction")],
  ["seoInstruction()", await composed("src/lib/seo/prompt.ts", "seoInstruction")],
];
let total = 0;
for (const name of SECTIONS) {
  const len = section(name).length;
  total += len;
  console.log(`        ${name.padEnd(30)} ${String(len).padStart(6)} chars`);
}
for (const [name, text] of COMPOSED) {
  check(`${name} is actually composed into the system prompt`, src.includes(`\${${name}}`), name);
  total += text.length;
  console.log(`        ${name.padEnd(30)} ${String(text.length).padStart(6)} chars`);
}
console.log(`        ${"TOTAL (sections only)".padEnd(30)} ${String(total).padStart(6)} chars ~ ${Math.round(total / 4)} tokens`);
check(
  `the prompt has not run away (${total} chars, ceiling 30000)`,
  total < 30000,
  "if this fires, the brief is competing against even more text — trim before adding"
);

console.log(`\n${failures.length === 0 ? "ALL PASS" : "FAILURES"}: ${pass} passed, ${failures.length} failed`);
process.exit(failures.length === 0 ? 0 : 1);
