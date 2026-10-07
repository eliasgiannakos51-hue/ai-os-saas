#!/usr/bin/env node
/*
 * CAN router-classify.test.mjs SEE THE 2.13 CLASSIFICATION BREAK?
 *
 * Each mutant puts back a real way this goes wrong: the doubt that stops
 * raising the tier, the short question that stops being simple, the
 * settlement that stops recording the decision, the chat that stops
 * passing the user's words, a feature that loses its tier, and the scan
 * that would make "every feature has one" true of nothing.
 *
 * Run: node scripts/tests/router-classify.mutation.mjs
 */
import { runMutations } from "./lib/mutation-runner.mjs";

const GATE = "scripts/tests/router-classify.test.mjs";
const CATEGORIZE = "src/lib/ai/routing/categorize.ts";
const CLASSIFY = "src/lib/ai/routing/classify.ts";
const SETTLE = "src/lib/billing/reservations.ts";
const CHAT = "src/app/api/chat/route.ts";

const MUTANTS = [
  {
    name: "low confidence stops raising the tier",
    file: CATEGORIZE,
    from: "if (confidence < CONFIDENCE_FLOOR) {",
    to: "if (false && confidence < CONFIDENCE_FLOOR) {",
    expect: "and the tier went up one",
  },
  {
    name: "a tie between two kinds of work reads as certain",
    file: CATEGORIZE,
    from: "return { category: top.category, confidence: 0.5, rule: `text:tie:",
    to: "return { category: top.category, confidence: 0.9, rule: `text:tie:",
    expect: "under the floor",
  },
  {
    name: "a short single question stops being simple",
    file: CATEGORIZE,
    from: '    tier = "simple";\n    tierRule = "text:short-single";',
    to: '    tierRule = "text:short-single";',
    expect: "→ simple, sure of it",
  },
  {
    name: "a settlement feature loses its tier",
    file: CLASSIFY,
    from: '  meeting_analyse: "complex",\n',
    to: "",
    expect: "every one has a tier and a category",
  },
  {
    name: "settlement stops writing the decision into the row",
    file: SETTLE,
    from: "        ...metadata,\n        routing,\n",
    to: "        ...metadata,\n",
    expect: "writes it into the cost row's metadata",
  },
  {
    name: "chat stops passing the user's words to the shadow",
    file: CHAT,
    from: '            routing: shadowRouteSafe({ feature: "chat_message", text: message }),',
    to: "            routing: undefined,",
    expect: "on both settlements",
  },
  {
    name: "the gate's feature scan finds nothing",
    file: GATE,
    from: "for (const lit of m[1].matchAll(/\"([a-z_]+)\"/g)) settlementFeatures.add(cat.baseFeature(lit[1]));",
    to: "for (const lit of m[1].matchAll(/\"([a-z_]+)\"/g)) void lit;",
    expect: "the scan found the settlement features",
  },
];

runMutations({
  name: "router-classify",
  gate: GATE,
  targets: [GATE, CATEGORIZE, CLASSIFY, SETTLE, CHAT],
  mutants: MUTANTS,
});
