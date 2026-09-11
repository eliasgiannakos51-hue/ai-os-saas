#!/usr/bin/env node
/*
 * THE VERDICT LEAVES THE FUNCTION, AND REACHES A ROW.
 *
 * V5 #6 shipped two thirds: a free ambiguity reader and a one-question
 * cap. The third — how often it is right — could not be built, and the
 * reason was one line: assessAmbiguity's answer was used to decide
 * whether to spend and then DROPPED. Every request that left a cost-log
 * row was, by construction, one the free reader had failed to decide, so
 * the only measurable rate was 100%.
 *
 * WHAT THIS FILE HOLDS:
 *
 *   1. checkNeedsClarification returns the verdict, on every path
 *      including the two that fail open.
 *   2. Every surface that runs the check writes it into its settlement,
 *      through ONE builder rather than five hand-typed literals — a
 *      report that has to union `clarification_verdict` with
 *      `clarificationVerdict` is a report nobody trusts.
 *   3. The `clear` path, which costs nothing, still leaves a row. It is
 *      the common case and it was the invisible one; a ratio with no
 *      denominator is not a ratio.
 *   4. Chat stops BEFORE the reservation. A question that arrives after
 *      credits are held is a question that cost money to ask.
 *
 * Run: node scripts/tests/clarification-verdict.test.mjs
 */
import { readFileSync } from "node:fs";
import { loadTs } from "./load-ts.mjs";

let pass = 0;
const failures = [];
function check(name, cond, detail) {
  if (cond) {
    pass++;
    console.log(`  PASS  ${name}`);
  } else {
    failures.push(name);
    console.log(`  FAIL  ${name}${detail !== undefined ? `\n        ${detail}` : ""}`);
  }
}

const clarificationSrc = readFileSync("src/lib/clarification.ts", "utf8");
const client = await loadTs("src/lib/clarification-client.ts");
const ambiguity = await loadTs("src/lib/ai/ambiguity.ts");

// ---------------------------------------------------------------------
console.log("== 1. one spending policy, in one place ==");
{
  // THE FUNCTION THIS REPLACED SAID SOMETHING FALSE. needsPaidClarityCheck
  // was exported, tested three ways, called by nothing, and documented a
  // rule the product did not follow: it said only `unsure` pays, while
  // checkNeedsClarification paid for `vague` too.
  // READ AS CODE, NOT AS PROSE. ambiguity.ts's comment NAMES the deleted
  // function in order to record why it went, and a check that greps the
  // whole file fails it for explaining itself — the same mistake
  // scripts/tests/check-site-spelling.test.mjs made two rounds ago and
  // scripts/tests/rtl.test.mjs made in a CSS parser before that.
  const ambiguityCode = readFileSync("src/lib/ai/ambiguity.ts", "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .split("\n")
    .filter((l) => !/^\s*\/\//.test(l))
    .join("\n");
  check("the old, wrong helper is gone", !/needsPaidClarityCheck/.test(ambiguityCode));
  const clear = ambiguity.assessAmbiguity("a taverna in Thessaloniki with a menu and opening hours");
  const vague = ambiguity.assessAmbiguity("κάνε το");
  check("a clear request is clear", clear.verdict === "clear", clear.verdict);
  check("a bare command is not", vague.verdict !== "clear", vague.verdict);
  check("clear does not reach the paid call", !ambiguity.willSpendOnQuestion(clear));
  check("anything else does", ambiguity.willSpendOnQuestion(vague));
  check(
    "and clarification.ts asks rather than restating the condition",
    /if \(!willSpendOnQuestion\(assessment\)\)/.test(clarificationSrc),
    "a second copy of `verdict === \"clear\"` is how the two drift apart"
  );
}

// ---------------------------------------------------------------------
console.log("\n== 2. the verdict comes back on every path ==");
{
  // FOUR RETURNS, and the two that matter most are the ones that fail
  // open: a malformed tool response and a free short-circuit both used to
  // return a bare `{ needsClarification: false }`, which is exactly the
  // shape a `clear` verdict has — so a broken paid call would have been
  // counted as a request the free reader decided.
  // A WIDE ENOUGH WINDOW. The first draft took 220 characters after
  // `return {`, which cut the spread return in half before it reached its
  // verdict line and reported the code as missing a key it has. A check
  // that truncates its own subject measures its own regex.
  const returns = [...clarificationSrc.matchAll(/return \{[\s\S]{0,600}?\};/g)].map((m) => m[0]);
  const decisions = returns.filter((r) => /needsClarification/.test(r));
  check(`every decision return carries a verdict (${decisions.length})`, decisions.length >= 3);
  check(
    "...including all of them",
    decisions.every((r) => /verdict:/.test(r)),
    decisions.filter((r) => !/verdict:/.test(r)).join("\n        ")
  );
  check(
    "...and says whether it paid",
    decisions.every((r) => /paidCheck:/.test(r)),
    decisions.filter((r) => !/paidCheck:/.test(r)).join("\n        ")
  );
  check(
    "the free short-circuit reports paidCheck false",
    /verdict: assessment\.verdict, paidCheck: false/.test(clarificationSrc)
  );
  check(
    "a malformed tool response reports paidCheck TRUE — the call still happened",
    /if \(!toolUse\) return \{ needsClarification: false, verdict: assessment\.verdict, paidCheck: true \}/.test(
      clarificationSrc
    )
  );
}

// ---------------------------------------------------------------------
console.log("\n== 3. one builder, three keys, five surfaces ==");
{
  const meta = client.clarificationMetadata({ needsClarification: true, questions: ["q"], suggestions: [[]], verdict: "vague", paidCheck: true });
  check("the builder names the three keys", JSON.stringify(Object.keys(meta).sort()) ===
    JSON.stringify(["clarification_asked", "clarification_paid", "clarification_verdict"]), JSON.stringify(meta));
  check("asked is the decision, not the verdict", meta.clarification_asked === true);
  const quiet = client.clarificationMetadata({ needsClarification: false, verdict: "unsure", paidCheck: true });
  check(
    "a paid check that asked nothing is paid and not asked",
    quiet.clarification_paid === true && quiet.clarification_asked === false,
    JSON.stringify(quiet)
  );

  // EVERY SURFACE, THROUGH THE BUILDER. A hand-typed literal in one of
  // them is a key the per-day query will not find.
  const SURFACES = [
    ["src/app/api/websites/generate/route.ts", "website"],
    ["src/app/api/automations/create/route.ts", "automation"],
    ["src/lib/jobs/handlers/agent-build.ts", "agent"],
    ["src/lib/jobs/handlers/create.ts", "create"],
    ["src/app/api/chat/route.ts", "chat"],
  ];
  for (const [file, kind] of SURFACES) {
    const src = readFileSync(file, "utf8");
    check(`${kind}: runs the check`, /checkNeedsClarification\(/.test(src));
    check(`${kind}: records it through clarificationMetadata`, /clarificationMetadata\(/.test(src), file);
    check(
      `${kind}: writes no hand-typed verdict key`,
      !/clarification_verdict\s*:/.test(src),
      "a literal here is a key the query will miss"
    );
  }
}

// ---------------------------------------------------------------------
console.log("\n== 4. the cheap path still leaves a row ==");
{
  const site = readFileSync("src/app/api/websites/generate/route.ts", "utf8");
  // THE DENOMINATOR. A `clear` verdict spends nothing, and settlePrechecks
  // returns early on nothing spent — so before this exception every row
  // in the log was a request the free reader had failed on.
  check(
    "a verdict is settled even when nothing was spent",
    /const hasVerdict = typeof extra\.clarification_verdict === "string";\s*\n\s*if \(costs\.callCount === 0 && !hasVerdict\) return;/.test(site)
  );
  check(
    "...under its own feature name, so it is its own row in the margin report",
    /feature: costs\.callCount === 0 \? "clarification_free" : "website_generate_precheck"/.test(site)
  );
  check("the clear path reaches a settlement at all", /await settlePrechecks\(clarificationRecord\)/.test(site));
  check(
    "an unasked check records nothing rather than 'clear'",
    /let clarificationRecord: Record<string, unknown> = \{\};/.test(site),
    "an absent key is 'not asked'; writing 'clear' there would be inventing a decision"
  );
}

// ---------------------------------------------------------------------
console.log("\n== 5. chat stops before it holds anything ==");
{
  const chat = readFileSync("src/app/api/chat/route.ts", "utf8");
  const checkAt = chat.indexOf("checkNeedsClarification(apiKey, \"chat\"");
  const reserveAt = chat.indexOf("await reserveCredits(");
  check("chat runs the check", checkAt > 0);
  check("chat reserves credits somewhere", reserveAt > 0);
  // THE ORDER IS THE FEATURE. A question asked after the hold is a
  // question that cost the person credits to be asked.
  check("the check happens BEFORE the reservation", checkAt > 0 && reserveAt > 0 && checkAt < reserveAt,
    `check at ${checkAt}, reserve at ${reserveAt}`);
  check(
    "only the opening message is ever interrupted",
    /history\.length === 0 && !isFreeMessage && !skipClarification/.test(chat),
    "a conversation with history is a conversation, and interrupting the fourth message is worse than a generic answer"
  );
  check("the question goes out as its own frame", /type: "clarify"/.test(chat));
  check("...and the stream closes rather than answering too", /controller\.close\(\);\s*\n\s*return;/.test(chat));
  check(
    "the pre-check's own tokens are settled under their own feature",
    /feature: "chat_clarify"/.test(chat)
  );
  check("a hiccup in the check never blocks an answer", /stage: "clarification_check"/.test(chat));
  check("chat has a cap of its own, with a reason", client.CLARIFICATION_QUESTION_CAP.chat === 1);

  // AND THE CLIENT RENDERS IT. A frame nothing reads is a feature that
  // exists in a log file.
  const ui = readFileSync("src/components/chat/chat-workspace.tsx", "utf8");
  check("the workspace handles the frame", /event\.type === "clarify"/.test(ui));
  check("...and renders the shared question component", /<ClarificationQuestions/.test(ui));
  check(
    "skip resends with the check turned off",
    /handleSend\(clarify\.text, \{ skipClarification: true \}\)/.test(ui),
    "without the flag the same text meets the same question for ever"
  );
  check("answering resends the original with the answers appended", /appendClarificationAnswers\(clarify\.text/.test(ui));
  for (const locale of ["en", "el", "zh", "ar"]) {
    const m = JSON.parse(readFileSync(`messages/${locale}.json`, "utf8"));
    check(
      `${locale}: the chat question has its own words`,
      typeof m.dashboard.chat.clarificationTitle === "string" && m.dashboard.chat.clarificationTitle.length > 3
    );
  }
}

console.log(`\n${failures.length === 0 ? "ALL PASS" : "FAILED"}: ${pass} passed, ${failures.length} failed`);
if (failures.length) {
  for (const f of failures) console.log(`  - ${f}`);
  process.exit(1);
}
