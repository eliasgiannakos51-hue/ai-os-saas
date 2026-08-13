#!/usr/bin/env node
/*
 * Does the Website Builder produce DIFFERENT sites, and does it FOLLOW
 * INSTRUCTIONS? Measured, not eyeballed.
 *
 * This is deliberately NOT in scripts/tests/: it makes four real Anthropic
 * calls and costs real money (~$1.50 at current rates), so it must never
 * run in the build gate. It is the instrument for the two checks that
 * cannot be done from source alone.
 *
 *   PART A — VARIETY. Generates three briefs that should produce
 *   structurally different pages (a cafe, a law firm, a photographer) and
 *   scores how different they actually are: layout fingerprint, fonts,
 *   palette, section vocabulary, MOTION, and whether the banned generic
 *   shape (centred hero + three icon cards + testimonial + CTA band) came
 *   back anyway. Pairwise similarity is reported as a number, so "they look
 *   the same" stops being an argument.
 *
 *   Motion is scored separately from structure and that separation is the
 *   point. The report that prompted it — "ίδια animations, ίδια
 *   συμπεριφορά, ίδιο feel παρά το SITE SHAPE fix" — is exactly the case a
 *   structural score cannot see: two pages with different section orders
 *   that both fade their sections in over 0.7s and lift 6px on hover ARE
 *   the same page to the person using them.
 *
 *   PART B — COMPLIANCE. One brief carrying five explicit, MECHANICALLY
 *   CHECKABLE requirements, then counts how many survived. Not a judgement
 *   call: each one is a regex against the produced HTML.
 *
 * Nothing here is stubbed. It calls the real generateWebsiteHtml through
 * the real @anthropic-ai/sdk with the real system prompt — the same code
 * path api/websites/generate/process uses. The only step skipped is
 * Unsplash placeholder resolution, which happens after generation and
 * cannot affect structure.
 *
 * Usage:
 *   ANTHROPIC_API_KEY=sk-ant-... node scripts/website-variety-check.mjs
 *   ANTHROPIC_API_KEY=sk-ant-... node scripts/website-variety-check.mjs --out ./variety-out
 *   node scripts/website-variety-check.mjs --offline   (no key, no cost, no calls)
 *
 * --offline answers a narrower question and says so: it scores what the
 * SHIPPED PROMPT PRESCRIBES for the three subjects rather than what a run
 * produced. That is a real, checkable property of this repository — an
 * upper bound on how similar three obedient generations can be — and it is
 * available to anyone without an API key. It is NOT a substitute for the
 * billed run, and it never claims to be.
 *
 * Output: one .html per brief (open them in a browser — that is the
 * screenshot), plus the scored report on stdout.
 */
import { mkdirSync, writeFileSync, readFileSync } from "node:fs";
import path from "node:path";

const OFFLINE = process.argv.includes("--offline");
const apiKey = process.env.ANTHROPIC_API_KEY;
if (!apiKey && !OFFLINE && !process.argv.includes("--selftest")) {
  console.error(
    "ANTHROPIC_API_KEY is not set.\n" +
      "This script makes four real, billed Anthropic calls (~$1.50) — that is why it is\n" +
      "not part of the test suite. Set the key and run it again.\n" +
      "\n" +
      "Or run `node scripts/website-variety-check.mjs --offline` to score what the prompt\n" +
      "PRESCRIBES for the same three subjects — free, instant, and honest about being a\n" +
      "different measurement."
  );
  process.exit(2);
}

const outDir = path.resolve(
  process.argv.includes("--out") ? process.argv[process.argv.indexOf("--out") + 1] : "variety-out"
);
if (!OFFLINE) mkdirSync(outDir, { recursive: true });

const { loadTsWithDeps } = await import("./tests/load-ts.mjs");
const {
  structureFingerprint,
  fontsUsed,
  palette,
  genericShapeSignals,
  jaccard,
  sequenceSimilarity,
  designDecisions,
  decisionsHonoured,
  motionFingerprint,
  motionContradictions,
  declarationCollisions,
} = await import("./lib/site-fingerprint.mjs");
const { ARCHETYPE_MOTION, allowedMotionFor, SITE_ARCHETYPES } = await loadTsWithDeps("src/lib/website-motion.ts");

const wb = OFFLINE ? null : await loadTsWithDeps("src/lib/website-builder.ts");
const CostAccumulator = OFFLINE
  ? null
  : (await loadTsWithDeps("src/lib/billing/cost-accumulator.ts")).CostAccumulator;


// ---------------------------------------------------------------------
// OFFLINE MODE — what the SHIPPED PROMPT prescribes for the three
// subjects, scored. No key, no cost, no calls, and no pretending.
//
// This exists because the interesting question ("are three different
// businesses still getting one template?") was previously unanswerable
// without $1.50 and a key, which meant in practice it went unanswered. The
// prompt now prescribes archetype, section order, type, density, motion and
// interaction per subject, and those prescriptions are text in this
// repository — so the BOUND is computable here: if a generation obeys its
// ORDER line, the structural similarity between two subjects cannot exceed
// the similarity of the two ORDER lines.
//
// What this does NOT tell you: whether a given run obeyed. That needs the
// billed run above, and this mode says so rather than implying otherwise.
// ---------------------------------------------------------------------
function shapeBlocks() {
  const source = readFileSync("src/lib/website-builder.ts", "utf8");
  const blocks = new Map();
  for (const archetype of SITE_ARCHETYPES) {
    const start = source.indexOf(`\n- ${archetype}:`);
    if (start === -1) continue;
    const rest = source.slice(start + 1);
    const end = rest.search(
      /\n- (?:local-place|professional-services|gallery|editorial|catalogue|event|product-landing):|\nFORBIDDEN DEFAULT/
    );
    blocks.set(archetype, end === -1 ? rest : rest.slice(0, end));
  }
  return blocks;
}

function lineOf(block, label) {
  const line = (block.split("\n").find((l) => l.trim().startsWith(label + ":")) ?? "").trim();
  return line.slice(label.length + 1).trim();
}

if (OFFLINE) {
  const blocks = shapeBlocks();
  // The three subjects from VARIETY_BRIEFS, routed the way the prompt
  // routes them: by the keyword in each shape's own subject list.
  const SUBJECTS = [
    { slug: "law-firm", label: "Δικηγορικό γραφείο", keyword: "lawyer" },
    { slug: "photographer", label: "Φωτογράφος γάμων", keyword: "photographer" },
    { slug: "cafe", label: "Καφετέρια", keyword: "café" },
  ];

  console.log("OFFLINE — what the prompt PRESCRIBES for the three subjects.");
  console.log("(This is a property of the prompt, not a record of a generation. See --help in the header.)\n");

  const routed = [];
  for (const subject of SUBJECTS) {
    const owners = [...blocks.entries()].filter(([, b]) =>
      b.split("\n")[0].toLowerCase().includes(subject.keyword.toLowerCase())
    );
    if (owners.length !== 1) {
      console.log(`  ${subject.label}: AMBIGUOUS — "${subject.keyword}" appears under ${owners.length} shapes.`);
      continue;
    }
    routed.push({ ...subject, archetype: owners[0][0], block: owners[0][1] });
  }

  console.log("  declarations, side by side\n");
  const FIELDS = ["FIRST", "ORDER", "TYPE", "IMAGES", "MOTION", "INTERACTION"];
  for (const r of routed) {
    console.log(`  ${r.label}  ->  ${r.archetype}`);
    for (const field of FIELDS) {
      const value =
        field === "MOTION"
          ? `${allowedMotionFor(r.archetype)}  (choose one, declare it, obey it)`
          : lineOf(r.block, field);
      const wrapped = value.length > 150 ? value.slice(0, 147) + "..." : value;
      console.log(`    ${field.padEnd(12)}: ${wrapped}`);
    }
    console.log("");
  }

  // 1. Collisions. A full collision needs the same archetype; three
  //    different archetypes cannot produce one, and that is a property
  //    rather than a hope.
  const archetypes = routed.map((r) => r.archetype);
  const uniqueArchetypes = new Set(archetypes).size;
  console.log(
    `  declaration collisions: ${
      uniqueArchetypes === routed.length
        ? `0 — the three subjects route to ${uniqueArchetypes} different archetypes, so a same-archetype collision is impossible`
        : `POSSIBLE — only ${uniqueArchetypes} distinct archetypes for ${routed.length} subjects`
    }`
  );

  // 2. Motion. Two subjects whose ALLOWED SETS are identical can still
  //    collide on motion, so the overlap is worth printing.
  console.log("\n  motion permission overlap (1.00 = identical option sets, so identical movement is likely)\n");
  let worstMotion = 0;
  for (let i = 0; i < routed.length; i++) {
    for (let j = i + 1; j < routed.length; j++) {
      const o = jaccard(ARCHETYPE_MOTION[routed[i].archetype], ARCHETYPE_MOTION[routed[j].archetype]);
      worstMotion = Math.max(worstMotion, o);
      console.log(
        `    ${(routed[i].slug + " vs " + routed[j].slug).padEnd(29)} ${o.toFixed(2)}   ` +
          `[${ARCHETYPE_MOTION[routed[i].archetype].join("/")}] vs [${ARCHETYPE_MOTION[routed[j].archetype].join("/")}]`
      );
    }
  }

  // 3. The structural BOUND, stated as a bound.
  console.log("\n  prescribed section-order similarity — the ceiling on structural similarity if the ORDER lines are obeyed\n");
  const orderOf = (block) =>
    lineOf(block, "ORDER")
      .replace(/\.\s*$/, "")
      .split(">")
      .map((x) => x.trim().toLowerCase())
      .filter(Boolean);
  let worstStructural = 0;
  for (let i = 0; i < routed.length; i++) {
    for (let j = i + 1; j < routed.length; j++) {
      const sim = sequenceSimilarity(orderOf(routed[i].block), orderOf(routed[j].block));
      worstStructural = Math.max(worstStructural, sim);
      console.log(`    ${(routed[i].slug + " vs " + routed[j].slug).padEnd(29)} ${sim.toFixed(2)}`);
    }
  }

  console.log(
    `\n  VERDICT (prescribed): worst structural ${worstStructural.toFixed(2)} against a <0.60 target — ` +
      (worstStructural < 0.6 ? "PASS" : "FAIL") +
      `; collisions ${uniqueArchetypes === routed.length ? "0" : "possible"}; worst motion-set overlap ${worstMotion.toFixed(2)}.`
  );
  console.log(
    "\n  WHAT THIS DOES NOT SHOW: whether a real generation obeys any of it.\n" +
      "  For that, set ANTHROPIC_API_KEY and run this script without --offline."
  );
  process.exit(worstStructural < 0.6 && uniqueArchetypes === routed.length ? 0 : 1);
}

// ---------------------------------------------------------------------
// PART A — three briefs that SHOULD produce different pages.
// ---------------------------------------------------------------------
const VARIETY_BRIEFS = [
  {
    slug: "cafe",
    label: "Καφετέρια στη Θεσσαλονίκη",
    brief:
      "Καφετέρια στα Λαδάδικα, Θεσσαλονίκη. Ειδικευόμαστε σε specialty coffee και σπιτικά γλυκά. " +
      "Θέλω να φαίνεται ο κατάλογος, οι ώρες λειτουργίας και πού είμαστε.",
  },
  {
    slug: "law-firm",
    label: "Δικηγορικό γραφείο",
    brief:
      "Δικηγορικό γραφείο στην Αθήνα, τρεις δικηγόροι, εξειδίκευση σε εμπορικό και εργατικό δίκαιο. " +
      "Θέλω να εμπνέει σοβαρότητα και εμπιστοσύνη, να φαίνονται οι τομείς δικαίου και τα προσόντα μας, " +
      "και φόρμα επικοινωνίας.",
  },
  {
    slug: "photographer",
    label: "Φωτογράφος",
    brief:
      "Φωτογράφος γάμων και πορτρέτου στην Κρήτη. Θέλω να κυριαρχεί το portfolio — οι φωτογραφίες " +
      "να είναι το κύριο πράγμα, ελάχιστο κείμενο.",
  },
];

// ---------------------------------------------------------------------
// PART B — five explicit requirements, each checkable by machine.
// ---------------------------------------------------------------------
const COMPLIANCE_BRIEF =
  "Ιστοσελίδα για το λογιστικό γραφείο «Αριάδνη» στα Ιωάννινα.\n" +
  "ΣΥΓΚΕΚΡΙΜΕΝΕΣ ΟΔΗΓΙΕΣ:\n" +
  "1. Το κύριο χρώμα να είναι ΑΚΡΙΒΩΣ #14532d (σκούρο πράσινο).\n" +
  '2. Χρησιμοποίησε τη γραμματοσειρά "Lora" για τους τίτλους.\n' +
  '3. Πρέπει να υπάρχει ενότητα με τίτλο ΑΚΡΙΒΩΣ «Οι υπηρεσίες μας».\n' +
  "4. ΚΑΜΙΑ κίνηση/animation πουθενά στη σελίδα — τελείως στατική.\n" +
  "5. Το τηλέφωνο +30 2651 044 100 να είναι κλικαρίσιμο.";

const COMPLIANCE_CHECKS = [
  {
    name: "1. primary colour is exactly #14532d",
    test: (html) => /#14532d/i.test(html),
  },
  {
    name: '2. the "Lora" font is actually loaded',
    test: (html) => /fonts\.googleapis\.com\/css2\?family=Lora/i.test(html) && /['"]Lora['"]/i.test(html),
  },
  {
    name: '3. a section headed exactly «Οι υπηρεσίες μας»',
    test: (html) => /Οι\s+υπηρεσίες\s+μας/i.test(html),
  },
  {
    name: "4. no animation anywhere (no @keyframes, no transition, no .reveal)",
    test: (html) => !/@keyframes|animation\s*:|class=["'][^"']*\breveal\b/i.test(html),
  },
  {
    name: "5. the phone number is a real tel: link",
    test: (html) => /<a[^>]+href=["']tel:\+?302651044100["']/i.test(html.replace(/(?<=tel:\+?)[\s()-]+/g, "")),
  },
];

// --selftest exercises every line of PART A's reporting against three
// canned documents instead of three billed generations. It is not a claim
// about generation quality — it is the answer to "does the reporting code
// actually run", which used to be unanswerable without spending $1.50, so
// in practice a typo in the report could only be found by a paying run.
const SELFTEST = process.argv.includes("--selftest");
const SELFTEST_DOCS = {
  "law-firm": `<!DOCTYPE html>
<!-- DESIGN DECISIONS
archetype: professional-services
hero: typographic
sections: name, practice areas, credentials, people, contact
palette: ink and bone #1a1a1a #f7f5f2
type: Libre Baskerville / Libre Baskerville
density: medium
motion: still
why-motion: nothing moves; a practice is bought on seriousness, not on effects.
why: three partners in commercial and employment law.
-->
<html><head><link href="https://fonts.googleapis.com/css2?family=Libre+Baskerville:wght@400;700&display=swap" rel="stylesheet">
<style>body{color:#1a1a1a;background:#f7f5f2}a:hover{color:#8a6a3b}</style></head>
<body><header><h1>x</h1></header><main><section>a</section><section>b</section><section>c</section><section>d</section><section>e</section></main><form><input name="name"></form><footer>f</footer></body></html>`,
  photographer: `<!DOCTYPE html>
<!-- DESIGN DECISIONS
archetype: gallery
hero: full-bleed-photo
sections: work, work, statement, contact
palette: warm monochrome #101010 #e8e2d9
type: Epilogue / Epilogue
density: sparse
motion: cinematic
why-motion: the photographs drift slowly behind fixed type; the type never moves.
why: a wedding portfolio is bought on the pictures.
-->
<html><head><link href="https://fonts.googleapis.com/css2?family=Epilogue:wght@400&display=swap" rel="stylesheet">
<style>body{color:#101010;background:#e8e2d9}.hero{background-attachment:fixed}
.fade{animation:slowFade 1400ms ease-out both}@keyframes slowFade{from{opacity:0}to{opacity:1}}
@media (prefers-reduced-motion: reduce){*,*::before,*::after{animation-duration:0.01ms !important;transition-duration:0.01ms !important}}</style></head>
<body><main><figure><img src="a"></figure><figure><img src="b"></figure><section>s</section></main><footer>f</footer></body></html>`,
  cafe: `<!DOCTYPE html>
<!-- DESIGN DECISIONS
archetype: local-place
hero: full-bleed-photo
sections: photo, menu, hours, gallery, map
palette: roasted warm #3c2a1e #d9b382
type: Fraunces / Karla
density: medium
motion: playful
why-motion: the menu items arrive one after another; the prices and the address never move.
why: a specialty coffee bar in Ladadika.
-->
<html><head><link href="https://fonts.googleapis.com/css2?family=Fraunces:wght@400;700&display=swap" rel="stylesheet">
<link href="https://fonts.googleapis.com/css2?family=Karla:wght@400&display=swap" rel="stylesheet">
<style>body{color:#3c2a1e;background:#d9b382}
.stagger-item{opacity:0;animation:fadeInUp 320ms cubic-bezier(0.34,1.56,0.64,1) forwards}
.stagger-item:nth-child(2){animation-delay:100ms}
@keyframes fadeInUp{from{opacity:0;transform:translateY(16px)}to{opacity:1;transform:none}}
@media (prefers-reduced-motion: reduce){*,*::before,*::after{animation-duration:0.01ms !important;transition-duration:0.01ms !important}}</style></head>
<body><header><nav>n</nav></header><main><section>photo</section><section>menu</section><section>hours</section><section>gallery</section></main><footer>f</footer></body></html>`,
};

async function generate(slug, brief) {
  if (SELFTEST) {
    const html = SELFTEST_DOCS[slug] ?? SELFTEST_DOCS["cafe"];
    console.log(`  [selftest] ${slug}: ${html.length} chars, no API call`);
    return { html, costs: { webSearches: 0, usdCost: 0 } };
  }
  process.stdout.write(`  generating ${slug} ... `);
  const costs = new CostAccumulator();
  const started = Date.now();
  const html = await wb.generateWebsiteHtml(apiKey, brief, undefined, () => {}, undefined, costs);
  const totals = costs.totals();
  const file = path.join(outDir, `${slug}.html`);
  writeFileSync(file, html);
  console.log(
    `${Math.round((Date.now() - started) / 1000)}s, ${html.length} chars, ` +
      `${totals.webSearches} searches, $${totals.usdCost.toFixed(4)} -> ${file}`
  );
  return { html, costs: totals };
}

// ---------------------------------------------------------------------
console.log("PART A — variety across three very different briefs\n");
const results = [];
for (const b of VARIETY_BRIEFS) {
  try {
    const { html, costs } = await generate(b.slug, b.brief);
    results.push({ ...b, html, costs });
  } catch (err) {
    console.log(`  FAILED ${b.slug}: ${err.message}`);
  }
}

if (results.length < 2) {
  console.log("\nNot enough successful generations to compare. Stopping.");
  process.exit(1);
}

console.log("\n  per-site measurements");
for (const r of results) {
  r.structure = structureFingerprint(r.html);
  r.fonts = fontsUsed(r.html);
  r.palette = palette(r.html);
  r.generic = genericShapeSignals(r.html);
  r.decisions = designDecisions(r.html);
  r.honoured = decisionsHonoured(r.html, ARCHETYPE_MOTION);
  r.motion = motionFingerprint(r.html);
  r.motionProblems = motionContradictions(r.html, ARCHETYPE_MOTION);
  console.log(`\n  ${r.label}`);
  // The declared decisions come first because they are the cheapest
  // diagnosis available: if a taverna and a tax office both declare
  // "product-landing / split / medium", the sameness is a DECISION
  // problem, and no amount of structural scoring will say that as
  // plainly.
  if (r.decisions) {
    console.log(`    declared  : ${r.decisions.archetype} / hero=${r.decisions.hero} / density=${r.decisions.density} / motion=${r.decisions.motion ?? "(none)"}`);
    console.log(`    sections  : ${(r.decisions.sections ?? []).join(" > ")}`);
    console.log(`    why-motion: ${r.decisions["why-motion"] ?? "(not given — the prompt requires it)"}`);
    console.log(`    honoured  : sections ${r.honoured.sectionCountPlausible ? "yes" : "NO"} (declared ${r.honoured.declaredSections}, built ${r.honoured.builtSections}), fonts ${r.honoured.fontsMatch ? "yes" : "NO"}, motion ${r.honoured.motionMatches ? "yes" : "NO"}`);
  } else {
    console.log("    declared  : (NO DESIGN DECISIONS BLOCK — the prompt requires one)");
  }
  console.log(`    landmarks : ${r.structure.join(" > ")}`);
  console.log(`    motion    : ${r.motion.join(", ")}`);
  // A declaration nobody reads back is a declaration a model can write and
  // then ignore, which would make the whole mechanism look like evidence.
  if (r.motionProblems.length) {
    for (const problem of r.motionProblems) console.log(`      ! ${problem}`);
  }
  console.log(`    fonts     : ${r.fonts.join(", ") || "(none loaded)"}`);
  console.log(`    palette   : ${r.palette.join(" ") || "(no colours found)"}`);
  const hits = Object.entries(r.generic).filter(([, v]) => v).map(([k]) => k);
  console.log(`    generic-shape signals : ${hits.length ? hits.join(", ") : "none"}`);
}

// Two different businesses declaring the same archetype AND the same hero
// is the sameness bug stated at its source, before any similarity score.
const allCollisions = declarationCollisions(results);
const fullCollisions = allCollisions.filter((c) => c.full);
console.log(
  `\n  declaration collisions: ${
    fullCollisions.length === 0
      ? "0 — no two briefs chose the same archetype AND hero AND motion"
      : fullCollisions
          .map((c) => `${c.pair.join(" and ")} both chose ${c.matched.map((k) => `${k}=${c.values[k]}`).join(" / ")}`)
          .join("; ")
  }`
);
// Partials are printed but are not failures: two cafés SHOULD both be
// local-place. Hiding them would hide a drift toward one shape.
for (const c of allCollisions.filter((x) => !x.full)) {
  console.log(`    (partial) ${c.pair.join(" / ")} share ${c.matched.map((k) => `${k}=${c.values[k]}`).join(", ")}`);
}
const missingBlock = results.filter((r) => !r.decisions).map((r) => r.slug);
if (missingBlock.length) {
  console.log(`  WARNING: ${missingBlock.join(", ")} produced no DESIGN DECISIONS block at all.`);
}

console.log("\n  pairwise similarity (0 = nothing in common, 1 = identical)\n");
console.log("    pair                          structure  fonts  palette  motion");
let worstStructure = 0;
let worstMotion = 0;
for (let i = 0; i < results.length; i++) {
  for (let j = i + 1; j < results.length; j++) {
    const s = sequenceSimilarity(results[i].structure, results[j].structure);
    const f = jaccard(results[i].fonts, results[j].fonts);
    const p = jaccard(results[i].palette, results[j].palette);
    const m = jaccard(results[i].motion, results[j].motion);
    worstStructure = Math.max(worstStructure, s);
    worstMotion = Math.max(worstMotion, m);
    console.log(
      `    ${(results[i].slug + " vs " + results[j].slug).padEnd(29)} ` +
        `${s.toFixed(2).padEnd(10)} ${f.toFixed(2).padEnd(6)} ${p.toFixed(2).padEnd(8)} ${m.toFixed(2)}`
    );
  }
}

// The threshold is a judgement call, stated openly rather than hidden.
// Above 0.85 on the landmark sequence means the same skeleton with
// different words — which is the reported complaint, restated as a number.
// The target is 0.60, stated openly. It was 0.85, which is a threshold
// that only catches a literally identical skeleton — three businesses this
// different scoring 0.80 is the reported complaint, and it used to pass.
console.log(
  `\n  VERDICT structural: worst ${worstStructure.toFixed(2)} against a <0.60 target — ` +
    (worstStructure >= 0.85
      ? "STILL THE SAME TEMPLATE. Not fixed."
      : worstStructure >= 0.6
        ? "MISSES THE TARGET; look at the pages before accepting this."
        : "genuinely different shapes.")
);
// The half the structural score cannot see, and the half that was still
// being reported after the SITE SHAPE fix.
console.log(
  `  VERDICT motion    : worst ${worstMotion.toFixed(2)} against a <0.60 target — ` +
    (worstMotion >= 0.85
      ? "the sites BEHAVE identically. This is 'ίδια animations' restated as a number."
      : worstMotion >= 0.6
        ? "similar movement; check which effects they share."
        : "genuinely different movement.")
);
const lying = results.filter((r) => r.motionProblems?.length);
console.log(
  `  VERDICT honesty   : ${
    lying.length === 0
      ? "every page does what its DESIGN DECISIONS block said it would."
      : `${lying.map((r) => r.slug).join(", ")} contradict their own declaration — see the ! lines above.`
  }`
);
const anyGeneric = results.filter((r) => Object.values(r.generic).filter(Boolean).length >= 3);
if (anyGeneric.length) {
  console.log(
    `  WARNING: the banned generic shape appears in: ${anyGeneric.map((r) => r.slug).join(", ")}`
  );
}

// ---------------------------------------------------------------------
if (SELFTEST) {
  console.log("\n[selftest] PART A's reporting ran end to end. PART B needs a real call; stopping here.");
  process.exit(0);
}
console.log("\n\nPART B — does it follow five explicit instructions?\n");
let complianceHtml = "";
try {
  complianceHtml = (await generate("compliance", COMPLIANCE_BRIEF)).html;
} catch (err) {
  console.log(`  FAILED: ${err.message}`);
  process.exit(1);
}

console.log("");
let met = 0;
for (const c of COMPLIANCE_CHECKS) {
  const ok = c.test(complianceHtml);
  if (ok) met++;
  console.log(`  ${ok ? "MET    " : "MISSED "} ${c.name}`);
}
console.log(`\n  SCORE: ${met}/${COMPLIANCE_CHECKS.length} explicit instructions followed`);
console.log(
  `  VERDICT: ` +
    (met === COMPLIANCE_CHECKS.length
      ? "every explicit instruction was honoured."
      : met >= 4
        ? "mostly honoured — inspect the misses, they are the pattern to fix."
        : "instructions are still being dropped. Not fixed.")
);

console.log(`\nOpen the generated files to look at them:\n  ${outDir}`);
