// CODING AND CHAT SEEING EACH OTHER (V4 #36).
//
// FIVE THINGS THAT WOULD BE WRONG QUIETLY:
//
//   A CONTEXT THAT DOUBLES THE REQUEST. A chat request already sends
//   20,725 characters. Appending a user's coding history to it is not a
//   feature, it is a cost regression with a changelog entry — and the
//   budget must count the HEADER, which the first version of this did
//   not (a "900-character budget" rendered 1,151).
//
//   A THRESHOLD THAT MATCHES EVERYTHING. One shared word is a
//   coincidence; "function" and "code" appear in half of everything. A
//   minimum of one turns this into "attach the four most recent items",
//   which is the feature this is explicitly not.
//
//   A DENIAL OF SOMETHING THAT HAPPENED. If the block does not say it is
//   a SUBSET, the model answers "no, I have not written you any
//   functions" when the ones it got did not include the one meant.
//
//   TWO RELEVANCE RULES. Module selection and item selection must match
//   the same way; two copies of "fold, split, count whole words" is two
//   things to drift.
//
//   A FAILED SESSION OFFERED AS WORK. A row whose output is null,
//   described to the user as the function you wrote.
//
// Runs in the build gate; needs no API key.
//
// Run: node scripts/tests/cross-module-context.test.mjs
import { readFileSync } from "node:fs";
import { loadTs } from "./load-ts.mjs";

let pass = 0;
const failures = [];
const ok = (name, cond, detail) => {
  if (cond) { pass++; console.log(`  PASS  ${name}`); }
  else { failures.push(name); console.log(`  FAIL  ${name}${detail !== undefined ? "\n        " + detail : ""}`); }
};
const eq = (name, actual, expected) =>
  ok(name, JSON.stringify(actual) === JSON.stringify(expected), `expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);

const x = await loadTs("src/lib/ai/cross-module-context.ts");
const rel = await loadTs("src/lib/ai/context-relevance.ts");

const item = (id, terms, text, ageDays = 1) => ({
  id,
  terms,
  text,
  atMs: Date.now() - ageDays * 86_400_000,
});

const MARGIN = item("m", ["margin", "calculate", "typescript", "pricing"], "generate (typescript): margin helper — export function margin(cost, price) {...}");
const PARSER = item("p", ["parser", "csv", "python", "encoding"], "explain (python): csv parser", 2);

// =====================================================================
console.log("\n== 1. NOTHING BY DEFAULT ==");
// =====================================================================
// Every one of these is a request that must go out byte-identical to
// what it was before this feature existed.
{
  const cases = [
    ["no history at all", { question: "remember the margin function you wrote in typescript?", candidates: [] }],
    ["a question too short to judge", { question: "why?", candidates: [MARGIN] }],
    // NINETEEN CHARACTERS, one under the threshold and packed with terms
    // that WOULD match. Without a real boundary case, dropping the
    // minimum to zero changes nothing any assertion can see.
    ["a question one character under the threshold", { question: "margin typescript?", candidates: [MARGIN] }],
    ["a question about something else", { question: "what was my revenue last month and where should I focus", candidates: [MARGIN, PARSER] }],
    ["a question with no long words", { question: "a b c d e f g h i j k l m n o p q r s", candidates: [MARGIN] }],
  ];
  for (const [label, params] of cases) {
    const sel = x.selectCrossContext({ ...params, kind: "coding" });
    eq(`${label}: nothing chosen`, sel.chosen.length, 0);
    eq(`${label}: and nothing rendered`, x.renderCrossContext(sel, "coding"), "");
    eq(`${label}: and zero chars`, x.crossContextChars(sel, "coding"), 0);
    ok(`${label}: with a stated reason`, typeof sel.reason === "string" && sel.reason.length > 5, sel.reason);
  }
}

// =====================================================================
console.log("\n== 2. ONE SHARED WORD IS NOT A MATCH ==");
// =====================================================================
{
  // "typescript" alone. A threshold of one would attach this; two says
  // the question has to be about the same subject, not merely in the
  // same language.
  const one = x.selectCrossContext({ question: "is typescript better than javascript for a new project", candidates: [MARGIN], kind: "coding" });
  eq("a single shared term does not clear the threshold", one.chosen.length, 0);

  const two = x.selectCrossContext({ question: "remember the margin function you wrote in typescript for pricing", candidates: [MARGIN], kind: "coding" });
  eq("two shared terms do", two.chosen.length, 1);
}
{
  // WHOLE WORDS ONLY. A substring test makes "art" match "start" and
  // every candidate matches every question.
  const sub = x.selectCrossContext({
    question: "please restart the marginal parsers and the cartography module now",
    candidates: [item("s", ["art", "margin", "parser"], "x")],
    kind: "coding",
  });
  eq("substrings do not count as matches", sub.chosen.length, 0, JSON.stringify(sub));
}

// =====================================================================
console.log("\n== 3. THE BUDGET IS THE WHOLE BLOCK ==");
// =====================================================================
{
  const many = Array.from({ length: 20 }, (_, i) =>
    item(`i${i}`, ["margin", "calculate", "typescript", "pricing"], "x".repeat(400), i)
  );
  const sel = x.selectCrossContext({ question: "remember the margin function you wrote in typescript for pricing", candidates: many, kind: "coding" });
  const rendered = x.renderCrossContext(sel, "coding");

  // THE HEADER COUNTS. This is the bug the measurement script caught:
  // budgeting only the items rendered 1,151 characters against a stated
  // 900. What the caller cares about is what lands in the request.
  ok(
    `the rendered block is within the budget (${rendered.length} <= 900)`,
    rendered.length <= 900,
    rendered.slice(0, 120)
  );
  eq("…and the reported size is the rendered size", sel.chars, rendered.length);
  ok(`…for the chat header too`, x.renderCrossContext(x.selectCrossContext({
    question: "remember the margin function you wrote in typescript for pricing", candidates: many, kind: "chat",
  }), "chat").length <= 900);

  // THE LITERAL, NOT THE CONSTANT.
  //
  // `sel.chosen.length <= x.MAX_ITEMS` is a tautology: raise MAX_ITEMS to
  // forty and the assertion raises with it. The mutation suite caught
  // exactly this on four separate constants. A budget is a NUMBER
  // somebody chose, so the number is what is asserted, and a deliberate
  // change to it has to be made here too.
  eq("the item cap is four", x.MAX_ITEMS, 4);
  eq("the per-item clamp is 280 characters", x.MAX_ITEM_CHARS, 280);
  eq("the whole-block budget is 900 characters", x.MAX_CROSS_CONTEXT_CHARS, 900);
  eq("the score threshold is two", x.MIN_SCORE, 2);
  eq("a question under twenty characters is not judged", x.MIN_QUESTION_CHARS, 20);
  ok(`never more than four items (${sel.chosen.length})`, sel.chosen.length <= 4, String(sel.chosen.length));
  for (const c of sel.chosen) {
    ok(`each item is clamped to 280 (${c.text.length})`, c.text.length <= 280, String(c.text.length));
  }
  // AND THE BUDGET IS REAL, measured against a hard number rather than
  // against itself.
  ok(`the rendered block never exceeds 900 chars (${rendered.length})`, rendered.length <= 900, String(rendered.length));
  // A block truncated mid-snippet reads as complete and is not, and the
  // model has no way to know. Items are dropped whole or kept whole.
  ok("…and no item is cut off by the budget", !rendered.endsWith("x"), rendered.slice(-40));
}
{
  // A single item too large for the budget yields nothing, and says so —
  // rather than a header with no items under it.
  const huge = item("h", ["margin", "typescript", "pricing"], "y".repeat(5000));
  const sel = x.selectCrossContext({
    question: "remember the margin function you wrote in typescript for pricing",
    candidates: [huge], kind: "coding", maxChars: 300,
  });
  eq("an item that cannot fit is dropped, not truncated", sel.chosen.length, 0);
  eq("…and nothing is rendered", x.renderCrossContext(sel, "coding"), "");
}

// =====================================================================
console.log("\n== 4. SCORE FIRST, THEN RECENCY ==");
// =====================================================================
{
  // BOTH MUST CLEAR THE THRESHOLD, or the weaker one is filtered out
  // before the sort ever sees it — which is how a mutant that reversed
  // the sort order survived this section.
  const older = item("old", ["margin", "calculate", "typescript", "pricing"], "OLDER but four matches", 30);
  const newer = item("new", ["margin", "typescript"], "NEWER but only two matches", 0);
  const sel = x.selectCrossContext({
    question: "remember the margin function you wrote in typescript for pricing calculate",
    candidates: [newer, older], kind: "coding",
  });
  eq("the better match wins over the newer one", sel.chosen[0]?.id, "old");
  // AND ONLY ONE OF THEM SURVIVES A CAP OF ONE, so a sort that put
  // recency first would keep the wrong item rather than merely reorder
  // two that both got in.
  const capped = x.selectCrossContext({
    question: "remember the margin function you wrote in typescript for pricing calculate",
    candidates: [newer, older], kind: "coding", maxItems: 1,
  });
  eq("…and with room for only one, it is the better match", capped.chosen.map((c) => c.id), ["old"]);
}
{
  const a = item("a", ["margin", "typescript"], "A", 5);
  const b = item("b", ["margin", "typescript"], "B", 1);
  const sel = x.selectCrossContext({
    question: "remember the margin function you wrote in typescript", candidates: [a, b], kind: "coding",
  });
  eq("equal matches are ordered by recency", sel.chosen[0]?.id, "b");
}

// =====================================================================
console.log("\n== 5. THE BLOCK SAYS WHAT IT IS AND WHAT IT IS NOT ==");
// =====================================================================
{
  const sel = x.selectCrossContext({
    question: "remember the margin function you wrote in typescript for pricing",
    candidates: [MARGIN], kind: "coding",
  });
  const coding = x.renderCrossContext(sel, "coding");
  ok("the coding block names the source", /OWN AI CODING SESSIONS/.test(coding));
  ok("…tells the model it is its own past work", /your own past work/i.test(coding));
  // WITHOUT THIS the model denies work it actually did, whenever the
  // four sessions it got were not the ones meant.
  ok("…and says it is only a subset", /not all of them/i.test(coding), coding.slice(0, 200));

  const chatSel = x.selectCrossContext({
    question: "remember the margin function you wrote in typescript for pricing",
    candidates: [MARGIN], kind: "chat",
  });
  const chat = x.renderCrossContext(chatSel, "chat");
  ok("the chat block names its source", /OWN CHAT WITH YOU/.test(chat));
  ok("…and answers the 'why did you do it that way' question", /what was decided and why/i.test(chat));
  ok("…and says it is only a subset", /not the whole conversation/i.test(chat));
}

// =====================================================================
console.log("\n== 6. ONE RELEVANCE RULE, NOT TWO ==");
// =====================================================================
{
  const src = readFileSync("src/lib/ai/cross-module-context.ts", "utf8");
  ok("item selection imports the shared primitives", /from "@\/lib\/ai\/context-relevance"/.test(src));
  ok("…and does not reimplement the word split", !/split\(\/\[\^\\p\{L\}/.test(src.replace(/^\s*\/\/.*$/gm, "")));

  // THE SAME INPUT MUST SCORE THE SAME WAY on both paths, or "we use the
  // same relevance rule" is a claim rather than a fact.
  const folded = "remember the margin function you wrote in typescript";
  const words = rel.questionWords(folded);
  eq("the shared scorer counts whole-word hits", rel.scoreTerms(words, folded, ["margin", "typescript", "python"]), 2);
  eq("…and ignores terms under three characters", rel.scoreTerms(words, folded, ["in", "a"]), 0);
  // THE WORD SIDE OF THE MINIMUM, not just the term side. Dropping it in
  // questionWords lets one-and two-letter words of the question match,
  // and every candidate matches every question again.
  ok("…and short words of the QUESTION are not matched on", !rel.questionWords("a bb ccc dddd").has("bb"));
  ok("…while three-letter ones are", rel.questionWords("a bb ccc dddd").has("ccc"));
  eq("the question's word set holds only words of three or more", [...rel.questionWords("a bb ccc dddd")].sort(), ["ccc", "dddd"]);
  eq("…and matches a multi-word term against the question", rel.scoreTerms(words, folded, ["margin function"]), 1);
  // Module selection still works, unchanged, through the same primitives.
  const sel = rel.selectRelevantModules("x", [{ slug: "a" }], [], { ...rel.DEFAULT_SELECTION_CONFIG, enabled: true });
  eq("module selection still returns everything when it should", sel.mode, "all");
}

// =====================================================================
console.log("\n== 7. WHAT THE STORE REFUSES TO OFFER ==");
// =====================================================================
{
  const store = readFileSync("src/lib/ai/cross-module-store.ts", "utf8");
  const stripped = store.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
  // THROUGH THE USER'S OWN CLIENT. This loads one person's history into
  // a prompt; the row filter must be the database's, not a .eq() that
  // somebody can forget.
  ok("it never reaches for the admin client", !/createAdminClient/.test(stripped));
  ok("…and takes the RLS-scoped client as a parameter", /supabase: SupabaseLike/.test(stripped));
  // A FAILED SESSION PRODUCED NOTHING and must not be offered as work.
  ok("a failed or empty session is never a candidate", /r\.status === "done"/.test(stripped));
  ok("…nor one with no output", /typeof r\.output === "string"/.test(stripped));
  // A HARD ROW LIMIT BEFORE RELEVANCE, so a user with 4,000 sessions
  // does not pay to score all of them on every message.
  // BOUNDED IN BOTH LOADERS. One `.limit(POOL_ROWS)` anywhere in the
  // file satisfies a whole-file regex while the other query scans the
  // table — the mutation suite removed exactly one of the two and this
  // check stayed green.
  eq(`both loaders bound their pool`, (stripped.match(/\.limit\(POOL_ROWS\)/g) ?? []).length, 2);
  for (const table of ["code_sessions", "chat_messages"]) {
    const at = stripped.indexOf(`.from("${table}")`);
    ok(`${table} is limited`, at !== -1 && /\.limit\(POOL_ROWS\)/.test(stripped.slice(at, at + 400)), table);
  }
  ok("…and old rows are excluded", /MAX_AGE_DAYS/.test(stripped));
  // AN ENHANCEMENT MUST NOT COST A MESSAGE.
  ok("every failure is an empty context", /return EMPTY;/.test(stripped));
  // THE ROLE IS CARRIED, BOTH WAYS. "you said" and "they asked" are
  // different claims, and a model handed unlabelled turns attributes
  // them wrongly. Checking for either one alone passes when the other is
  // deleted, which is how the mutation suite found this.
  // AGAINST THE STRIPPED SOURCE. The doc comment above the loader
  // explains the rule using the same words, so a check against the raw
  // file stays green with the labels deleted from the rendered turn —
  // the file would fail BECAUSE it documents the rule, which is the
  // instrument bug this codebase has hit before.
  ok("an assistant turn is labelled", /you said/.test(stripped), stripped.slice(0, 80));
  ok("…and a user turn too", /they asked/.test(stripped));
  ok("…from the role column, not from position", /r\.role === "assistant"/.test(stripped));

  // A HARD ROW LIMIT WITH A REAL NUMBER. `.limit(POOL_ROWS)` passes at
  // any POOL_ROWS, including none — the constant has to be pinned.
  ok("the pool is forty rows", /const POOL_ROWS = 40;/.test(store));
  ok("…and ninety days", /const MAX_AGE_DAYS = 90;/.test(store));

  // EVERY EXPORTED LOADER FAILS TO EMPTY. One of the two returning EMPTY
  // is not the property; both of them is.
  const loaders = stripped.split("export async function").slice(1);
  eq(`both loaders exist (${loaders.length})`, loaders.length, 2);
  for (const fn of loaders) {
    const name = fn.slice(0, fn.indexOf("(")).trim();
    ok(`${name} catches and returns EMPTY`, /catch \(err\)[\s\S]*?return EMPTY;/.test(fn), name);
    ok(`…and never rethrows`, !/catch \(err\)[\s\S]{0,200}throw/.test(fn), name);
  }
}

// =====================================================================
console.log("\n== 8. BOTH DIRECTIONS ARE ACTUALLY WIRED ==");
// =====================================================================
{
  const chat = readFileSync("src/app/api/chat/route.ts", "utf8");
  const coding = readFileSync("src/app/api/coding/run/route.ts", "utf8");
  ok("chat loads the coding context", /loadCodingContextForChat\(/.test(chat));
  ok("…from the user's own message", /loadCodingContextForChat\(supabase, message\)/.test(chat));
  ok("coding loads the chat context", /loadChatContextForCoding\(/.test(coding));
  // IN THE PER-MESSAGE BLOCK, NOT THE CACHED PER-USER ONE.
  //
  // This assertion said the opposite in its first version, and so did
  // the route. The per-user block is 1,385 tokens that CACHE; a block
  // selected from the question changes every turn, so putting it there
  // would break that cache on every message — paying ~1,246 full-price
  // tokens to save at most 177. Measured, not argued: see
  // scripts/measure-context.mjs.
  const perUser = chat.slice(chat.indexOf("const systemPerUser ="), chat.indexOf("const systemDynamicSuffix"));
  ok("the coding block is NOT in the cached per-user block", !/codingContext/.test(perUser), perUser.slice(0, 200));
  ok("…it is in the per-message suffix", /systemDynamicSuffix = buildEntityMentionPromptAddition\(mentionedEntities\) \+ codingContext/.test(chat));
  // AND NOT IN THE STATIC PREFIX EITHER. That block is byte-identical
  // across every user in the app; a per-message string in it would break
  // the cache for EVERYONE, not merely for the one asking. Guarding only
  // the per-user block left this open.
  const staticAt = chat.indexOf("const systemStaticPrefix =");
  ok("the static prefix exists to check", staticAt !== -1);
  ok("…and carries nothing per-message",
    !/codingContext/.test(chat.slice(staticAt, chat.indexOf(";", chat.indexOf("buildSystemPrompt(personaName)")) + 1)),
    chat.slice(staticAt, staticAt + 200));
  // THE INVARIANT over the whole request: codingContext is DECLARED
  // once, ASSIGNED once, and CONSUMED once — in the per-message suffix.
  // A fourth mention would be a second place it reaches the prompt, and
  // that is the failure this pins. (The log line reads its .length and
  // is excluded by the word-boundary requiring a non-property use.)
  eq("codingContext is declared once", (chat.match(/let codingContext = ""/g) ?? []).length, 1);
  eq("…assigned once", (chat.match(/^\s*codingContext = /gm) ?? []).length, 1);
  eq("…and reaches the prompt in exactly one place",
    (chat.match(/\+ codingContext\b|codingContext \+/g) ?? []).length, 1);
  // A FAILURE MUST NOT COST THE MESSAGE.
  ok("a coding-context failure is caught", /stage: "coding_context"/.test(chat));

  // AND THE USER IS TOLD WHAT WAS READ ON THEIR BEHALF. Reading somebody's
  // conversation into a code request and not saying so is the difference
  // between a feature and a surprise. It must reach the RESPONSE, not
  // merely exist as a variable.
  ok("the coding route counts the chat turns it used", /chatTurnsUsed: chatContext\.selection\.chosen\.length/.test(coding));
  // THE SUCCESS RESPONSE, not the last one in the file — the last is the
  // 500 handler, which is exactly the sort of near-miss anchor that makes
  // a gate pass for the wrong reason.
  const successAt = coding.indexOf("return NextResponse.json({\n      ok: true,");
  ok("the success response exists to check", successAt !== -1);
  const responseBlock = coding.slice(successAt, successAt + 700);
  ok("…and returns the count to the client", /chatTurnsUsed/.test(responseBlock), responseBlock.slice(0, 200));
  // …and it is recorded on the settlement, so the cost of the context is
  // attributable afterwards rather than only guessable.
  ok("…and records it on the settlement", /chatTurnsUsed: chatContext\.selection\.chosen\.length,/.test(coding));
}

console.log(`\n${failures.length === 0 ? "ALL PASS" : "FAILURES"}: ${pass} passed, ${failures.length} failed`);
if (failures.length) { console.log(failures.map((f) => "  - " + f).join("\n")); process.exit(1); }
