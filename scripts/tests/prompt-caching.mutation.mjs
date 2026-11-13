#!/usr/bin/env node
/*
 * CAN prompt-caching.test.mjs SEE CREATE STUDIO'S INTAKE STOP CACHING?
 *
 * Wired 2026-11-05 (docs/COST-LAYER.md §(a)). Three ways it can quietly
 * stop paying, each of which typechecks and answers exactly as before:
 * the call goes back to a plain block, something per-request is folded
 * into the cached half (every call then writes an entry nothing reads),
 * or the prompt shrinks under the model's minimum so buildCachedSystem
 * places no marker at all.
 *
 * Run: node scripts/tests/prompt-caching.mutation.mjs
 */
import { runMutations } from "./lib/mutation-runner.mjs";

const GATE = "scripts/tests/prompt-caching.test.mjs";
const ROUTE = "src/app/api/create-studio/detect/route.ts";
const WIRED = "system: buildCachedSystem({ staticPrefix: buildSystemPrompt(), model: STUDIO_MODEL }),";

const MUTANTS = [
  {
    name: "the intake goes back to a plain, uncached system block",
    file: ROUTE,
    from: WIRED,
    to: 'system: [{ type: "text", text: buildSystemPrompt() }],',
    expect: "create-studio/detect passes the static prompt to buildCachedSystem",
  },
  {
    name: "the person's sentence is folded into the cached prefix",
    file: ROUTE,
    from: WIRED,
    to: "system: buildCachedSystem({ staticPrefix: buildSystemPrompt() + message, model: STUDIO_MODEL }),",
    expect: "create-studio/detect passes the static prompt to buildCachedSystem",
  },
  {
    name: "the prompt loses its constants and drops under the minimum",
    file: ROUTE,
    from: "${AI_SAFETY_BOUNDARIES_EN}${AI_CRISIS_CLASSIFIER_EN}${AI_QUALITY_CHECKLIST_EN}`;",
    to: "`;",
    expect: "clears Sonnet's 1,024",
  },
];

runMutations({
  name: "prompt-caching",
  gate: GATE,
  targets: [GATE, ROUTE],
  mutants: MUTANTS,
});
