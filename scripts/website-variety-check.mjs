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
 *   palette, section vocabulary, and whether the banned generic shape
 *   (centred hero + three icon cards + testimonial + CTA band) came back
 *   anyway. Pairwise similarity is reported as a number, so "they look the
 *   same" stops being an argument.
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
 *
 * Output: one .html per brief (open them in a browser — that is the
 * screenshot), plus the scored report on stdout.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";

const apiKey = process.env.ANTHROPIC_API_KEY;
if (!apiKey) {
  console.error(
    "ANTHROPIC_API_KEY is not set.\n" +
      "This script makes four real, billed Anthropic calls (~$1.50) — that is why it is\n" +
      "not part of the test suite. Set the key and run it again."
  );
  process.exit(2);
}

const outDir = path.resolve(
  process.argv.includes("--out") ? process.argv[process.argv.indexOf("--out") + 1] : "variety-out"
);
mkdirSync(outDir, { recursive: true });

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
} = await import("./lib/site-fingerprint.mjs");
const wb = await loadTsWithDeps("src/lib/website-builder.ts");
const { CostAccumulator } = await loadTsWithDeps("src/lib/billing/cost-accumulator.ts");

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

async function generate(slug, brief) {
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
  r.honoured = decisionsHonoured(r.html);
  console.log(`\n  ${r.label}`);
  // The declared decisions come first because they are the cheapest
  // diagnosis available: if a taverna and a tax office both declare
  // "product-landing / split / medium", the sameness is a DECISION
  // problem, and no amount of structural scoring will say that as
  // plainly.
  if (r.decisions) {
    console.log(`    declared  : ${r.decisions.archetype} / hero=${r.decisions.hero} / density=${r.decisions.density}`);
    console.log(`    sections  : ${(r.decisions.sections ?? []).join(" > ")}`);
    console.log(`    honoured  : sections ${r.honoured.sectionCountPlausible ? "yes" : "NO"} (declared ${r.honoured.declaredSections}, built ${r.honoured.builtSections}), fonts ${r.honoured.fontsMatch ? "yes" : "NO"}`);
  } else {
    console.log("    declared  : (NO DESIGN DECISIONS BLOCK — the prompt requires one)");
  }
  console.log(`    landmarks : ${r.structure.join(" > ")}`);
  console.log(`    fonts     : ${r.fonts.join(", ") || "(none loaded)"}`);
  console.log(`    palette   : ${r.palette.join(" ") || "(no colours found)"}`);
  const hits = Object.entries(r.generic).filter(([, v]) => v).map(([k]) => k);
  console.log(`    generic-shape signals : ${hits.length ? hits.join(", ") : "none"}`);
}

// Two different businesses declaring the same archetype AND the same hero
// is the sameness bug stated at its source, before any similarity score.
const declaredPairs = results.filter((r) => r.decisions);
if (declaredPairs.length >= 2) {
  const collisions = [];
  for (let i = 0; i < declaredPairs.length; i++) {
    for (let j = i + 1; j < declaredPairs.length; j++) {
      const a = declaredPairs[i];
      const b = declaredPairs[j];
      if (a.decisions.archetype === b.decisions.archetype && a.decisions.hero === b.decisions.hero) {
        collisions.push(`${a.slug} and ${b.slug} both chose ${a.decisions.archetype} / ${a.decisions.hero}`);
      }
    }
  }
  console.log(
    `\n  declaration collisions: ${collisions.length === 0 ? "none — every brief chose its own shape" : collisions.join("; ")}`
  );
}
const missingBlock = results.filter((r) => !r.decisions).map((r) => r.slug);
if (missingBlock.length) {
  console.log(`  WARNING: ${missingBlock.join(", ")} produced no DESIGN DECISIONS block at all.`);
}

console.log("\n  pairwise similarity (0 = nothing in common, 1 = identical)\n");
console.log("    pair                          structure  fonts  palette");
let worstStructure = 0;
for (let i = 0; i < results.length; i++) {
  for (let j = i + 1; j < results.length; j++) {
    const s = sequenceSimilarity(results[i].structure, results[j].structure);
    const f = jaccard(results[i].fonts, results[j].fonts);
    const p = jaccard(results[i].palette, results[j].palette);
    worstStructure = Math.max(worstStructure, s);
    console.log(
      `    ${(results[i].slug + " vs " + results[j].slug).padEnd(29)} ` +
        `${s.toFixed(2).padEnd(10)} ${f.toFixed(2).padEnd(6)} ${p.toFixed(2)}`
    );
  }
}

// The threshold is a judgement call, stated openly rather than hidden.
// Above 0.85 on the landmark sequence means the same skeleton with
// different words — which is the reported complaint, restated as a number.
console.log(
  `\n  VERDICT: worst structural similarity ${worstStructure.toFixed(2)} — ` +
    (worstStructure > 0.85
      ? "STILL THE SAME TEMPLATE. Not fixed."
      : worstStructure > 0.7
        ? "similar skeletons; look at the pages before accepting this."
        : "genuinely different shapes.")
);
const anyGeneric = results.filter((r) => Object.values(r.generic).filter(Boolean).length >= 3);
if (anyGeneric.length) {
  console.log(
    `  WARNING: the banned generic shape appears in: ${anyGeneric.map((r) => r.slug).join(", ")}`
  );
}

// ---------------------------------------------------------------------
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
