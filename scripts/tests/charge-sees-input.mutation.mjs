#!/usr/bin/env node
/*
 * CAN charge-sees-input.test.mjs SEE A CHARGE STOP LOOKING AT THE INPUT?
 *
 * Six mutants, each a real way a price goes flat:
 *
 *   1. a route sizes its hold from its own system prompt alone — the
 *      same hold for a haiku and a novel
 *   2. voice goes back to a flat price per clip, which overcharges a
 *      sentence and undercharges a lecture
 *   3. a module starts charging again for inserting a row the user typed
 *      by hand — the charge that was removed once already
 *   4. the route scan finds nothing, so every rule above it is free
 *   5. the constant-detector swallows everything, so every expression
 *      reads as varying
 *   6. the flat-price scan stops matching, so section 3 inspects nothing
 *
 * Run: node scripts/tests/charge-sees-input.mutation.mjs
 */
import { runMutations } from "./lib/mutation-runner.mjs";

const GATE = "scripts/tests/charge-sees-input.test.mjs";
const ANALYSE = "src/app/api/data-analysis/[id]/analyse/route.ts";
const VOICE = "src/app/api/voice/transcribe/route.ts";
const BUILD_MODULES = "src/lib/build-modules.ts";

// Top-level declaration under the name the reader looks for — see the
// SHAPE note in scripts/tests/lib/mutation-runner.mjs.
const MUTANTS = [
  {
    name: "a route sizes its hold from its own system prompt alone",
    file: ANALYSE,
    from: "inputChars: ANALYSIS_SYSTEM.length + brief.length",
    to: "inputChars: ANALYSIS_SYSTEM.length",
    expect: "no route sizes its hold from constants alone",
  },
  {
    name: "voice goes back to a flat price per clip",
    file: VOICE,
    from: "const usdCost = transcribeCostUsd(seconds);",
    to: "const usdCost = transcribeCostUsd(30);",
    expect: "voice transcription is priced from its duration",
  },
  {
    name: "a module charges again for a row the user typed by hand",
    file: BUILD_MODULES,
    from: "  {\n    slug: ",
    to: "  {\n    creditCost: 100,\n    slug: ",
    expect: "no module charges a flat price for a hand-typed row",
  },
  {
    name: "the route walk finds nothing, so every rule above is free",
    file: GATE,
    from: 'const routes = walk("src/app/api");',
    to: "const routes = [];",
    expect: "routes that call estimateForAction",
  },
  {
    name: "the constant-detector swallows everything, so any expression reads as varying",
    file: GATE,
    from: "    .filter((id) => !moduleConsts.has(id));",
    to: "    .filter(() => true);",
    expect: "no route sizes its hold from constants alone",
  },
  {
    name: "the flat-price scan stops matching, so section 3 inspects nothing",
    file: GATE,
    from: 'const FLAT_PRICE = /creditCost:\\s*(\\d+)/g;',
    to: "const FLAT_PRICE = /(?!)/g;",
    expect: "no module charges a flat price for a hand-typed row",
  },
];

runMutations({
  name: "charge-sees-input",
  gate: GATE,
  targets: [GATE, ANALYSE, VOICE, BUILD_MODULES],
  mutants: MUTANTS,
});
