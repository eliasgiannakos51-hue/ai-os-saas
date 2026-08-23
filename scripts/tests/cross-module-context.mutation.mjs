#!/usr/bin/env node
/*
 * CAN THE CROSS-MODULE CONTEXT GATE GO RED?
 *
 * Every defect below leaves a working feature on screen. Chat still
 * answers, coding still runs, and the only thing that changed is what the
 * user pays for and whether the model is telling the truth.
 *
 *   A REQUEST THAT DOUBLED. A chat request already sends 20,725
 *   characters. Raise the ceiling, stop counting the header against it,
 *   drop the budget check inside the loop, or lift the item cap, and the
 *   bill goes up on every message with nothing on screen to show for it.
 *
 *   A THRESHOLD THAT MATCHES EVERYTHING. A minimum score of one, a
 *   substring test instead of whole words, or no minimum question length
 *   and this stops being "the relevant sessions" and becomes "the four
 *   most recent", attached to a question about last month's revenue.
 *
 *   A SNIPPET CUT IN HALF. Truncate to fit rather than dropping the item
 *   whole and the model is handed code that reads as complete and is not.
 *
 *   A DENIAL OF SOMETHING THAT HAPPENED. Lose the "not all of them"
 *   sentence and the model answers "no, I never wrote you that function"
 *   about work it did.
 *
 *   ONE PERSON'S HISTORY IN ANOTHER PERSON'S PROMPT. Reach for the admin
 *   client and the row filter stops being the database's.
 *
 *   A FAILED SESSION OFFERED AS WORK, or a history query that costs
 *   somebody their chat message.
 *
 *   A FEATURE THAT IS NOT WIRED. Either direction silently unplugged, or
 *   the per-message block folded into the cached prefix so every turn
 *   writes a fresh cache entry at the 1.25x premium.
 *
 * ===================== WHAT THIS RUN FOUND =====================
 *
 * 17 of 27 caught. The ten survivors are not bad anchors — each was
 * checked by hand — they are five things the gate cannot currently see,
 * and one mutation that is not a defect at all:
 *
 *   A CONSTANT COMPARED WITH ITSELF. The budget assertions read
 *   `rendered.length <= x.MAX_CROSS_CONTEXT_CHARS` and
 *   `chosen.length <= x.MAX_ITEMS`, so raising either constant moves the
 *   assertion with it. 900 -> 20,000 and 4 -> 40 both stay green. The
 *   absolute numbers — the whole point of "this must not double the
 *   request" — are asserted nowhere.
 *
 *   A FIXTURE THAT DOES NOT ISOLATE THE RULE. "why?" is the short
 *   question, and it also happens to share no term with any candidate,
 *   so MIN_QUESTION_CHARS can go to 0 and nothing changes. Likewise the
 *   "score first, then recency" case: the newer item scores 1 against
 *   MIN_SCORE 2, so it is filtered out before the sort ever runs, and
 *   sorting by recency first is invisible.
 *
 *   ONE REGEX OVER TWO SYMMETRIC LOADERS. The store checks are
 *   `/\.limit\(POOL_ROWS\)/` and `/return EMPTY;/` over the whole file,
 *   and the file has two loaders. Break either one alone and the twin
 *   keeps the gate green (breaking BOTH is caught — verified).
 *
 *   A REGEX THAT MATCHES A COMMENT. `/you said|they asked/` runs against
 *   the raw source, and the file comment above the function contains
 *   "you said". Strip the labels off the rendered turns and the comment
 *   alone holds the assertion up.
 *
 *   A CACHED BLOCK NOBODY CHECKS. Section 8 asserts the coding block is
 *   NOT in systemPerUser and IS in systemDynamicSuffix. It never looks at
 *   systemStaticPrefix — the most expensive place to put it.
 *
 *   AND ONE EQUIVALENT MUTANT. Dropping the three-character minimum from
 *   questionWords changes nothing observable: scoreTerms skips terms
 *   under three characters itself, so short words in the set can never
 *   match. Verified across the gate's own fixtures — identical chosen
 *   items and identical chars, only the `reason` string differs.
 *
 * Run: node scripts/tests/cross-module-context.mutation.mjs
 */
import { readFileSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";

const GATE = "scripts/tests/cross-module-context.test.mjs";

const CONTEXT = "src/lib/ai/cross-module-context.ts";
const STORE = "src/lib/ai/cross-module-store.ts";
const RELEVANCE = "src/lib/ai/context-relevance.ts";
const CHAT_ROUTE = "src/app/api/chat/route.ts";
const CODING_ROUTE = "src/app/api/coding/run/route.ts";

const MUTANTS = [
  // ------------------------------------------------------------------
  // A THRESHOLD THAT MATCHES EVERYTHING.
  // ------------------------------------------------------------------
  {
    name: "one shared word is a match, so the four most recent items are attached to everything",
    file: CONTEXT,
    from: "export const MIN_SCORE = 2;",
    to: "export const MIN_SCORE = 1;",
  },
  {
    name: "the matcher goes back to a substring test, so \"art\" matches \"start\"",
    file: RELEVANCE,
    from: "    if (words.has(folded)) score += 1;",
    to: "    if ([...words].some((w) => w.includes(folded))) score += 1;",
  },
  {
    name: "a two-word question is judged, so \"why?\" pulls in past sessions",
    file: CONTEXT,
    from: "export const MIN_QUESTION_CHARS = 20;",
    to: "export const MIN_QUESTION_CHARS = 0;",
  },
  {
    name: "questionWords drops its three-character minimum",
    file: RELEVANCE,
    from: "filter((w) => w.length >= 3));",
    to: "filter((w) => w.length >= 1));",
  },
  {
    name: "the newest item wins over the better match, which is the feature this is not",
    file: CONTEXT,
    from: "    .sort((a, b) => b.score - a.score || b.item.atMs - a.item.atMs);",
    to: "    .sort((a, b) => b.item.atMs - a.item.atMs || b.score - a.score);",
  },

  // ------------------------------------------------------------------
  // A REQUEST THAT DOUBLED.
  // ------------------------------------------------------------------
  {
    name: "the ceiling is raised to 20,000 characters, which doubles the request",
    file: CONTEXT,
    from: "export const MAX_CROSS_CONTEXT_CHARS = 900;",
    to: "export const MAX_CROSS_CONTEXT_CHARS = 20000;",
  },
  {
    name: "the header stops counting against the budget, so the block goes over by its size",
    file: CONTEXT,
    from: "  let chars = headerChars;",
    to: "  let chars = 0;",
  },
  {
    name: "the budget is no longer checked inside the loop",
    file: CONTEXT,
    from: "    if (chars + cost > (params.maxChars ?? MAX_CROSS_CONTEXT_CHARS)) break;\n",
    to: "",
  },
  {
    name: "the item cap goes to forty, so the model chooses between snippets instead of using them",
    file: CONTEXT,
    from: "export const MAX_ITEMS = 4;",
    to: "export const MAX_ITEMS = 40;",
  },
  {
    name: "an item that does not fit is truncated to fit rather than dropped whole",
    file: CONTEXT,
    from:
      "    if (chars + cost > (params.maxChars ?? MAX_CROSS_CONTEXT_CHARS)) break;\n" +
      "    chosen.push({ ...item, text });\n" +
      "    chars += cost;",
    to:
      "    const room = (params.maxChars ?? MAX_CROSS_CONTEXT_CHARS) - chars - 3;\n" +
      "    if (room <= 0) break;\n" +
      "    chosen.push({ ...item, text: text.slice(0, room) });\n" +
      "    chars += Math.min(text.length, room) + 3;",
  },
  {
    name: "the reported size is the loop's estimate, not the size of the block that ships",
    file: CONTEXT,
    from: "    chars: renderCrossContext({ chosen, reason: \"\", chars: 0 }, params.kind).length,",
    to: "    chars,",
  },

  // ------------------------------------------------------------------
  // A DENIAL OF SOMETHING THAT HAPPENED.
  // ------------------------------------------------------------------
  {
    name: "the coding block stops saying it is only a subset, so the model denies work it did",
    file: CONTEXT,
    from: " These are only the sessions matching this question, not all of them.",
    to: "",
  },
  {
    name: "the coding block stops framing the sessions as the model's own past work",
    file: CONTEXT,
    from: "Refer to these as your own past work when they are what the user means, and say plainly when they are not.",
    to: "Refer to these when they are relevant.",
  },
  {
    name: "the chat block stops saying it is only part of the conversation",
    file: CONTEXT,
    from: " These are only the turns matching this request, not the whole conversation.",
    to: "",
  },
  {
    name: "the chat block stops being the answer to \"why did you do it that way\"",
    file: CONTEXT,
    from: "Use them to recall what was decided and why. ",
    to: "",
  },

  // ------------------------------------------------------------------
  // WHAT THE STORE REFUSES TO OFFER.
  // ------------------------------------------------------------------
  {
    name: "the store reaches for the admin client instead of the user's RLS-scoped one",
    file: STORE,
    from: "    const { data, error } = await supabase\n      .from(\"code_sessions\")",
    to:
      "    const { createAdminClient } = await import(\"@/lib/supabase/admin\");\n" +
      "    const { data, error } = await (createAdminClient() as unknown as SupabaseLike)\n" +
      "      .from(\"code_sessions\")",
  },
  {
    name: "a failed session with no output is offered as the function you wrote",
    file: STORE,
    from: "      .filter((r) => r.status === \"done\" && typeof r.output === \"string\" && r.output.trim() !== \"\")\n",
    to: "",
  },
  {
    name: "the coding pool is unbounded, so 4,000 sessions are scored on every chat message",
    file: STORE,
    from:
      "      .select(\"id, operation, title, input, language, target_language, output, status, created_at\")\n" +
      "      .order(\"created_at\", { ascending: false })\n" +
      "      .limit(POOL_ROWS);",
    to:
      "      .select(\"id, operation, title, input, language, target_language, output, status, created_at\")\n" +
      "      .order(\"created_at\", { ascending: false });",
  },
  {
    name: "a history query that fails takes the user's chat message down with it",
    file: STORE,
    from: "    logApiError(\"ai:cross-module\", err, { stage: \"coding_for_chat\" });\n    return EMPTY;",
    to: "    throw err;",
  },
  {
    name: "chat turns arrive unlabelled, so \"you said\" and \"they asked\" become one claim",
    file: STORE,
    from: "${role === \"assistant\" ? \"you said\" : \"they asked\"}: ",
    to: ": ",
  },

  // ------------------------------------------------------------------
  // A FEATURE THAT IS NOT WIRED.
  // ------------------------------------------------------------------
  {
    name: "the chat route stops loading the user's coding sessions",
    file: CHAT_ROUTE,
    from: "      const coding = await loadCodingContextForChat(supabase, message);",
    to: "      const coding = { text: \"\", selection: { chosen: [], reason: \"off\", chars: 0 }, pool: 0 };",
  },
  {
    name: "the coding route stops loading the user's chat turns",
    file: CODING_ROUTE,
    from:
      "    const chatContext = useWorkspace\n" +
      "      ? await loadChatContextForCoding(supabase, `${input} ${operation}`)\n" +
      "      : { text: \"\", selection: { chosen: [], reason: \"workspace off\", chars: 0 }, pool: 0 };",
    to: "    const chatContext = { text: \"\", selection: { chosen: [], reason: \"workspace off\", chars: 0 }, pool: 0 };",
  },
  {
    name: "the per-message coding block is folded into the cached STATIC prefix",
    file: CHAT_ROUTE,
    from:
      "    const systemStaticPrefix = mentorMode\n" +
      "      ? buildMentorSystemPrompt(personaName)\n" +
      "      : buildSystemPrompt(personaName);",
    to:
      "    const systemStaticPrefix = (mentorMode\n" +
      "      ? buildMentorSystemPrompt(personaName)\n" +
      "      : buildSystemPrompt(personaName)) + codingContext;",
  },
  {
    name: "the per-message coding block is folded into the cached PER-USER block",
    file: CHAT_ROUTE,
    from: "      integrationInstruction;",
    to: "      integrationInstruction +\n      codingContext;",
  },
  {
    name: "the coding block is dropped from the per-message suffix, so it never ships",
    file: CHAT_ROUTE,
    from: "    const systemDynamicSuffix = buildEntityMentionPromptAddition(mentionedEntities) + codingContext;",
    to: "    const systemDynamicSuffix = buildEntityMentionPromptAddition(mentionedEntities);",
  },
  {
    name: "a coding-context failure is no longer caught, so it costs the message",
    file: CHAT_ROUTE,
    from:
      "    } catch (err) {\n" +
      "      // An enhancement must never cost the user their message.\n" +
      "      logApiError(\"/api/chat\", err, { stage: \"coding_context\" });\n" +
      "    }",
    to: "    } catch (err) {\n      throw err;\n    }",
  },
  {
    name: "the coding route stops telling the user how many of their chat turns it read",
    file: CODING_ROUTE,
    from: "      chatTurnsUsed: chatContext.selection.chosen.length,\n    });",
    to: "    });",
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
    console.log(`  CAUGHT  ${m.name}\n          ${detail.slice(0, 130)}`);
  } else {
    missed.push({ ...m, why: "the gate stayed green with the defect re-introduced" });
    console.log(`  MISSED  ${m.name}`);
  }
}

for (const gate of [GATE]) {
  try {
    execFileSync("node", [gate], { stdio: "pipe" });
  } catch {
    console.log(`\nBASELINE IS RED (${gate}) — a mutation was not restored. Check \`git diff\`.`);
    process.exit(1);
  }
}
console.log("\nbaseline: the gate is green on the unmutated tree");
console.log(`\n${caught} of ${MUTANTS.length} mutations caught.`);
if (missed.length) {
  console.log("\nHOLES:");
  for (const m of missed) console.log(`  - ${m.name}\n    ${m.why}`);
  process.exit(1);
}
console.log("Every re-introduced defect turned the gate red.");
