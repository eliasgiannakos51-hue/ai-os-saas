#!/usr/bin/env node
/*
 * TEN PAIRS OF THE SAME KIND — do two cafés come out as two sites?
 *
 * scripts/website-variety-check.mjs asks whether a café, a law firm and a
 * photographer come out different. They should: their subjects pick
 * different archetypes. The complaint this file measures is the harder
 * one — two businesses of the SAME kind. Same subject, so the same
 * archetype by construction, and the only structural draw left between
 * them is the section order, which has three values today. This is the
 * number the templates proposal (V4.6, round 3) has to move, so it is
 * measured BEFORE the proposal is built and again after, with the same
 * instrument.
 *
 * WHAT IS GENERATED. Ten categories, two different businesses in each,
 * both through the production generator with the production draw. Each
 * pair is drawn as two DIFFERENT users with no prior sites — the case the
 * product cannot help with by remembering what it built before, so it is
 * the worst case and the honest one. --same-user draws them as one user's
 * first and second site instead, which is what step 1 of the proposal
 * (exclusion of the orders already used) changes.
 *
 * WHAT IS MEASURED, per pair, from the produced HTML and never the prompt:
 *   - the declared decisions (archetype / hero / section order) and
 *     whether the two pages collide on hero or on order;
 *   - structural similarity twice: the landmark sequence
 *     (scripts/lib/site-fingerprint.mjs) and the edit-distance score in
 *     src/lib/website-structural-similarity.ts — the second is the one the
 *     proposal would ship in the process route, so it is measured here
 *     with the same code;
 *   - visual similarity: fonts, colour, spacing, motion (site-fingerprint).
 *
 * THRESHOLDS are the ones website-variety-check.mjs states: structure
 * above 0.85 is the same skeleton, above 0.70 a similar one; visual above
 * 0.70 is the same look, above 0.30 over the target. The run exits 1 when
 * any pair crosses a hard line, so after the fix this is a gate and not a
 * chart.
 *
 * COST. Twenty billed generations. website-variety-check.mjs measured
 * about $0.38 per generation, so around $7.50 for the full ten pairs;
 * --pairs N runs the first N only. Not part of any test suite for that
 * reason. The scoring and the report are tested WITHOUT a key through
 * --dry, which reads pages already on disk — every run also writes its
 * pages there, so a run can be re-scored later without paying again.
 *
 * Run:
 *   ANTHROPIC_API_KEY=... node scripts/website-pairs-check.mjs [--pairs N] [--out DIR] [--same-user]
 *   node scripts/website-pairs-check.mjs --dry DIR      # DIR/<slug>-a.html + <slug>-b.html; no key, no calls
 */
import { mkdirSync, writeFileSync, readFileSync, existsSync } from "node:fs";
import path from "node:path";

const argv = process.argv.slice(2);
const flag = (name) => argv.includes(name);
const opt = (name, fallback) => (argv.includes(name) ? argv[argv.indexOf(name) + 1] : fallback);

const dryDir = opt("--dry", null);
const outDir = path.resolve(opt("--out", dryDir ?? "pairs-out"));
const pairLimit = Number(opt("--pairs", "10"));
const sameUser = flag("--same-user");

// The lines website-variety-check.mjs draws, restated here so the two
// scripts cannot drift apart silently: a pair is the SAME SKELETON above
// SAME_SKELETON, a SIMILAR one above SIMILAR_SKELETON; the SAME LOOK
// above SAME_LOOK, and over the brief's target above LOOK_TARGET.
const SAME_SKELETON = 0.85;
const SIMILAR_SKELETON = 0.7;
const SAME_LOOK = 0.7;
const LOOK_TARGET = 0.3;

// Ten kinds of business, two of each. The two briefs of a pair name
// different places, sizes and specialities on purpose: if they still come
// out as one site, it is the generator that made them one, not the brief.
const PAIRS = [
  {
    slug: "cafe",
    label: "Καφετέρια",
    a: "Καφετέρια στα Λαδάδικα, Θεσσαλονίκη. Specialty coffee και σπιτικά γλυκά. Θέλω να φαίνεται ο κατάλογος, οι ώρες λειτουργίας και πού είμαστε.",
    b: "Καφέ στην παλιά πόλη των Χανίων, δίπλα στο λιμάνι. Brunch όλη μέρα, φρέσκοι χυμοί, τραπέζια έξω. Να φαίνονται το μενού του brunch και οι ώρες.",
  },
  {
    slug: "law",
    label: "Δικηγορικό γραφείο",
    a: "Δικηγορικό γραφείο στην Αθήνα, τρεις δικηγόροι, εμπορικό και εργατικό δίκαιο. Σοβαρότητα και εμπιστοσύνη, τομείς δικαίου, προσόντα, φόρμα επικοινωνίας.",
    b: "Δικηγόρος στην Πάτρα, ένα άτομο, οικογενειακό δίκαιο και διαζύγια. Ζεστός τόνος, να εξηγεί πώς δουλεύει μια πρώτη συνάντηση, τηλέφωνο για ραντεβού.",
  },
  {
    slug: "photographer",
    label: "Φωτογράφος",
    a: "Φωτογράφος γάμων και πορτρέτου στην Κρήτη. Να κυριαρχεί το portfolio, οι φωτογραφίες το κύριο πράγμα, ελάχιστο κείμενο.",
    b: "Studio προϊοντικής φωτογραφίας στην Αθήνα για e-shops. Πακέτα ανά αριθμό προϊόντων, δείγματα δουλειάς, χρόνοι παράδοσης.",
  },
  {
    slug: "dentist",
    label: "Οδοντιατρείο",
    a: "Οδοντιατρείο στο Ηράκλειο, δύο οδοντίατροι, γενική οδοντιατρική και λεύκανση. Καθησυχαστικό ύφος, υπηρεσίες, ώρες, ραντεβού online.",
    b: "Ορθοδοντικός στη Λάρισα, παιδιά και έφηβοι, διαφανείς νάρθηκες. Να εξηγεί τη διαδικασία βήμα βήμα και το κόστος κατά προσέγγιση.",
  },
  {
    slug: "gym",
    label: "Γυμναστήριο",
    a: "CrossFit box στη Θεσσαλονίκη. Πρόγραμμα μαθημάτων ανά ώρα, τιμές συνδρομών, δοκιμαστικό μάθημα δωρεάν.",
    b: "Pilates studio στην Κηφισιά, μικρές ομάδες και reformer. Ήρεμο ύφος, εκπαιδευτές, πακέτα μαθημάτων, κράτηση θέσης.",
  },
  {
    slug: "taverna",
    label: "Ταβέρνα",
    a: "Ψαροταβέρνα στη Νάξο, πάνω στο κύμα. Φρέσκο ψάρι της ημέρας, κατάλογος, φωτογραφίες, ώρες και χάρτης.",
    b: "Μεζεδοπωλείο στα Ιωάννινα με ζωντανή μουσική Παρασκευή και Σάββατο. Μεζέδες, τσίπουρο, κρατήσεις για παρέες.",
  },
  {
    slug: "accountant",
    label: "Λογιστικό γραφείο",
    a: "Λογιστικό γραφείο στον Βόλο για μικρές επιχειρήσεις. Μισθοδοσία, ΦΠΑ, φορολογικές δηλώσεις, υπηρεσίες με τιμοκατάλογο.",
    b: "Φοροτεχνικός online για ελεύθερους επαγγελματίες σε όλη την Ελλάδα. Μηνιαία συνδρομή, όλα ψηφιακά, συχνές ερωτήσεις.",
  },
  {
    slug: "salon",
    label: "Κομμωτήριο",
    a: "Κομμωτήριο στη Γλυφάδα, γυναικείο, βαφές και balayage. Τιμοκατάλογος, ομάδα, online ραντεβού.",
    b: "Barbershop στην Καλαμάτα, ανδρικό κούρεμα και ξύρισμα με πετσέτα. Σκληρό ύφος, τιμές, ώρες, Instagram.",
  },
  {
    slug: "realestate",
    label: "Μεσιτικό",
    a: "Μεσιτικό γραφείο στη Μύκονο, βίλες προς πώληση και ενοικίαση. Πολυτέλεια, λίγα ακίνητα με μεγάλες φωτογραφίες, φόρμα ενδιαφέροντος.",
    b: "Μεσιτικό στη Θεσσαλονίκη για φοιτητικά διαμερίσματα. Πολλές μικρές αγγελίες, φίλτρα περιοχής και τιμής, τηλέφωνο.",
  },
  {
    slug: "yoga",
    label: "Yoga studio",
    a: "Yoga studio στο Χαλάνδρι. Πρόγραμμα μαθημάτων, δάσκαλοι, πρώτο μάθημα δωρεάν, ήρεμο ύφος.",
    b: "Yoga και διαλογισμός στο Ρέθυμνο, retreats Σαββατοκύριακου δίπλα στη θάλασσα. Ημερομηνίες, τιμές, τι περιλαμβάνεται.",
  },
];

const { structureFingerprint, sequenceSimilarity, visualSimilarity, designDecisions } = await import(
  "./lib/site-fingerprint.mjs"
);
const { loadTsWithDeps } = await import("./tests/load-ts.mjs");
const structural = await loadTsWithDeps("src/lib/website-structural-similarity.ts");

const round2 = (n) => Math.round(n * 100) / 100;

/** Everything the report says about one pair, from the two pages alone. */
function scorePair(htmlA, htmlB) {
  const declaredA = designDecisions(htmlA);
  const declaredB = designDecisions(htmlB);
  const landmarks = round2(sequenceSimilarity(structureFingerprint(htmlA), structureFingerprint(htmlB)));
  const edit = structural.compareStructure(htmlA, htmlB);
  const visual = visualSimilarity(htmlA, htmlB);
  const orderOf = (d) => (d?.sections ?? []).join(" > ");
  const sameArchetype = Boolean(declaredA?.archetype && declaredA.archetype === declaredB?.archetype);
  const sameHero = Boolean(declaredA?.hero && declaredA.hero === declaredB?.hero);
  const sameOrder = Boolean(orderOf(declaredA) && orderOf(declaredA) === orderOf(declaredB));
  // Two instruments, and the verdict follows the more pessimistic one: a
  // pair one of them calls the same skeleton IS the same skeleton to the
  // visitor who sees it that way.
  const structure = Math.max(landmarks, round2(edit.similarity));
  return {
    declaredA,
    declaredB,
    landmarks,
    editSimilarity: round2(edit.similarity),
    composition: round2(edit.composition),
    structure,
    visual,
    sameArchetype,
    sameHero,
    sameOrder,
    verdict: {
      skeleton:
        structure > SAME_SKELETON ? "same skeleton" : structure > SIMILAR_SKELETON ? "similar skeleton" : "different shapes",
      look: visual.overall > SAME_LOOK ? "same look" : visual.overall > LOOK_TARGET ? "above target" : "different looks",
    },
  };
}

// ---------------------------------------------------------------------
// Where the pages come from: disk (--dry) or the production generator.
// ---------------------------------------------------------------------
let generate = null;
let spentUsd = 0;
if (!dryDir) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    console.error(
      "ANTHROPIC_API_KEY is not set.\n" +
        "This script makes up to twenty real, billed Anthropic calls (about $7.50) — that is why\n" +
        "it is not part of the test suite. Set the key, or use --dry DIR to score pages already on disk."
    );
    process.exit(2);
  }
  const wb = await loadTsWithDeps("src/lib/website-builder.ts");
  const variation = await loadTsWithDeps("src/lib/website-variation.ts");
  const { CostAccumulator } = await loadTsWithDeps("src/lib/billing/cost-accumulator.ts");
  mkdirSync(outDir, { recursive: true });

  generate = async (slug, side, brief) => {
    process.stdout.write(`  generating ${slug}-${side} ... `);
    const costs = new CostAccumulator();
    const started = Date.now();
    // THE SEED IS THE EXPERIMENT. The process route seeds the draw by
    // [user id, how many sites they have, the brief]. Two different users'
    // first sites are the default here because that is the pair the
    // product cannot separate by memory; --same-user seeds one user's
    // first and second site, which is the pair step 1 of the proposal
    // separates by exclusion.
    const seed = sameUser ? ["pairs-check-a", side === "a" ? 0 : 1, brief] : [`pairs-check-${side}`, 0, brief];
    const draw = variation.variationDirective(variation.pickVariation(seed));
    const html = await wb.generateWebsiteHtml(apiKey, brief, undefined, () => {}, undefined, costs, draw);
    const totals = costs.totals();
    spentUsd += totals.usdCost;
    const file = path.join(outDir, `${slug}-${side}.html`);
    writeFileSync(file, html);
    console.log(`${Math.round((Date.now() - started) / 1000)}s, ${html.length} chars, $${totals.usdCost.toFixed(4)} -> ${file}`);
    return html;
  };
}

// ---------------------------------------------------------------------
console.log(
  dryDir
    ? `Scoring pages on disk in ${path.resolve(dryDir)} (no generation)\n`
    : `Generating ${Math.min(pairLimit, PAIRS.length)} pair(s) as ${sameUser ? "ONE user's first and second site" : "TWO different users' first sites"}\n`
);

const selected = PAIRS.slice(0, Math.max(0, pairLimit));
const rows = [];
const skipped = [];
for (const p of selected) {
  let htmlA;
  let htmlB;
  if (dryDir) {
    const fileA = path.join(dryDir, `${p.slug}-a.html`);
    const fileB = path.join(dryDir, `${p.slug}-b.html`);
    if (!existsSync(fileA) || !existsSync(fileB)) {
      skipped.push(p.slug);
      continue;
    }
    htmlA = readFileSync(fileA, "utf8");
    htmlB = readFileSync(fileB, "utf8");
  } else {
    try {
      htmlA = await generate(p.slug, "a", p.a);
      htmlB = await generate(p.slug, "b", p.b);
    } catch (err) {
      console.log(`FAILED ${p.slug}: ${err.message}`);
      skipped.push(p.slug);
      continue;
    }
  }
  rows.push({ slug: p.slug, label: p.label, ...scorePair(htmlA, htmlB) });
}

// ---------------------------------------------------------------------
// The report. Declarations first (the cheapest diagnosis), then the two
// structural numbers, then the four visual axes, then the verdicts.
// ---------------------------------------------------------------------
const describe = (html, d) =>
  d
    ? `${d.archetype ?? "?"} / hero=${d.hero ?? "?"} / ${(d.sections ?? []).join(" > ") || "(no sections declared)"}`
    : "(NO DESIGN DECISIONS BLOCK)";

for (const r of rows) {
  console.log(`\n  ${r.label} (${r.slug})`);
  console.log(`    a declared : ${describe(null, r.declaredA)}`);
  console.log(`    b declared : ${describe(null, r.declaredB)}`);
  console.log(
    `    collisions : archetype ${r.sameArchetype ? "same (expected)" : "different"}, hero ${r.sameHero ? "SAME" : "different"}, order ${r.sameOrder ? "SAME" : "different"}`
  );
}

console.log("\n  pair            landmarks edit  comp | fonts colour space motion  VISUAL | skeleton           look");
for (const r of rows) {
  console.log(
    `  ${r.slug.padEnd(15)} ${r.landmarks.toFixed(2).padEnd(9)} ${r.editSimilarity.toFixed(2).padEnd(5)} ${r.composition.toFixed(2).padEnd(4)} | ` +
      `${r.visual.fonts.toFixed(2).padEnd(5)} ${r.visual.colour.toFixed(2).padEnd(6)} ${r.visual.spacing.toFixed(2).padEnd(5)} ${r.visual.motion.toFixed(2).padEnd(6)}  ${r.visual.overall.toFixed(2).padEnd(6)} | ` +
      `${r.verdict.skeleton.padEnd(18)} ${r.verdict.look}`
  );
}

const worstStructure = rows.reduce((m, r) => Math.max(m, r.structure), 0);
const worstVisual = rows.reduce((m, r) => Math.max(m, r.visual.overall), 0);
const median = (xs) => {
  if (xs.length === 0) return 0;
  const s = [...xs].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
};
const sameSkeleton = rows.filter((r) => r.structure > SAME_SKELETON);
const sameLook = rows.filter((r) => r.visual.overall > SAME_LOOK);
const overTarget = rows.filter((r) => r.visual.overall > LOOK_TARGET);

console.log(`\n  pairs scored      : ${rows.length} of ${selected.length}`);
if (skipped.length > 0) console.log(`  skipped (no pages): ${skipped.join(", ")}`);
console.log(`  hero collisions   : ${rows.filter((r) => r.sameHero).length}    order collisions: ${rows.filter((r) => r.sameOrder).length}`);
console.log(
  `  structure         : worst ${worstStructure.toFixed(2)}, median ${median(rows.map((r) => r.structure)).toFixed(2)}, same skeleton in ${sameSkeleton.length} pair(s)${sameSkeleton.length ? ` (${sameSkeleton.map((r) => r.slug).join(", ")})` : ""}`
);
console.log(
  `  visual            : worst ${worstVisual.toFixed(2)}, median ${median(rows.map((r) => r.visual.overall)).toFixed(2)}, same look in ${sameLook.length}, over the 0.30 target in ${overTarget.length}`
);
if (!dryDir) console.log(`  spent             : $${spentUsd.toFixed(2)} on ${rows.length * 2} generations`);

console.log(
  `\n  VERDICT: ` +
    (sameSkeleton.length > 0
      ? `${sameSkeleton.length} pair(s) are the SAME TEMPLATE with different words. Not fixed.`
      : worstStructure > SIMILAR_SKELETON
        ? "no pair is the same skeleton, but some are close; open them side by side."
        : "every pair has its own shape.")
);
console.log(
  `  VERDICT: ` +
    (sameLook.length > 0
      ? `${sameLook.length} pair(s) have the SAME LOOK whatever their structure does.`
      : overTarget.length > 0
        ? `${overTarget.length} pair(s) are over the 0.30 visual target; look before accepting.`
        : "every pair looks like its own site.")
);

mkdirSync(outDir, { recursive: true });
const reportFile = path.join(outDir, "pairs-report.json");
writeFileSync(
  reportFile,
  JSON.stringify(
    {
      mode: dryDir ? "dry" : sameUser ? "same-user" : "different-users",
      thresholds: { SAME_SKELETON, SIMILAR_SKELETON, SAME_LOOK, LOOK_TARGET },
      pairs: rows,
      skipped,
      worstStructure,
      worstVisual,
      spentUsd: dryDir ? null : round2(spentUsd),
    },
    null,
    2
  )
);
console.log(`\n  report: ${reportFile}${dryDir ? "" : `\n  pages : ${outDir}`}`);

// Nothing scored is its own failure: a run that skipped every pair must
// not exit as if the templates were fine.
process.exit(rows.length === 0 ? 2 : sameSkeleton.length > 0 || sameLook.length > 0 ? 1 : 0);
