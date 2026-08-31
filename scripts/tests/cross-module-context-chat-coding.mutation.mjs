#!/usr/bin/env node
/*
 * DOES THE CROSS-MODULE CONTEXT SUITE ACTUALLY CATCH ANYTHING?
 *
 * A gate that selects nothing is cheap, silent, and passes every test that
 * only asks whether the prompt stayed small. That is the failure this
 * feature shipped with internally — scoring each conversation turn on its
 * own dropped the assistant's reply and returned nothing for "why did you
 * do it that way?", the exact question it was built for. It was found by
 * measuring, not by testing, which is the gap this file closes.
 *
 * Each mutation is a real regression, not synthetic damage: either the
 * behaviour as it was before the fix, or the plausible edit that would
 * undo it. The suite is required to go red for every one.
 *
 * Run: node scripts/tests/cross-module-context.mutation.mjs
 */
import { readFileSync } from "node:fs";
import { writeFileSync } from "./lib/sidecar-write.mjs";
import { execFileSync } from "node:child_process";

// THE TARGET WAS THE WRONG GATE BY ONE SUFFIX, AND THAT IS WHY THIS SUITE
// CAUGHT 0 OF 14.
//
// It said scripts/tests/cross-module-context.test.mjs. That file loads
// src/lib/ai/module-relevance.ts and src/lib/ai/cross-module-context.ts —
// different modules with a different API (selectRelevantModules,
// buildModuleVocabulary). The three files mutated below are the OTHER
// implementation, the one api/chat/route.ts and api/records/ask/route.ts
// import. Every mutation applied cleanly and the gate stayed green because
// the gate never loaded the files being mutated.
//
// The gate that DOES load them has this suite's own name and always did:
// cross-module-context-chat-coding.test.mjs. Losing the "-chat-coding"
// suffix from this constant was the whole defect.
//
// scripts/tests/mutation-suite-shape.test.mjs now refuses a suite that
// points away from its same-named gate when that gate exists, which is the
// shape of this bug rather than this instance of it.
const TARGET = "scripts/tests/cross-module-context-chat-coding.test.mjs";
const RELEVANCE = "src/lib/text/relevance-budget.ts";
const MENTIONS = "src/lib/chat/entity-mentions.ts";
const CONVO = "src/lib/chat/record-conversation-context.ts";

const MUTANTS = [
  {
    name: "the conversation floor back to 0.34 (the value that returned nothing)",
    file: CONVO, from: "  minScore: 0.12,", to: "  minScore: 0.34,",
  },
  {
    name: "scoring made symmetric — a long note beats a short exact one",
    file: RELEVANCE,
    from: "  return hits / q.size;",
    to: "  return hits / Math.max(q.size, c.size);",
  },
  {
    name: "an empty query treated as matching everything",
    file: RELEVANCE, from: "  if (q.size === 0) return 0;", to: "  if (q.size === 0) return 1;",
  },
  {
    name: "the budget loop stops at the first item that does not fit",
    file: RELEVANCE,
    from: "      droppedForBudget++;\n      continue;",
    to: "      droppedForBudget++;\n      break;",
  },
  {
    name: "the character budget ignored entirely",
    file: RELEVANCE,
    from: "    if (selected.length >= options.maxItems || chars + cost > options.budgetChars) {",
    to: "    if (selected.length >= options.maxItems) {",
  },
  {
    name: "accent folding dropped from term extraction",
    file: RELEVANCE,
    from: "  const normalized = normalizeForSearch(text);",
    to: "  const normalized = (text ?? \"\").toLowerCase();",
  },
  {
    name: "the record body includes the headline it already showed",
    file: MENTIONS,
    from: "    .filter((field) => field.key !== config.headlineKey)",
    to: "    .filter(() => true)",
  },
  {
    name: "the excerpt never reaches the prompt",
    file: MENTIONS,
    from: "      return e.excerpt ? `${base}\\n    ${e.excerpt}` : base;",
    to: "      return base;",
  },
  {
    name: "the excerpt run together with the next bullet",
    file: MENTIONS,
    from: "      return e.excerpt ? `${base}\\n    ${e.excerpt}` : base;",
    to: "      return e.excerpt ? `${base} ${e.excerpt}` : base;",
  },
  {
    name: "the conversation turns lose their dates",
    file: CONVO,
    from: "      return `- [${day}] ${who}: ${t.excerpt}`;",
    to: "      return `- ${who}: ${t.excerpt}`;",
  },
  {
    name: "an empty conversation still emits its heading",
    file: CONVO,
    from: "  if (context.turns.length === 0) return \"\";",
    to: "  if (context.turns.length === 0 && false) return \"\";",
  },
  {
    name: "the mention scan stops pinning user_id",
    file: MENTIONS,
    from: "          .eq(\"user_id\", userId)\n          .order(\"created_at\", { ascending: false })",
    to: "          .order(\"created_at\", { ascending: false })",
  },
  {
    name: "the conversation scan stops pinning user_id",
    file: CONVO,
    from: "      .eq(\"user_id\", userId)\n      .order(\"created_at\", { ascending: false })",
    to: "      .order(\"created_at\", { ascending: false })",
  },
  {
    name: "the budgets raised until the prompt would double",
    file: MENTIONS, from: "  budgetChars: 700,", to: "  budgetChars: 4200,",
  },
];

let caught = 0;
const missed = [];
for (const m of MUTANTS) {
  const original = readFileSync(m.file, "utf8");
  if (!original.includes(m.from)) {
    missed.push({ ...m, why: "the mutation target no longer exists in the file" });
    console.log(`  STALE   ${m.name}\n          anchor not found in ${m.file}`);
    continue;
  }
  writeFileSync(m.file, original.replace(m.from, m.to));
  let failed = false;
  let detail = "";
  try {
    execFileSync("node", [TARGET], { encoding: "utf8", stdio: "pipe" });
  } catch (e) {
    failed = true;
    detail = (String(e.stdout || "").split("\n").find((l) => l.includes("FAIL")) || "").trim();
  } finally {
    writeFileSync(m.file, original);
  }
  if (failed) {
    caught++;
    console.log(`  CAUGHT  ${m.name}\n          -> ${detail}`);
  } else {
    missed.push({ ...m, why: "the suite stayed green with the defect re-introduced" });
    console.log(`  MISSED  ${m.name}\n          the suite stayed green`);
  }
}

console.log(`\n${caught}/${MUTANTS.length} mutations caught`);
if (missed.length) {
  console.log("\nHOLES — these defects can ship without the suite noticing:");
  for (const m of missed) console.log(`  - ${m.name}: ${m.why}`);
  process.exit(1);
}
try {
  execFileSync("node", [TARGET], { encoding: "utf8", stdio: "pipe" });
  console.log("baseline: the suite is green on the unmutated tree");
} catch {
  console.log("BASELINE IS RED — every 'caught' above is meaningless");
  process.exit(1);
}
