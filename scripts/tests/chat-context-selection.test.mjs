// The context selection that chat and Ask AI actually run — which nothing
// was testing.
//
// HOW THIS FILE CAME TO EXIST. cross-module-context-chat-coding.mutation.mjs
// re-introduces fourteen real regressions into
//
//     src/lib/context-relevance.ts
//     src/lib/chat/entity-mentions.ts
//     src/lib/chat/record-conversation-context.ts
//
// and required cross-module-context.test.mjs to go red for each. It caught
// 0 of 14 — and not because the mutations were stale: every one applied
// cleanly. The gate it pointed at loads
//
//     src/lib/ai/context-relevance.ts
//     src/lib/ai/cross-module-context.ts
//
// which are DIFFERENT MODULES with a different API — selectRelevantModules
// and buildModuleVocabulary, not termsOf/relevanceScore/selectWithinBudget.
// Two parallel implementations of "what context is relevant", one of them
// tested and the other one live: entity-mentions.ts is imported by
// api/chat/route.ts and record-conversation-context.ts by
// api/records/ask/route.ts. The mutation suite was aimed at the wrong gate,
// so the half that runs on every chat message was covered by nothing.
//
// Every check here corresponds to a mutation in that suite. They are
// behavioural — the functions are called and their output examined —
// because a string match on the source would go green again the next time
// a line moves, which is how the two drifted apart in the first place.
//
// Run: node scripts/tests/chat-context-selection.test.mjs
import { readFileSync } from "node:fs";
import { loadTs } from "./load-ts.mjs";

let pass = 0;
const failures = [];
function ok(name, cond, detail) {
  if (cond) {
    pass++;
    console.log(`  PASS  ${name}`);
  } else {
    failures.push(name);
    console.log(`  FAIL  ${name}${detail !== undefined ? `\n        ${detail}` : ""}`);
  }
}

const rel = await loadTs("src/lib/context-relevance.ts");
const mentions = await loadTs("src/lib/chat/entity-mentions.ts");
const convo = await loadTs("src/lib/chat/record-conversation-context.ts");

console.log("chat-context-selection");

// =====================================================================
console.log("\n== 1. termsOf: the same fold search uses ==");
// =====================================================================
// A second fold here is how "καφε" matches a record in search and fails to
// match the same record in context selection. termsOf goes through
// normalizeForSearch for exactly that reason, and dropping it is a
// one-line edit that looks harmless.
{
  const accented = rel.termsOf("Καφές Αθήνα");
  ok("Greek accents are folded away",
    accented.has("καφες") || accented.has("καφεσ"),
    [...accented].join(", "));
  ok("a final sigma is not a different word",
    rel.relevanceScore("καφές", "ΚΑΦΕΣ στο γραφείο") > 0,
    String(rel.relevanceScore("καφές", "ΚΑΦΕΣ στο γραφείο")));
  ok("Latin accents fold too",
    rel.relevanceScore("café", "the CAFE downstairs") > 0,
    String(rel.relevanceScore("café", "the CAFE downstairs")));

  // toLowerCase() alone folds case but NOT accents, which is precisely the
  // mutation. If this passed with either implementation the check would be
  // measuring nothing, so it is asserted against the case that separates
  // them: same letters, different accents.
  ok("case-folding alone would not be enough — accents differ, terms match",
    rel.termsOf("Καφές").size === 1 &&
      [...rel.termsOf("Καφές")][0] === [...rel.termsOf("καφες")][0],
    `${[...rel.termsOf("Καφές")]} vs ${[...rel.termsOf("καφες")]}`);

  ok("terms shorter than the minimum are dropped", !rel.termsOf("a to be").has("a"));
  ok("punctuation is a separator, not a character", rel.termsOf("alpha,beta;gamma").size === 3);
}

// =====================================================================
console.log("\n== 2. relevanceScore: asymmetric, and empty means nothing ==");
// =====================================================================
{
  // THE ASYMMETRY IS THE POINT. Scored by overlap of the two sets, a long
  // note beats a short exact one simply by being long — and a record's
  // description is routinely twenty times the length of the question.
  const question = "coffee budget";
  const exact = "coffee budget";
  const long =
    "coffee budget and also fifty other words about shipping invoices " +
    "suppliers logistics warehouses staffing rotas insurance renewals " +
    "and the annual review that nobody reads";
  ok("a short exact match scores the maximum",
    rel.relevanceScore(question, exact) === 1,
    String(rel.relevanceScore(question, exact)));
  ok("...and a long note containing the same terms does NOT beat it",
    rel.relevanceScore(question, long) <= rel.relevanceScore(question, exact),
    `long=${rel.relevanceScore(question, long)} exact=${rel.relevanceScore(question, exact)}`);
  // Under the symmetric mutation (hits / max(q.size, c.size)) the long
  // candidate's score collapses toward zero while the exact one stays 1 —
  // so the check that separates the two is that the long one still scores
  // FULL, because every question term is present in it.
  ok("...because the score is the share of the QUESTION that was covered",
    rel.relevanceScore(question, long) === 1,
    `symmetric scoring would give ${2 / rel.termsOf(long).size}`);

  ok("an empty question matches nothing, not everything",
    rel.relevanceScore("", "anything at all") === 0);
  ok("...and a question of only short words is empty too",
    rel.relevanceScore("a to be", "a to be") === 0);
  ok("an empty candidate scores zero", rel.relevanceScore("coffee", "") === 0);
  ok("a partial cover scores partially",
    rel.relevanceScore("coffee budget", "coffee only") === 0.5,
    String(rel.relevanceScore("coffee budget", "coffee only")));
}

// =====================================================================
console.log("\n== 3. selectWithinBudget: one long item must not starve the rest ==");
// =====================================================================
{
  const OPTS = { minScore: 0.1, budgetChars: 100, maxItems: 10 };
  // The over-budget item must be considered FIRST, or the mutation is
  // invisible. The loop runs in score order, so the first version of this
  // check gave the huge item only "coffee" (score 0.5) and the small one
  // "coffee budget" (score 1) — which sorted the small one to the front,
  // selected it before the budget was spent, and made `break` and
  // `continue` produce identical results. The mutation suite caught that;
  // this comment is here so it is not re-introduced.
  //
  // Both score 1 now, so the tie breaks on the caller's order and the huge
  // one is examined first. `break` there loses the small one entirely;
  // `continue` gives it its chance.
  const items = [
    { id: "huge", text: "coffee budget " + "x".repeat(200) },
    { id: "small", text: "coffee budget" },
  ];
  const sel = rel.selectWithinBudget("coffee budget", items, (i) => i.text, OPTS);
  ok("an over-budget item does not stop the loop",
    sel.selected.map((i) => i.id).join(",") === "small",
    sel.selected.map((i) => i.id).join(",") || "(nothing selected)");
  ok("...and it is counted as dropped for budget", sel.droppedForBudget === 1, String(sel.droppedForBudget));

  // THE BUDGET ITSELF. Removing `chars + cost > options.budgetChars` from
  // the condition lets everything through up to maxItems.
  const overflowing = Array.from({ length: 5 }, (_, i) => ({
    id: `i${i}`,
    text: "coffee budget " + "y".repeat(40),
  }));
  const capped = rel.selectWithinBudget("coffee budget", overflowing, (i) => i.text, OPTS);
  ok("the character budget is enforced, not just the item cap",
    capped.chars <= OPTS.budgetChars,
    `${capped.chars} chars against a ${OPTS.budgetChars} budget`);
  ok("...and it bites before maxItems does",
    capped.selected.length < overflowing.length && capped.selected.length < OPTS.maxItems,
    `${capped.selected.length} of ${overflowing.length}`);

  // The item cap, separately.
  const many = Array.from({ length: 8 }, (_, i) => ({ id: `m${i}`, text: "coffee" }));
  const byCount = rel.selectWithinBudget("coffee", many, (i) => i.text, { ...OPTS, maxItems: 3 });
  ok("maxItems is enforced", byCount.selected.length === 3, String(byCount.selected.length));

  // Deterministic: ties break on the caller's order, which is what makes a
  // token measurement reproducible.
  const tied = Array.from({ length: 4 }, (_, i) => ({ id: `t${i}`, text: "coffee budget" }));
  const first = rel.selectWithinBudget("coffee budget", tied, (i) => i.text, { ...OPTS, maxItems: 2 });
  const second = rel.selectWithinBudget("coffee budget", tied, (i) => i.text, { ...OPTS, maxItems: 2 });
  ok("ties break on the original order, every time",
    first.selected.map((i) => i.id).join(",") === "t0,t1" &&
      second.selected.map((i) => i.id).join(",") === "t0,t1",
    first.selected.map((i) => i.id).join(","));

  ok("topScore reports the best seen, selected or not", sel.topScore === 1, String(sel.topScore));
  ok("an irrelevant item is dropped for score, not for budget",
    rel.selectWithinBudget("coffee", [{ text: "unrelated shipping notes" }], (i) => i.text, OPTS)
      .droppedForScore === 1);
}

// =====================================================================
console.log("\n== 4. the mention excerpt reaches the prompt, and stays its own ==");
// =====================================================================
{
  const one = [{ moduleTitle: "Products", headline: "Product X", excerpt: "Status: done · Price: 10", linked: [] }];
  const built = mentions.buildEntityMentionPromptAddition(one);
  ok("the excerpt reaches the prompt at all",
    built.includes("Status: done"),
    JSON.stringify(built));
  // A body run together with the next bullet is how a model starts
  // attributing one record's fields to the record beneath it, so the
  // excerpt sits on its OWN indented line.
  ok("...on its own line, indented under its headline",
    /\n {4}Status: done/.test(built),
    JSON.stringify(built));

  const two = mentions.buildEntityMentionPromptAddition([
    { moduleTitle: "Products", headline: "Product X", excerpt: "Status: done", linked: [] },
    { moduleTitle: "Ideas", headline: "Idea Y", excerpt: "Status: draft", linked: [] },
  ]);
  ok("...so two records cannot share a line",
    !/Status: done.*Idea Y/.test(two),
    JSON.stringify(two));
  ok("a record with no excerpt emits no empty line",
    !/\n {4}\n/.test(mentions.buildEntityMentionPromptAddition([
      { moduleTitle: "Products", headline: "Product X", excerpt: "", linked: [] },
    ])));
  ok("no entities means no heading at all",
    mentions.buildEntityMentionPromptAddition([]) === "");
  ok("linked entities are named", built !== "" &&
    mentions.buildEntityMentionPromptAddition([
      { moduleTitle: "Products", headline: "Product X", excerpt: "", linked: [{ moduleTitle: "Ideas", headline: "Idea Y" }] },
    ]).includes("Idea Y"));
}

// =====================================================================
console.log("\n== 5. the record body does not repeat the headline ==");
// =====================================================================
{
  // The headline is already the bullet. Repeating it inside the body pays
  // for it twice in a block whose whole budget is 700 characters.
  const config = {
    headlineKey: "name",
    fields: [
      { key: "name", labelKey: "moduleData.fields.name" },
      { key: "status", labelKey: "moduleData.fields.status" },
    ],
  };
  const body = mentions.bodyOf(config, { name: "Product X", status: "done" });
  ok("the headline field is excluded from the body",
    !body.includes("Product X"),
    body);
  ok("...while the other fields are kept", body.includes("done"), body);
  ok("empty fields contribute nothing",
    !mentions.bodyOf(config, { name: "Product X", status: "" }).includes("·"),
    mentions.bodyOf(config, { name: "Product X", status: "" }));
  ok("newlines inside a value are flattened",
    !mentions.bodyOf(config, { name: "P", status: "a\nb" }).includes("\n"));
}

// =====================================================================
console.log("\n== 6. conversation turns keep their dates, and silence stays silent ==");
// =====================================================================
{
  const context = {
    turns: [
      { role: "user", excerpt: "why did we drop the March plan?", createdAt: "2026-03-14T10:00:00.000Z" },
      { role: "assistant", excerpt: "because the supplier changed terms", createdAt: "2026-03-14T10:00:05.000Z" },
    ],
    chars: 60, scanned: 10, mentioning: 2, droppedForScore: 0, droppedForBudget: 0,
  };
  const built = convo.buildRecordConversationPromptAddition(context);
  // The date is not decoration: without it the model presents a decision
  // from March as current, which is this feature's most likely failure.
  ok("every turn carries its date", (built.match(/\[2026-03-14\]/g) ?? []).length === 2, built);
  ok("...as a day, not a timestamp", !built.includes("T10:00"), built);
  ok("the two roles are distinguishable", /Ο χρήστης/.test(built) && /Εσύ/.test(built), built);

  // An empty heading invites the model to invent what should have been
  // under it, so it must not be emitted at all.
  ok("no turns means no heading",
    convo.buildRecordConversationPromptAddition({ ...context, turns: [] }) === "",
    JSON.stringify(convo.buildRecordConversationPromptAddition({ ...context, turns: [] })));
  ok("...and EMPTY_RECORD_CONVERSATION produces nothing",
    convo.buildRecordConversationPromptAddition(convo.EMPTY_RECORD_CONVERSATION) === "");
  ok("...and costs nothing",
    convo.recordConversationTokenCost(convo.EMPTY_RECORD_CONVERSATION) === 0);
  ok("a real context costs something", convo.recordConversationTokenCost(context) > 0);
}

// =====================================================================
console.log("\n== 7. the budgets are the measured ones ==");
// =====================================================================
{
  // These are not arbitrary. 0.12 is a FLOOR — mentioning the record is
  // the relevance test that matters and the question only decides order;
  // the value before it was 0.34, which returned NOTHING for the question
  // this feature was built for ("why did you do it that way?"), because
  // scoring a reply on its own drops the words the user actually typed.
  ok("the conversation floor is 0.12, not the value that returned nothing",
    convo.RECORD_CONVERSATION_RELEVANCE.minScore === 0.12,
    String(convo.RECORD_CONVERSATION_RELEVANCE.minScore));
  ok("the mention excerpt threshold is 0.34",
    mentions.MENTION_EXCERPT_RELEVANCE.minScore === 0.34,
    String(mentions.MENTION_EXCERPT_RELEVANCE.minScore));

  // A CEILING ON THE WHOLE FEATURE, in the same characters the billing path
  // counts. Raising these is the cheapest way to double a prompt nobody is
  // watching, so the numbers are pinned rather than bounded.
  ok("the mention block is capped at 700 characters and 3 items",
    mentions.MENTION_EXCERPT_RELEVANCE.budgetChars === 700 &&
      mentions.MENTION_EXCERPT_RELEVANCE.maxItems === 3,
    JSON.stringify(mentions.MENTION_EXCERPT_RELEVANCE));
  ok("the conversation block is capped at 1200 characters and 4 items",
    convo.RECORD_CONVERSATION_RELEVANCE.budgetChars === 1200 &&
      convo.RECORD_CONVERSATION_RELEVANCE.maxItems === 4,
    JSON.stringify(convo.RECORD_CONVERSATION_RELEVANCE));

  // And what that is worth, in the units the bill uses.
  const worst = rel.estimateTokens(
    mentions.MENTION_EXCERPT_RELEVANCE.budgetChars + convo.RECORD_CONVERSATION_RELEVANCE.budgetChars
  );
  console.log(`        worst case for both blocks: ${worst} tokens`);
  ok(`both blocks together cannot exceed ${worst} tokens`, worst <= 500, String(worst));
}

// =====================================================================
console.log("\n== 8. every scan is pinned to one user ==");
// =====================================================================
// NOT BEHAVIOURAL, AND SAID SO. These two queries run under the
// cookie-scoped client, so RLS is the real boundary — but `.eq("user_id",
// userId)` is the belt beside those braces, and dropping it is a one-line
// edit that changes nothing visible while a headline like "Notes" starts
// matching other accounts' rows the moment a policy is ever loosened.
// Exercising it would need a database; this file is a unit gate, so the
// claim checked here is that the filter is present, and the RLS half is
// covered by the dbtests.
{
  for (const [label, file] of [
    ["the mention scan", "src/lib/chat/entity-mentions.ts"],
    ["the conversation scan", "src/lib/chat/record-conversation-context.ts"],
  ]) {
    const src = readFileSync(file, "utf8")
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .split("\n")
      .filter((line) => !/^\s*(\/\/|\*)/.test(line))
      .join("\n");
    ok(`${label} pins user_id`, /\.eq\(\s*"user_id"\s*,\s*userId\s*\)/.test(src), file);
  }
}

console.log(
  failures.length === 0
    ? `\nALL ${pass} CHECKS PASSED`
    : `\nFAILURES: ${pass} passed, ${failures.length} failed\n  - ${failures.join("\n  - ")}`
);
process.exit(failures.length === 0 ? 0 : 1);
