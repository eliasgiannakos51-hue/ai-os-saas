#!/usr/bin/env node
/*
 * CAN automation-transforms.test.mjs SEE LIMIT KEEPING THE WRONG END, DEDUPLICATION
 * KEEPING THE LAST COPY, SORT IGNORING ITS DIRECTION, OR THE RUNNER APPLYING THE
 * REAL TRANSFORMS TO EVERY ACCOUNT, SWITCH OR NO SWITCH?
 *
 * Run: node scripts/tests/automation-transforms.mutation.mjs
 */
import { runMutations } from "./lib/mutation-runner.mjs";

const GATE = "scripts/tests/automation-transforms.test.mjs";
const TRANSFORMS = "src/lib/automations/transforms.ts";
const RUNNER = "src/lib/automations/runner.ts";

const MUTANTS = [
  {
    name: "limit keeps the LAST N lines instead of the first",
    file: TRANSFORMS,
    from: "lines(text).slice(0, box.maxItems)",
    to: "lines(text).slice(-box.maxItems)",
    expect: "keeps the first N lines",
  },
  {
    name: "sort ignores its direction",
    file: TRANSFORMS,
    from: 'return (box.direction === "desc" ? sorted.reverse() : sorted).join("\\n");',
    to: 'return sorted.join("\\n");',
    expect: "descending is the reverse",
  },
  {
    name: "deduplication never remembers a line, so nothing is dropped",
    file: TRANSFORMS,
    from: "if (seen.has(key)) continue;",
    to: "if (false) continue;",
    expect: "drops repeated lines, keeps the first",
  },
  {
    name: "set drops its assignments",
    file: TRANSFORMS,
    from: "return [base, ...extra].filter(Boolean).join(\"\\n\");",
    to: "return base;",
    expect: "appends each assignment as a line",
  },
  {
    name: "the runner applies the real transforms to every account, switch closed or not",
    file: RUNNER,
    from: "if (realLogicOn && REAL_TRANSFORM_KINDS.has(box.kind)) {",
    to: "if (REAL_TRANSFORM_KINDS.has(box.kind)) {",
    expect: "applyTransform runs only when realLogicOn",
  },
];

runMutations({
  name: "automation-transforms",
  gate: GATE,
  targets: [TRANSFORMS, RUNNER],
  mutants: MUTANTS,
});
