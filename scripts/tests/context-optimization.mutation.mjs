#!/usr/bin/env node
/*
 * CAN THE CONTEXT GATE GO RED?
 *
 * Prompt caching fails in one particular way and it is silent in both
 * directions: a breakpoint in the wrong place writes an entry nothing
 * reads (paying the 1.25x write premium forever) and greps as an
 * optimisation that is in place; a missing breakpoint costs full price
 * and looks identical from the outside. Neither shows up in an answer,
 * a log, or a test that only checks the text is unchanged.
 *
 * Narrowing fails the other way: a guard removed makes it send less than
 * it should, which is a quality regression nobody is watching for.
 *
 * Run: node scripts/tests/context-optimization.mutation.mjs
 */
import { readFileSync } from "node:fs";
import { writeFileSync } from "./lib/sidecar-write.mjs";
import { execFileSync } from "node:child_process";

const GATE = "scripts/tests/context-optimization.test.mjs";
const CACHED = "src/lib/ai/cached-system.ts";
const RELEVANCE = "src/lib/ai/module-relevance.ts";
const CONTEXT = "src/lib/user-context.ts";
const ROUTE = "src/app/api/chat/route.ts";
const MEASURE = "scripts/measure-context.mjs";
const QUALITY = "scripts/context-quality.mjs";

const MUTANTS = [
  // ------------------------------------------------------------------
  // THE BREAKPOINT MOVES. Every one of these still sends the same text.
  // ------------------------------------------------------------------
  {
    name: "the marker moves to the last block, so nothing is ever read back",
    file: CACHED,
    from: "  if (dynamicSuffix) blocks.push({ type: \"text\", text: dynamicSuffix });\n  return blocks;",
    to: "  if (dynamicSuffix) blocks.push({ type: \"text\", text: dynamicSuffix, cache_control: { type: \"ephemeral\" } });\n  return blocks;",
  },
  {
    name: "the per-user block stops being cached",
    file: CACHED,
    from: "        ? { type: \"text\", text: perUserBlock, cache_control: { type: \"ephemeral\" } }",
    to: "        ? { type: \"text\", text: perUserBlock }",
  },
  {
    name: "the per-user block is judged on its own length, not the prefix",
    file: CACHED,
    from: "    const cacheable = isWorthCaching(staticPrefix + perUserBlock, model);",
    to: "    const cacheable = isWorthCaching(perUserBlock, model);",
  },
  {
    name: "a prompt under the minimum gets a marker anyway",
    file: CACHED,
    from: "  if (!isWorthCaching(staticPrefix, model)) {",
    to: "  if (false) {",
  },
  {
    name: "the per-user block is dropped from the prompt entirely",
    file: CACHED,
    from: "    const whole = staticPrefix + perUserBlock + dynamicSuffix;",
    to: "    const whole = staticPrefix + dynamicSuffix;",
  },

  // ------------------------------------------------------------------
  // THE CONVERSATION.
  // ------------------------------------------------------------------
  {
    name: "the conversation breakpoint moves onto the new message",
    file: CACHED,
    from: "  const out = history.map((m, i) =>\n    i === history.length - 1",
    to: "  const out = history.map((m, i) =>\n    i === -1",
    edits: [
      {
        from: "  const out = history.map((m, i) =>\n    i === history.length - 1",
        to: "  const out = history.map((m, i) =>\n    i === -1",
      },
      {
        from: "  return [...out, current];",
        to: "  return [...out, { role: \"user\" as const, content: [{ type: \"text\" as const, text: currentMessage, cache_control: { type: \"ephemeral\" as const } }] }];",
      },
    ],
  },
  {
    name: "a short conversation is marked anyway, paying the write premium for nothing",
    file: CACHED,
    from: "  if (!isWorthCaching(\"x\".repeat(historyChars), model)) {",
    to: "  if (false) {",
  },
  {
    name: "the conversation loses a turn on the way to the model",
    file: CACHED,
    from: "  return [...out, current];",
    to: "  return [...out.slice(1), current];",
  },
  {
    name: "every turn is marked, so each request writes a fresh entry",
    file: CACHED,
    from: "    i === history.length - 1\n      ? {",
    to: "    i >= 0\n      ? {",
  },

  // ------------------------------------------------------------------
  // NARROWING. Off, and every doubt sends everything.
  // ------------------------------------------------------------------
  {
    name: "narrowing is on by default",
    file: RELEVANCE,
    from: "  enabled: false,",
    to: "  enabled: true,",
  },
  {
    name: "any value at all turns the flag on",
    file: RELEVANCE,
    from: '  const enabled = (process.env.CONTEXT_RELEVANCE ?? "").trim().toLowerCase() === "on";',
    to: "  const enabled = Boolean(process.env.CONTEXT_RELEVANCE);",
  },
  {
    name: "a question nothing matches is narrowed to nothing",
    file: RELEVANCE,
    from: '  if (matched.length === 0) return all("nothing matched the question");',
    to: "  if (false) return null;",
  },
  {
    name: "a short question is judged anyway",
    file: RELEVANCE,
    from: '  if (q.length < config.minQuestionChars) return all("question too short to judge");',
    to: "  if (false) return all(\"\");",
  },
  {
    // NOT the old post-hoc cap check — that was dead code, unreachable
    // once the floor is derived from maxDropShare, so removing it
    // changed nothing and proved nothing. The cap now lives in the
    // floor, and THAT is what must not be lost.
    name: "the floor stops respecting the drop cap",
    file: RELEVANCE,
    from: "  const floor = Math.max(config.minKeep, Math.ceil(summaries.length * (1 - config.maxDropShare)));",
    to: "  const floor = Math.max(1, config.minKeep - 4);",
  },
  {
    name: "the floor goes back to a constant that fights the cap",
    file: RELEVANCE,
    from: "  const floor = Math.max(config.minKeep, Math.ceil(summaries.length * (1 - config.maxDropShare)));",
    to: "  const floor = config.minKeep;",
  },
  {
    name: "the fill goes back to config order instead of recent activity",
    file: RELEVANCE,
    from: "      .sort((a, b) => (b.item.lastActivityMs ?? -1) - (a.item.lastActivityMs ?? -1));",
    to: "      .sort(() => 0);",
  },
  {
    name: "a module we have no words for is treated as irrelevant",
    file: RELEVANCE,
    from: "    if (!vocab) return { item: s, score: 1, unjudgeable: true };",
    to: "    if (!vocab) return { item: s, score: 0, unjudgeable: true };",
  },
  {
    // The `from` carried six spaces of indentation and the line has four —
    // it was written when this code sat one block deeper. An indentation
    // that no longer matches is not a failure: the harness prints "target
    // no longer exists" and the mutation silently stops applying.
    // ANCHOR REPAIRED. The whole-word branch grew a `counted` set and an
    // explicit multi-word else when the CJK/Arabic substring rule landed;
    // the old one-line `from` stopped matching and the mutation silently
    // never ran. STALE is not SURVIVED and it is not CAUGHT either.
    name: "matching becomes a substring test, so every module matches everything",
    file: RELEVANCE,
    from: "    if (words.has(folded)) {\n      counted.add(folded);",
    to: "    if (foldedQuestion.includes(folded)) {\n      counted.add(folded);",
  },
  {
    // THE GUARD ON THE FALLBACK, which is the thing that actually keeps
    // the line below from being the substring test above. A multi-word
    // term cannot be found in a word SET, so it is matched against the
    // question directly — but only because `folded.includes(" ")` proves
    // it is multi-word. Drop that and every single-word term goes back to
    // substring matching: "car" matches "carpet", "invoice" matches
    // "invoiced", and a module scores on a word the user never wrote.
    // ANCHOR REPAIRED, same refactor as above.
    name: "the multi-word guard is dropped, so single words go back to substring matching",
    file: RELEVANCE,
    from: '    } else if (folded.includes(" ") && foldedQuestion.includes(folded)) {',
    to: "    } else if (foldedQuestion.includes(folded)) {",
  },
  {
    name: "the kept modules are re-sorted by score, changing how the prompt reads",
    file: RELEVANCE,
    from: "    keep: summaries.filter((s) => kept.has(s)),",
    to: "    keep: [...summaries.filter((s) => kept.has(s))].reverse(),",
  },
  {
    // ANCHOR REPAIRED, AND THE MUTATION IS BIGGER THAN IT WAS. When this
    // was written the catalogue was two languages; it is ten now, because
    // the deep dive scored el 5/5, en 5/5 and 0-1/5 for the other eight.
    // Dropping to English alone is the regression that measured against.
    name: "the vocabulary stops reading every language's catalogue but English",
    file: "src/lib/ai/module-vocabulary.ts",
    from: "      [en, el, es, fr, de, it, pt, zh, ja, ar] as unknown as Record<string, unknown>[]",
    to: "      [en] as unknown as Record<string, unknown>[]",
  },
  {
    name: "the vocabulary stops reading field labels, so only the module's own name matches",
    file: RELEVANCE,
    from: "      for (const field of m.fields ?? []) {",
    to: "      for (const field of []) {",
  },

  // ------------------------------------------------------------------
  // THE DATA THE SELECTOR NEEDS.
  // ------------------------------------------------------------------
  {
    name: "the summaries stop carrying when a module was last written in",
    file: CONTEXT,
    from: "      lastActivityMs: m.lastActivityMs,",
    to: "      lastActivityMs: null,",
  },
  {
    name: "the slug leaks into the prompt the model reads",
    file: CONTEXT,
    from: "  return summaries.map((m) => `- ${m.title}: ${m.headlines.join(\", \")}`).join(\"\\n\");",
    to: "  return summaries.map((m) => `- ${m.slug}: ${m.title}: ${m.headlines.join(\", \")}`).join(\"\\n\");",
  },

  // ------------------------------------------------------------------
  // THE WIRING.
  // ------------------------------------------------------------------
  {
    name: "entity mentions go back into the middle, killing the per-user cache",
    file: ROUTE,
    // THIS ANCHOR HAS NOW GONE STALE TWICE, for the same reason both
    // times: the suffix gained `+ codingContext` when the coding module
    // landed, and `+ deepDive.prompt` when Deep Research learned to read
    // the account. Anchoring on the whole expression means every addition
    // to it breaks this mutation — so it now anchors on the FIRST TERM
    // only, which is the thing the mutation is actually about (entity
    // mentions must not sit in the cached per-user block), and which a
    // further addition to the suffix cannot invalidate.
    from: "      buildEntityMentionPromptAddition(mentionedEntities) + codingContext",
    to: "      codingContext",
    edits: [
      {
        from: "    const systemPerUser =\n      buildMemoryPromptAddition(memories) +",
        to: "    const systemPerUser =\n      buildMemoryPromptAddition(memories) +\n      buildEntityMentionPromptAddition(mentionedEntities) +",
      },
      {
        // `edits` TAKES PRECEDENCE OVER from/to, so this is the one that
        // has to be right — and it has now gone stale twice for the same
        // reason: the suffix gained `+ codingContext` when the coding
        // module landed and `+ deepDive.prompt` when Deep Research
        // learned to read the account. Anchored on the first TERM now
        // rather than the whole expression, so a third addition to the
        // suffix cannot silently switch this mutation off again.
        from: "      buildEntityMentionPromptAddition(mentionedEntities) + codingContext",
        to: "      codingContext",
      },
    ],
  },
  {
    name: "the cost estimate stops sizing the per-user block",
    file: ROUTE,
    from: "    const systemPrompt = systemStaticPrefix + systemPerUser + systemDynamicSuffix;",
    to: "    const systemPrompt = systemStaticPrefix + systemDynamicSuffix;",
  },
  {
    name: "the conversation stops being cached",
    file: ROUTE,
    from: "          const conversation = buildCachedMessages(",
    to: "          const conversation = ((h, m) => [...h.map((x) => ({ role: x.role, content: x.content })), { role: \"user\", content: m }])(",
  },
  {
    name: "a narrowing happens silently",
    file: ROUTE,
    from: "      if (selection.mode === \"narrowed\") {",
    to: "      if (false) {",
  },

  // ------------------------------------------------------------------
  // THE MEASUREMENTS THEMSELVES.
  // ------------------------------------------------------------------
  {
    name: "a failed load prints a zero instead of throwing",
    file: MEASURE,
    from: '  throw new Error("user-context did not load its formatter — refusing to report a zero");',
    to: "  // fine",
  },
  {
    name: "the measurement stops saying production traffic was not measured",
    file: MEASURE,
    from: " *   NOT MEASURED: production traffic.",
    to: " *   Measured against production traffic.",
  },
  {
    name: "the quality harness runs without a key",
    file: QUALITY,
    from: "if (!KEY) {",
    to: "if (false) {",
  },
];

let caught = 0;
const missed = [];
for (const m of MUTANTS) {
  const original = readFileSync(m.file, "utf8");
  const edits = m.edits ?? [{ from: m.from, to: m.to }];
  const stale = edits.find((e) => !original.includes(e.from));
  if (stale) {
    missed.push({ ...m, why: "the mutation target no longer exists in the file" });
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
  // CAUGHT IS DECIDED BY THE EXIT CODE, not by the text.
  //
  // This used to be `let detail = null` … `if (detail)`, which asks "did
  // we manage to find a line saying FAIL in the child's stdout" and
  // treats a no as "the mutation was missed". A gate that exits non-zero
  // while its stdout arrives empty or truncated — which happened, twice,
  // on different mutants of the same run — was then reported as a HOLE
  // that is not there. An intermittently red mutation gate is worse than
  // none: it teaches you to re-run it until it is green.
  let failed = false;
  let detail = "";
  try {
    execFileSync("node", [GATE], { encoding: "utf8", stdio: "pipe" });
  } catch (e) {
    failed = true;
    const out = String(e.stdout || "") + String(e.stderr || "");
    detail = (out.split("\n").find((l) => l.includes("FAIL")) || out.split("\n")[0] || "").trim();
  } finally {
    writeFileSync(m.file, original);
  }
  if (failed) {
    caught++;
    console.log(`  CAUGHT  ${m.name}\n          ${detail.slice(0, 110)}`);
  } else {
    missed.push({ ...m, why: "the gate stayed green with the defect re-introduced" });
    console.log(`  MISSED  ${m.name}`);
  }
}

try {
  execFileSync("node", [GATE], { stdio: "pipe" });
  console.log("\nbaseline: the gate is green on the unmutated tree");
} catch {
  console.log("\nBASELINE IS RED — a mutation was not restored. Check `git diff`.");
  process.exit(1);
}
console.log(`\n${caught} of ${MUTANTS.length} mutations caught.`);
if (missed.length) {
  console.log("\nHOLES:");
  for (const m of missed) console.log(`  - ${m.name}\n    ${m.why}`);
  process.exit(1);
}
console.log("Every re-introduced defect turned the gate red.");
