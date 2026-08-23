// Cross-module context: the gate, the two directions, and the cost.
//
// WHAT THIS IS GUARDING. The brief asked for chat and the Coding module to
// see each other, with only the RELEVANT material crossing and the token
// cost measured. Three things can go wrong and only one of them is visible
// without a test:
//
//   1. the gate lets everything through — the feature "works" and the
//      prompt doubles;
//   2. the gate lets nothing through — the feature is invisible, costs
//      nothing, and every test that only checks "did it stay cheap" passes;
//   3. the gate lets the wrong half through. This one actually happened:
//      scoring each conversation turn on its own against the question
//      dropped the assistant's reply, because an ANSWER does not repeat the
//      words of the QUESTION. "Why did you do it that way?" returned
//      nothing at all — the exact question the feature was built for.
//
// (2) and (3) are why the assertions below are two-sided: every "stays
// under budget" has a "and still selected the thing it was for".
// loadTs, NOT loadTsWithDeps. billing-coverage.test.mjs forbids the deps
// loader in any *.test.mjs, because that mode writes a bundle into
// node_modules and a build gate must not. Plain loadTs reaches these
// modules only because the loader now emits JSON dependencies as bindings
// — lib/module-labels.ts imports messages/en.json for the English field
// labels, and before that fix nothing downstream of it could be loaded at
// all, in either mode.
import { loadTs } from "./load-ts.mjs";

let pass = 0,
  fail = 0;
function ok(name, cond, detail) {
  if (cond) {
    pass++;
    console.log(`  PASS  ${name}`);
  } else {
    fail++;
    console.log(`  FAIL  ${name}${detail ? `\n        ${detail}` : ""}`);
  }
}
function eq(name, actual, expected) {
  ok(name, JSON.stringify(actual) === JSON.stringify(expected), `expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
}

const rel = await loadTs("src/lib/context-relevance.ts");
const mentions = await loadTs("src/lib/chat/entity-mentions.ts");
const convo = await loadTs("src/lib/chat/record-conversation-context.ts");
const build = await loadTs("src/lib/build-modules.ts");

// =====================================================================
console.log("\n== The gate itself ==");

eq("an empty query is relevant to nothing", rel.relevanceScore("", "anything at all here"), 0);
eq("an empty candidate matches nothing", rel.relevanceScore("margin calculator", ""), 0);
ok(
  "scoring is asymmetric — coverage of the QUERY, not overlap",
  rel.relevanceScore("margin", "margin calculator for gross profit and cost") === 1 &&
    rel.relevanceScore("margin calculator for gross profit and cost", "margin") < 1,
  "a long candidate must not beat a short exact one just by being long"
);
ok(
  "matching is accent- and case-folded, like the rest of the app",
  rel.relevanceScore("ΚΑΦΕΣ", "ο καφές είναι έτοιμος") === 1,
  "Greek final sigma and accents must fold, or context selection disagrees with search"
);
eq("terms under 3 characters are not terms", [...rel.termsOf("a be tre τεσσερα")].sort(), ["tre", "τεσσερα"]);

// =====================================================================
console.log("\n== Budget behaviour ==");
{
  const items = [
    { id: "long", text: "margin ".repeat(40) },
    { id: "short", text: "margin cost" },
  ];
  const sel = rel.selectWithinBudget("margin", items, (i) => i.text, {
    minScore: 0.1,
    budgetChars: 40,
    maxItems: 10,
  });
  // THE LONG ONE SCORES HIGHER AND DOES NOT FIT. If the loop stopped at the
  // first over-budget item, the short one behind it would be lost too —
  // one long note starving everything after it.
  eq("an over-budget item does not starve the ones behind it", sel.selected.map((i) => i.id), ["short"]);
  ok("the budget is not exceeded", sel.chars <= 40, `${sel.chars} chars against a 40 budget`);
  eq("and the skip is reported, not silent", sel.droppedForBudget, 1);
}
{
  const items = [{ t: "alpha beta" }, { t: "alpha beta" }, { t: "alpha beta" }];
  const a = rel.selectWithinBudget("alpha", items, (i) => i.t, { minScore: 0.1, budgetChars: 999, maxItems: 2 });
  const b = rel.selectWithinBudget("alpha", items, (i) => i.t, { minScore: 0.1, budgetChars: 999, maxItems: 2 });
  eq("ties break on input order, so the same request costs the same twice", a.selected.length, 2);
  ok("selection is deterministic", JSON.stringify(a.selected) === JSON.stringify(b.selected));
}
{
  const sel = rel.selectWithinBudget("completely unrelated words", [{ t: "margin cost price" }], (i) => i.t, {
    minScore: 0.34,
    budgetChars: 999,
    maxItems: 5,
  });
  eq("irrelevant material is dropped for score, not for budget", [sel.droppedForScore, sel.droppedForBudget], [1, 0]);
}

// =====================================================================
console.log("\n== (α) chat sees the record's substance, not just its title ==");
// EVERY LINKABLE MODULE, not one hand-picked example.
//
// This section used to reach for BUILD_MODULES' "coding" entry as its
// sample. That entry no longer exists — the multi-page work turned the
// coding TRACKER into a real tool with its own table (code_sessions,
// read by lib/ai/cross-module-store.ts), so the registry row went away
// while the property it was standing in for did not. Rather than swap in
// another arbitrary module and wait for the same thing to happen again,
// the claim is now made against bodyOf's ACTUAL domain: every config in
// LINKABLE_MODULES, with a row synthesised from that module's own field
// list. Strictly more assertions than before, and nothing left to rename.
const graph = await loadTs("src/lib/knowledge-graph.ts");
const LINKABLE = graph.LINKABLE_MODULES;
ok(`LINKABLE_MODULES is populated (${LINKABLE.length})`, LINKABLE.length > 0);

let bodyFailures = [];
for (const config of LINKABLE) {
  // A value per field, distinctive enough that finding it in the body
  // cannot be a coincidence.
  const row = { id: "r1" };
  for (const field of config.fields) {
    row[field.key] = field.key === config.headlineKey ? "HEADLINE_VALUE" : `VALUE_${field.key}_ΜΗΔΕΝΙΚΟ`;
  }
  const b = mentions.bodyOf(config, row);
  for (const field of config.fields) {
    if (field.key === config.headlineKey) continue;
    if (!b.includes(`VALUE_${field.key}_ΜΗΔΕΝΙΚΟ`)) {
      bodyFailures.push(`${config.slug}: body dropped ${field.key}`);
    }
  }
  if (b.includes("HEADLINE_VALUE")) bodyFailures.push(`${config.slug}: body repeats the headline`);
  // The labels are the shared helper's, not a second copy: every line is
  // "Label: value", and the label is not the raw key.
  for (const line of b.split(" · ")) {
    const label = line.split(":")[0];
    if (!label || /^[a-z_]+$/.test(label)) bodyFailures.push(`${config.slug}: raw key as label (${label})`);
  }
}
ok(
  `every field of every linkable module reaches the body, and the headline never does (${LINKABLE.length} modules)`,
  bodyFailures.length === 0,
  bodyFailures.slice(0, 6).join("; ")
);

// An empty field is omitted rather than printed as "Label: ".
{
  const config = LINKABLE[0];
  const sparse = { id: "r1", [config.headlineKey]: "H" };
  const b = mentions.bodyOf(config, sparse);
  ok("a row with nothing but a headline has an empty body", b === "", `body was: ${JSON.stringify(b)}`);
  const oneField = config.fields.find((f) => f.key !== config.headlineKey);
  if (oneField) {
    const b2 = mentions.bodyOf(config, { ...sparse, [oneField.key]: "" });
    ok("an empty value is omitted, not printed as a bare label", b2 === "", `body was: ${JSON.stringify(b2)}`);
  }
}

// The original sample, kept as a concrete case beside the general one:
// a real record with Greek prose and a language field.
// A module whose `description` is NOT its own headline — finance's IS
// (headlineKey: "description"), so picking it would leave bodyOf
// correctly empty and the assertion would fail for the wrong reason.
const SAMPLE = LINKABLE.find(
  (m) => m.headlineKey !== "description" && m.fields.some((f) => f.key === "description")
);
ok("a module with a non-headline description exists to sample", Boolean(SAMPLE), LINKABLE.map((m) => m.slug).join(", "));
const ROW = { id: "r1", [SAMPLE.headlineKey]: "Margin calculator", description: "function που επιστρέφει gross margin, με έλεγχο για μηδενικό κόστος" };
const body = mentions.bodyOf(SAMPLE, ROW);
ok("the body carries the fields the headline does not", body.includes("μηδενικό κόστος"), `body was: ${body}`);
ok("and does not repeat the headline", !body.includes("Margin calculator"), `body was: ${body}`);
ok(
  "field labels come from the shared helper, not a second copy",
  /Description/i.test(body),
  `expected the real en.json label; body was: ${body}`
);

{
  const withExcerpt = mentions.buildEntityMentionPromptAddition([
    { moduleTitle: "AI Coding", headline: "Margin calculator", linked: [], excerpt: body },
  ]);
  const without = mentions.buildEntityMentionPromptAddition([
    { moduleTitle: "AI Coding", headline: "Margin calculator", linked: [], excerpt: "" },
  ]);
  ok("the excerpt reaches the prompt", withExcerpt.includes("μηδενικό κόστος"));
  ok("the headline-only form still works", without.includes("Margin calculator") && !without.includes("μηδενικό"));
  ok(
    "the body is indented under its own headline",
    /Margin calculator\n {4}/.test(withExcerpt),
    "run together with the next bullet, a model attributes one record's fields to another"
  );
  ok("no entities means no heading at all", mentions.buildEntityMentionPromptAddition([]) === "");
}

// =====================================================================
console.log("\n== (β) a question and its answer travel together ==");
// THE REGRESSION TEST FOR THE BUG THIS FEATURE SHIPPED WITH INTERNALLY.
// The reply holds the reasoning and shares almost no vocabulary with the
// question; scored alone it is dropped, and the endpoint learns nothing.
const QUESTION = "Γιατί το έκανες έτσι με το μηδενικό κόστος;";
const USER_TURN = "Για το Margin calculator — αν το κόστος είναι 0 τι πρέπει να γυρνάει;";
const ANSWER_TURN = "Πρότεινα να επιστρέφει null αντί για Infinity, ώστε ο caller να αποφασίσει.";

ok(
  "scored alone, the answer would not clear the floor",
  rel.relevanceScore(QUESTION, ANSWER_TURN) < convo.RECORD_CONVERSATION_RELEVANCE.minScore,
  `the answer scores ${rel.relevanceScore(QUESTION, ANSWER_TURN).toFixed(2)} — if this ever clears the floor on its own, this test has stopped proving anything`
);
{
  const paired = rel.selectWithinBudget(
    QUESTION,
    [{ turns: ["u", "a"], text: `${USER_TURN} ${ANSWER_TURN}` }],
    (g) => g.text,
    convo.RECORD_CONVERSATION_RELEVANCE
  );
  eq("paired with the question it asked, the answer survives", paired.selected.length, 1);
}
{
  const addition = convo.buildRecordConversationPromptAddition({
    turns: [
      { role: "user", excerpt: USER_TURN, createdAt: "2026-08-14T09:12:00Z" },
      { role: "assistant", excerpt: ANSWER_TURN, createdAt: "2026-08-14T09:13:00Z" },
    ],
    chars: 0, scanned: 0, mentioning: 0, droppedForScore: 0, droppedForBudget: 0,
  });
  ok("the reasoning reaches the prompt", addition.includes("null αντί για Infinity"));
  ok("each turn is dated", /\[2026-08-14\]/.test(addition),
    "without a date the model presents a decision from months ago as current");
  ok("the record's own content is named as the current truth", addition.includes("τωρινό"));
  ok("nothing relevant means no heading", convo.buildRecordConversationPromptAddition(convo.EMPTY_RECORD_CONVERSATION) === "");
}

// =====================================================================
console.log("\n== The cost, in the units the bill uses ==");
eq("tokens are estimated the way lib/billing/estimate.ts does", rel.CHARS_PER_TOKEN, 4);
eq("400 characters is 100 tokens", rel.estimateTokens(400), 100);
{
  const conduct = await loadTs("src/lib/ai-conduct.ts");
  const checklist = await loadTs("src/lib/ai-quality-checklist.ts");
  const basePrompt = conduct.AI_CONDUCT_EL.length + checklist.AI_QUALITY_CHECKLIST_EL.length;
  const worstCase = mentions.MENTION_EXCERPT_RELEVANCE.budgetChars + convo.RECORD_CONVERSATION_RELEVANCE.budgetChars;
  const growth = worstCase / basePrompt;
  // The instruction was "narrow the criterion if it doubles the context".
  // Asserted against the real blocks every call already carries, not
  // against the fragment, because the fragment is not what gets sent.
  ok(
    `both gates at full budget grow the prompt by ${(growth * 100).toFixed(1)}% (ceiling 50%)`,
    growth < 0.5,
    `${worstCase} chars of context against a ${basePrompt}-char base is ${(growth * 100).toFixed(0)}% — the budgets need narrowing`
  );
}

// =====================================================================
console.log("\n== Tenancy ==");
// Not a leak being closed — every one of these tables carries a
// `select_own_*` RLS policy on auth.uid() = user_id, and this runs under
// the cookie-scoped client. It is the convention lib/user-context.ts
// states for its own scan, and the reason it gives: the same query shape
// runs under the service-role client in job handlers, where RLS does not
// apply. A scan that takes userId and does not use it is one copy-paste
// from being wrong, and this is the copy-paste that would do it.
{
  const { readFileSync } = await import("node:fs");
  for (const [file, fn] of [
    ["src/lib/chat/entity-mentions.ts", "findMentionedEntities"],
    ["src/lib/chat/record-conversation-context.ts", "loadRecordConversationContext"],
    ["src/lib/user-context.ts", "scanModule"],
  ]) {
    const src = readFileSync(file, "utf8");
    const selects = (src.match(/\.from\(/g) || []).length;
    const scoped = (src.match(/\.eq\("user_id", userId\)/g) || []).length;
    ok(
      `${fn} scopes every table read to the user explicitly (${scoped}/${selects} .from() calls)`,
      selects > 0 && scoped > 0,
      `${file} reads ${selects} table(s) and pins user_id ${scoped} time(s)`
    );
  }
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
