#!/usr/bin/env node
/*
 * CAN router-model-table.test.mjs SEE THE MODEL TABLE GO WRONG?
 *
 * The table is configuration a person edits, so every check on it is a
 * check on what a typo or a hopeful edit can do: a fallback weaker than
 * its primary, an environment table taken without validation, a cheaper
 * model slipped in with no quality number, and — the bug the inventory
 * found — a model id the catalog does not know.
 *
 * Run: node scripts/tests/router-model-table.mutation.mjs
 */
import { runMutations } from "./lib/mutation-runner.mjs";

const GATE = "scripts/tests/router-model-table.test.mjs";
const TABLE = "src/lib/ai/routing/model-table.ts";
const JSON_TABLE = "src/lib/ai/routing/model-table.json";
const CATALOG = "src/lib/ai/providers/catalog.ts";

const MUTANTS = [
  {
    name: "a fallback weaker than its primary is accepted",
    file: TABLE,
    from: "if (order.indexOf(fallback.tier) < order.indexOf(primary.tier)) {",
    to: "if (false) {",
    expect: "a fallback weaker than its primary",
  },
  {
    name: "AI_MODEL_TABLE is used without validation",
    file: TABLE,
    from: '    if (problems.length === 0) return { table: parsed as ModelTable, source: "env", rejected: null };',
    to: '    return { table: parsed as ModelTable, source: "env", rejected: null };',
    expect: "a primary the catalog does not know",
  },
  {
    name: "a cheaper primary with no quality number is accepted",
    file: TABLE,
    from: "  if (problems.length === 0) {\n    for (const r of unmeasuredChallengers",
    to: "  if (false) {\n    for (const r of unmeasuredChallengers",
    expect: "such a table is refused at load",
  },
  {
    name: "the deep agent's model drops out of the catalog again",
    file: CATALOG,
    from: '    id: "claude-opus-4-5",',
    to: '    id: "claude-opus-4-5-gone",',
    expect: "every one resolves in the catalog",
  },
  {
    name: "the complex fallback stays with the same provider",
    file: JSON_TABLE,
    from: '"fallback": "openai/gpt-4.1"',
    to: '"fallback": "claude-opus-4-6"',
    expect: "complex: the fallback is from another provider",
  },
];

runMutations({
  name: "router-model-table",
  gate: GATE,
  targets: [GATE, TABLE, JSON_TABLE, CATALOG],
  mutants: MUTANTS,
});
