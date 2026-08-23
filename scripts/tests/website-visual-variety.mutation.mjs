#!/usr/bin/env node
/*
 * CAN THE VISUAL-VARIETY GATES GO RED?
 *
 * This is the sixth round of "every site looks the same". The first five
 * added structural variation, and each time the structural gates went
 * green and the report came back. That is the pattern this file exists to
 * break: a gate that measures the wrong thing is worse than no gate,
 * because it ends the argument.
 *
 *   AN AXIS THAT IS ASKED FOR RATHER THAN DRAWN. The system prompt is
 *   byte-identical on every call. An instruction inside it is the same
 *   instruction every time and gets the same answer — which is the whole
 *   reason website-variation.ts exists. Palette and typeface were left in
 *   the prompt for five rounds.
 *
 *   A MOTION TIMING THAT IS A LITERAL. The prompt handed the model
 *   copy-pasteable CSS with 0.7s and 24px in it while the drawn
 *   vocabulary promised 400-600ms. Concrete beats prose, so every
 *   animated site moved identically.
 *
 *   AXES THAT ARE SECRETLY ONE AXIS. FNV-1a never mixes its lowest bit,
 *   so two even-length lists correlate perfectly however they are salted.
 *   grid x motion was 12 of 24 in production.
 *
 *   AN INSTRUMENT THAT CANNOT TELL. A similarity score that says
 *   "different" about two indistinguishable pages ends the argument in
 *   the wrong direction.
 *
 * Run: node scripts/tests/website-visual-variety.mutation.mjs
 */
import { readFileSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";

const FP_GATE = "scripts/tests/site-fingerprint.test.mjs";
const VARIETY_GATE = "scripts/tests/website-variety.test.mjs";
const VARIATION_GATE = "scripts/tests/website-variation.test.mjs";

const VARIATION = "src/lib/website-variation.ts";
const BUILDER = "src/lib/website-builder.ts";
const FP = "scripts/lib/site-fingerprint.mjs";

const MUTANTS = [
  // ------------------------------------------------------------------
  // AN AXIS THAT IS NOT DRAWN.
  // ------------------------------------------------------------------
  {
    gate: FP_GATE,
    name: "the palette goes back to being asked for instead of drawn",
    file: VARIATION,
    from: '    palette: pick(PALETTE_STRATEGIES, "palette"),',
    to: '    palette: PALETTE_STRATEGIES[0],',
  },
  {
    gate: FP_GATE,
    name: "every site is set in the same typeface pairing",
    file: VARIATION,
    from: '    typeface: pick(TYPE_PAIRINGS, "typeface"),',
    to: '    typeface: TYPE_PAIRINGS[0],',
  },
  {
    gate: FP_GATE,
    name: "every site has the same density",
    file: VARIATION,
    from: '    spacing: pick(SPACING_SCALES, "spacing"),',
    to: '    spacing: SPACING_SCALES[1],',
  },
  {
    gate: FP_GATE,
    name: "every site moves at the same speed again",
    file: VARIATION,
    from: '    motionTiming: pick(MOTION_TIMINGS, "motiontiming"),',
    to: '    motionTiming: MOTION_TIMINGS[3],',
  },

  // ------------------------------------------------------------------
  // AXES THAT ARE SECRETLY ONE AXIS.
  // ------------------------------------------------------------------
  {
    gate: FP_GATE,
    name: "the hash loses its avalanche, so even-length axes correlate again",
    file: VARIATION,
    from: "  hash ^= hash >>> 16;\n  hash = Math.imul(hash, 0x85ebca6b);\n  hash ^= hash >>> 13;\n  hash = Math.imul(hash, 0xc2b2ae35);\n  hash ^= hash >>> 16;\n  return hash >>> 0;",
    to: "  return hash >>> 0;",
  },
  {
    gate: FP_GATE,
    name: "the per-axis salt is dropped, so every axis draws the same index",
    file: VARIATION,
    from: "    list[fnv1a(`${salt}::${seed}`) % list.length];",
    to: "    list[fnv1a(seed) % list.length];",
  },

  // ------------------------------------------------------------------
  // THE DIRECTIVE THAT CARRIES THEM.
  // ------------------------------------------------------------------
  {
    gate: "scripts/tests/website-variation.test.mjs",
    name: "the visual lines are dropped from the per-site directive",
    file: VARIATION,
    from: "- PALETTE STRATEGY: ${v.palette}\n- TYPE PAIRING: ${v.typeface}\n- SPACING SCALE: ${v.spacing}\n- MOTION TIMING: ${v.motionTiming}\n",
    to: "",
  },
  {
    gate: VARIETY_GATE,
    name: "the prompt stops deferring to the drawn type pairing",
    file: BUILDER,
    from: "use the TYPE PAIRING named in this site's DESIGN VARIATION block",
    to: "choose a pairing that suits the subject",
  },
  {
    gate: VARIETY_GATE,
    name: "the prompt stops deferring to the drawn palette strategy",
    file: BUILDER,
    from: "build it inside the PALETTE STRATEGY named in this site's DESIGN VARIATION block",
    to: "derive it from the actual subject",
  },
  {
    gate: VARIETY_GATE,
    name: "a drawn font is named that the prompt cannot load",
    file: VARIATION,
    from: "\"'Fraunces' for headings, 'Karla' for body",
    to: "\"'Helvetica Neue Display' for headings, 'Karla' for body",
  },

  // ------------------------------------------------------------------
  // THE MOTION LITERALS COMING BACK.
  // ------------------------------------------------------------------
  {
    gate: VARIETY_GATE,
    name: "the reveal snippet hard-codes 0.7s again, so every site moves alike",
    file: BUILDER,
    from: "transition: opacity MOTION_DURATION MOTION_EASING, transform MOTION_DURATION MOTION_EASING;",
    to: "transition: opacity 0.7s ease-out, transform 0.7s ease-out;",
  },

  // ------------------------------------------------------------------
  // AN INSTRUMENT THAT CANNOT TELL.
  // ------------------------------------------------------------------
  {
    gate: VARIETY_GATE,
    name: "the ambient gradient loop goes back to a fixed 12s on every site",
    file: BUILDER,
    from: "animation: gradientShift MOTION_AMBIENT ease infinite; }",
    to: "animation: gradientShift 12s ease infinite; }",
  },
  {
    gate: FP_GATE,
    name: "the ground is decided by raw frequency, so an accent flips a dark page",
    file: FP,
    from: '    for (const hex of m[1].match(/#([0-9a-f]{6}|[0-9a-f]{3})\\b/gi) ?? []) add(hex, 10);',
    to: '    for (const hex of m[1].match(/#([0-9a-f]{6}|[0-9a-f]{3})\\b/gi) ?? []) add(hex, 0);',
  },
  {
    gate: FP_GATE,
    name: "rem spacing is read as px, so a rem page has no measurable density",
    file: FP,
    from: "      const px = /rem|em/.test(token) ? n * 16 : n;",
    to: "      const px = n;",
  },
  {
    gate: FP_GATE,
    name: "seconds are not normalised, so 0.7s and 700ms look different",
    file: FP,
    from: '    const ms = m[2] === "s" ? parseFloat(m[1]) * 1000 : parseFloat(m[1]);',
    to: "    const ms = parseFloat(m[1]);",
  },
  {
    gate: FP_GATE,
    name: "near-greys are bucketed as hues, so every neutral page looks coloured",
    file: FP,
    from: "    if (max - min < 0.08) continue; // near-grey carries no hue",
    to: "    if (false) continue; // near-grey carries no hue",
  },
  {
    gate: FP_GATE,
    name: "component padding is counted, drowning section rhythm in noise",
    file: FP,
    from: "      if (px >= 24) values.add(Math.round(px));",
    to: "      values.add(Math.round(px));",
  },
  {
    gate: FP_GATE,
    name: "two identical pages stop scoring as identical",
    file: FP,
    from: "    fonts: round2(fontScore),",
    to: "    fonts: round2(fontScore * 0.4),",
  },
  {
    gate: FP_GATE,
    name: "the loaded families lose their order and duplicates",
    file: FP,
    from: "    if (!families.includes(name)) families.push(name);",
    to: "    families.push(name);",
  },
];

let caught = 0;
const missed = [];

for (const m of MUTANTS) {
  const original = readFileSync(m.file, "utf8");
  const edits = m.edits ?? [{ from: m.from, to: m.to }];
  const stale = edits.find((e) => !original.includes(e.from));
  if (stale) {
    missed.push({ ...m, why: `the mutation target no longer exists in ${m.file}` });
    console.log(`  STALE   ${m.name}\n          anchor not found in ${m.file}`);
    continue;
  }
  let mutated = original;
  for (const e of edits) mutated = mutated.replace(e.from, e.to);
  if (mutated === original) {
    missed.push({ ...m, why: "the mutation left the file byte-identical — it is not a defect" });
    console.log(`  NO-OP   ${m.name}`);
    continue;
  }
  writeFileSync(m.file, mutated);
  // DECIDED BY THE EXIT CODE, never by grepping stdout for FAIL: a gate
  // that dies on a syntax error and prints nothing has still gone red.
  let failed = false;
  let detail = "";
  try {
    execFileSync("node", [m.gate], { encoding: "utf8", stdio: "pipe" });
  } catch (e) {
    failed = true;
    const out = String(e.stdout || "") + String(e.stderr || "");
    detail = (out.split("\n").find((l) => l.includes("FAIL")) || out.split("\n")[0] || "").trim();
  } finally {
    writeFileSync(m.file, original);
  }
  if (failed) {
    caught++;
    console.log(`  CAUGHT  ${m.name}\n          ${detail.slice(0, 130)}`);
  } else {
    missed.push({ ...m, why: "the gate stayed green with the defect re-introduced" });
    console.log(`  MISSED  ${m.name}`);
  }
}

for (const gate of [FP_GATE, VARIETY_GATE, VARIATION_GATE]) {
  try {
    execFileSync("node", [gate], { stdio: "pipe" });
  } catch {
    console.log(`\nBASELINE IS RED (${gate}) — a mutation was not restored. Check \`git diff\`.`);
    process.exit(1);
  }
}
console.log("\nbaseline: all three gates are green on the unmutated tree");
console.log(`\n${caught} of ${MUTANTS.length} mutations caught.`);
if (missed.length) {
  console.log("\nHOLES:");
  for (const m of missed) console.log(`  - ${m.name}\n    ${m.why}`);
  process.exit(1);
}
console.log("Every re-introduced defect turned a gate red.");
