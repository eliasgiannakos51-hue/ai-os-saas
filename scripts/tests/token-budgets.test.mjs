// EVERY max_tokens IN THE CODEBASE, CLASSIFIED — AND THE ONES WHOSE
// OUTPUT A PERSON READS, PROVEN TO NOTICE WHEN THEY RUN OUT.
//
// THE INVENTORY, taken rather than assumed: 34 call sites pass a
// max_tokens, and the budgets are already graded sensibly — 150 for a
// memory extraction, 300 for a classification, 8,000 for a research
// report, 128,000 for a website. That half of the brief was already
// done by convention. What was missing is that a convention nothing
// enforces drifts, so the grading is asserted here.
//
// WHAT WAS ACTUALLY BROKEN. Anthropic reports whether the model finished
// or ran out of room, in `stop_reason`. Exactly ONE of those 34 sites —
// website-builder.ts — ever read it. The other 33 joined the text blocks
// and shipped the result.
//
// The research synthesiser is the clearest case: it allows 8,000 tokens
// and validated its output with `if (markdown.length < 100)`. A report
// severed mid-sentence at the ceiling is far longer than 100 characters,
// so it passed, was written to a document, and was delivered as a
// finished report with a conclusion that does not exist.
//
// Run: node scripts/tests/token-budgets.test.mjs
import { readFileSync, readdirSync } from "node:fs";
import { loadTs } from "./load-ts.mjs";

let pass = 0;
const failures = [];
const ok = (name, cond, detail) => {
  if (cond) { pass++; console.log(`  PASS  ${name}`); }
  else { failures.push(name); console.log(`  FAIL  ${name}${detail !== undefined ? "\n        " + detail : ""}`); }
};
const list = (name, actual) => ok(name, actual.length === 0, actual.slice(0, 8).join("\n        "));

function walk(dir, out = []) {
  // SORTED. readdirSync promises no order, so an offender list built from
  // an unsorted walk comes out in a different sequence on a filesystem
  // that hands the files back differently — and a failure whose lines
  // move between machines is a failure two people cannot compare.
  // scripts/scan-order-dependence.mjs found this file by running it twice
  // with every listing reversed.
  for (const e of [...readdirSync(dir, { withFileTypes: true })].sort()) {
    const p = `${dir}/${e.name}`;
    if (e.isDirectory()) walk(p, out);
    else if (/\.tsx?$/.test(e.name)) out.push(p);
  }
  return out;
}
const SOURCES = walk("src");
const strip = (source) => source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");

// =====================================================================
console.log("== 0. the detector itself works ==");
// ASSERTED FIRST, because everything below only checks that files CALL
// modelText. Hard-coding `truncated: false` inside it left every one of
// those assertions green while the whole layer detected nothing — a
// detector nobody tests is a detector that reports what it is told to.
{
  const truncation = await loadTs("src/lib/verification/truncation.ts");
  const cut = truncation.modelText({ content: [{ type: "text", text: "The analysis shows that" }], stop_reason: "max_tokens" });
  ok("max_tokens is reported as truncated", cut.truncated === true, JSON.stringify(cut));
  const done = truncation.modelText({ content: [{ type: "text", text: "Complete." }], stop_reason: "end_turn" });
  ok("end_turn is not", done.truncated === false, JSON.stringify(done));
  ok("the text survives either way", cut.text === "The analysis shows that" && done.text === "Complete.");
  ok("a missing stop_reason is not a truncation", truncation.modelText({ content: [] }).truncated === false);
  ok("non-text blocks are skipped, not stringified",
    truncation.modelText({ content: [{ type: "tool_use" }, { type: "text", text: "x" }], stop_reason: "end_turn" }).text === "x");

  // THE SECOND DOOR, WHICH NOTHING HERE WAS OPENING.
  //
  // modelTextFrom is the entry point for the PROVIDER layer
  // (lib/ai/providers/complete.ts), which returns { text, stopReason }
  // rather than Anthropic's content blocks — so the agent runner goes
  // through this function and not through modelText. Every assertion
  // above exercised modelText only, which meant `truncated: false` could
  // be hard-coded into modelTextFrom and this whole section stayed green
  // while the agent runner emailed severed reports as finished ones. The
  // mutation suite is what found it.
  //
  // The file's own comment says these are "a second DOOR onto the same
  // rule, not a second rule". That is a claim, and this is the check.
  const fromCut = truncation.modelTextFrom({ text: "The analysis shows that", stopReason: "max_tokens" });
  ok("the provider path reports max_tokens as truncated", fromCut.truncated === true, JSON.stringify(fromCut));
  const fromDone = truncation.modelTextFrom({ text: "Complete.", stopReason: "end_turn" });
  ok("...and end_turn as finished", fromDone.truncated === false, JSON.stringify(fromDone));
  ok("...with the text intact either way",
    fromCut.text === "The analysis shows that" && fromDone.text === "Complete.");
  ok("...and a null stop reason is not a truncation",
    truncation.modelTextFrom({ text: "x", stopReason: null }).truncated === false);

  // ONE RULE, TWO DOORS: the two must agree on every stop reason, or the
  // drift the constant exists to prevent is back — one caller marking a
  // severed report and another delivering it clean.
  const disagreements = ["max_tokens", "end_turn", "stop_sequence", "tool_use", "refusal", null].filter(
    (reason) =>
      truncation.modelText({ content: [{ type: "text", text: "t" }], stop_reason: reason }).truncated !==
      truncation.modelTextFrom({ text: "t", stopReason: reason }).truncated
  );
  ok("the two entry points agree on every stop reason", disagreements.length === 0, disagreements.join(", "));

  ok("and the stop reason they compare against is the one models send",
    truncation.TRUNCATION_STOP_REASON === "max_tokens", String(truncation.TRUNCATION_STOP_REASON));
}

console.log("\n== 1. the inventory is complete and nothing is unclassified ==");
//
// THE CLASSIFICATION, by what the caller does with the answer:
//
//   deliverable — a person reads this text as the output. A cut one must
//                 be marked, so these MUST take their text through
//                 modelText().
//   structured  — the answer is parsed into JSON or a short token. A cut
//                 one fails to parse and is already handled as an error,
//                 so a truncation flag would add nothing.
//   internal    — nothing a user sees: a classification, a memory note,
//                 a security verdict.
const CLASSIFIED = {
  deliverable: [
    "src/app/api/documents/[id]/pdf/route.ts",
    "src/lib/research/research.ts",
    "src/lib/agents/agent-runner.ts",
    // Package 30: an AI box's answer is what the automation sends or
    // saves. Through modelText, and a cut one says so (readAiAnswer).
    "src/lib/automations/runner.ts",
    "src/lib/jobs/handlers/file-ask.ts",
    "src/lib/website-builder.ts",
  ],
  structured: [
    "src/lib/agents/template-fill.ts",
    "src/lib/agents/agent-builder.ts",
    // Package 30: one forced tool call returning a row of at most eight
    // boxes; a cut reply carries no complete tool_use block and is
    // refused as "unusable" by readBuilt / readChanged.
    "src/lib/automations/builder.ts",
    "src/lib/import/map-columns.ts",
    "src/lib/import/paste.ts",
    "src/lib/clarification.ts",
    "src/app/api/create-studio/detect/route.ts",
    // 128 tokens for one forced tool call whose entire answer is an id
    // from a five-item enum plus a boolean. A cut reply carries no
    // COMPLETE tool_use block, so `raw` is {}, destinationById() gets
    // undefined and the route returns `destination: null` — the same
    // no-button outcome as a confident "none". Nobody is shown a severed
    // sentence because nobody is shown a sentence.
    "src/app/api/transitions/detect/route.ts",
    // V5 #21. 8,000 tokens for one forced tool call whose answer is the
    // whole deck (~5,000 at the twenty-slide ceiling). A cut reply is
    // refused BY NAME: generate.ts reads stop_reason and returns
    // "unusable" on max_tokens rather than parsing whatever partial
    // tool_use input survived — a deck missing its last slides would
    // otherwise read as a short deck, which is the severed deliverable
    // this file exists to stop, wearing a structured shape.
    "src/lib/presentations/generate.ts",
    // V5 #22. 3,000 tokens for one forced tool call returning at most five
    // short posts (~1,300 tokens at their ceilings). Same refusal by
    // stop_reason as the deck: a cut set would parse as fewer platforms
    // than were asked for.
    "src/lib/posts/generate.ts",
    // Package 14. One forced tool call per document (or per block, or the
    // whole document rewritten); the ceiling is the caller's, and a cut
    // reply is refused by stop_reason as "unusable" in call(), as the
    // deck is — a document missing its last sections must not read as a
    // short one.
    "src/lib/documents/write-call.ts",
    // Package 28. One forced tool call per batch of a page's pieces; the
    // ceiling grows with the batch (batchMaxTokens). A list cut at
    // max_tokens is refused by stop_reason and asked once more, and if it
    // is cut again its pieces stay as they were — never a page filled
    // from a list that ends early.
    "src/lib/translate/translate-call.ts",
    // Package 26. One forced tool call per step: the plan and a box at
    // PLAN_MAX_TOKENS, the game and a change at GAME_MAX_TOKENS
    // (lib/games/game-plan.ts). A game cut at max_tokens is refused by
    // stop_reason as "unusable" — its last script would never close.
    "src/lib/games/game-call.ts",
  ],
  internal: [
    "src/lib/chat/memory.ts",
    // The per-operation ceiling TABLE Coding reads (spec.maxTokens).
    // Visible since the population stopped being spelt the SDK's way;
    // it makes no call of its own, and the call that uses it is in
    // routedUnmarked below.
    "src/lib/coding/operations.ts",
    // THROUGH THE ROUTER SINCE 2026-10-15, so it writes `maxTokens`
    // rather than `max_tokens`; 200 tokens for one forced tool call
    // whose answer is one word from a four-item enum. A cut reply
    // carries no complete tool_use block, the parse returns null, and
    // the submission is saved and emailed with no badge — which is the
    // same outcome as "unclear".
    "src/lib/lead-classification.ts",

    "src/lib/website-security-review.ts",
    "src/lib/insights/narrate.ts",
    "src/lib/reflection-agent.ts",
    "src/lib/mission-agents.ts",
    "src/lib/mission-step-runner.ts",
    "src/lib/jobs/handlers/create.ts",
    "src/app/api/chat/route.ts",
    "src/app/api/records/ask/route.ts",
    "src/app/api/text-actions/route.ts",
  ],
};

//   routedUnmarked — chooses a ceiling through runCompletion, the answer
//                 reaches a person, and NOTHING reads the stop reason.
//
// THIS LIST IS A FINDING, NOT AN EXEMPTION, and it is written down
// rather than filed under "internal" because filing it there would have
// been a sentence that is not true.
//
// HOW IT STAYED INVISIBLE. The population above was `max_tokens:`, the
// SDK's spelling. A call site that moves onto runCompletion writes
// `maxTokens:` and leaves the population entirely — so these five were
// not failing section 3, they were not being looked at. They were found
// on 2026-10-15 by widening the population for step 1.4, which moves
// twenty-nine more files the same way.
//
// WHAT IS MISSING, concretely: AiResult carries `stopReason`
// (lib/ai/providers/types.ts) and lib/verification/truncation.ts has
// modelTextFrom({ text, stopReason }) for exactly this path. None of
// the five calls it. A reply cut at the ceiling is therefore shown
// whole, with no mark, and reads as a short answer.
//
// The list is held at its size: a sixth cannot be added silently, and
// each entry is checked BOTH ways, so one that gains its stop-reason
// handling must be taken out rather than left here looking handled.
CLASSIFIED.routedUnmarked = [
  "src/app/api/coding/run/route.ts",
  "src/app/api/data-analysis/[id]/analyse/route.ts",
  "src/app/api/data-analysis/[id]/ask/route.ts",
  "src/lib/meetings/meeting-analyse-call.ts",
  "src/lib/websites-greek-spelling-check.ts",
];
{
  const ceiling = 5;
  ok(`the unmarked list has not grown (${CLASSIFIED.routedUnmarked.length} of at most ${ceiling})`,
    CLASSIFIED.routedUnmarked.length <= ceiling,
    "a sixth call site reaching a person with no truncation mark needs a decision, not a line here");
  for (const f of CLASSIFIED.routedUnmarked) {
    const src = strip(readFileSync(f, "utf8"));
    ok(`${f.split("/").pop()}: still a router call site that picks a ceiling`,
      /\brunCompletion\(/.test(src) && /maxTokens\s*:/.test(src), f);
    // BOTH WAYS. An entry that has since started reading the stop
    // reason is a sentence about a problem that is gone, and the next
    // reader believes it.
    ok(`${f.split("/").pop()}: and still does not read the stop reason`,
      !/modelTextFrom\(|stopReason/.test(src),
      `${f} now handles truncation — move it to deliverable and delete this line`);
  }
}

//   passthrough — chooses NO budget of its own. The provider adapters and
//                 the batch client hand on whatever the caller asked for,
//                 so there is nothing here to classify by outcome — and a
//                 hardcoded number in one of them WOULD be a bug: it would
//                 silently cap every caller that routes through it,
//                 including the deliverable ones above, and the cut would
//                 be invisible to modelText because the caller never asked
//                 for that ceiling. Checked below.
CLASSIFIED.passthrough = [
  "src/lib/ai/providers/adapters/anthropic.ts",
  "src/lib/ai/providers/adapters/groq.ts",
  "src/lib/ai/batch/batch-client.ts",
  // Both became visible on 2026-10-15 with the population above. The
  // batch builder hands on `spec.outputTokens`, and types.ts only
  // DECLARES the field — neither picks a number.
  "src/lib/ai/batch/agent-batch.ts",
  "src/lib/ai/providers/types.ts",
];
{
  const literal = CLASSIFIED.passthrough.filter((f) => {
    const src = strip(readFileSync(f, "utf8"));
    return /(?:max_tokens|maxTokens)\s*:\s*(\d|[A-Z_]{3,})/.test(src);
  });
  list("a passthrough never chooses a budget of its own", literal);
  // FORWARDS, OR ONLY DECLARES. Three hand the caller's ceiling to a
  // provider (`max_tokens: request.maxTokens`); the batch builder hands
  // on the spec's (`maxTokens: spec.outputTokens`); types.ts declares
  // the field and carries no call at all. All three shapes are
  // "chooses nothing of its own", and spelling the difference out is
  // what keeps a hardcoded number from hiding behind the word
  // passthrough.
  const FORWARDS = /(?:max_tokens|maxTokens)\s*:\s*[a-z][A-Za-z.]*\.?(?:maxTokens|outputTokens)/;
  const DECLARES_ONLY = /maxTokens\s*:\s*number\s*;/;
  ok("the forwarding shape is recognised", FORWARDS.test("max_tokens: request.maxTokens"));
  ok("...and the batch builder's", FORWARDS.test("maxTokens: spec.outputTokens"));
  ok("...and a hardcoded ceiling is not forwarding", !FORWARDS.test("max_tokens: 4096"));
  ok("the declaration shape is recognised", DECLARES_ONLY.test("  maxTokens: number;"));
  ok("...and a value is not a declaration", !DECLARES_ONLY.test("maxTokens: 4096,"));
  const forwards = CLASSIFIED.passthrough.filter((f) => {
    const src = strip(readFileSync(f, "utf8"));
    return FORWARDS.test(src) || DECLARES_ONLY.test(src);
  });
  ok(
    `every passthrough forwards the caller's ceiling or only declares it (${forwards.length}/${CLASSIFIED.passthrough.length})`,
    forwards.length === CLASSIFIED.passthrough.length,
    CLASSIFIED.passthrough.filter((f) => !forwards.includes(f)).join(", ")
  );
}

const KNOWN = new Set(Object.values(CLASSIFIED).flat());
// BOTH SPELLINGS, AND THE SECOND ONE IS WHY THIS GATE WAS SHRINKING.
//
// The population used to be `max_tokens:`, the SDK's spelling. A call
// site that moves onto runCompletion writes `maxTokens:` instead and
// drops straight out of it — silently, because "every classified file
// still calls one" is the only check that would notice and it reads as
// a stale ENTRY rather than a lost file. Six files had already left
// this way before anyone looked: the two data-analysis routes, Coding,
// the agents runner, the meetings summary and the Site spelling pass.
// Step 1.4 moves twenty-nine more, so the population is the CHOICE of a
// ceiling, in whichever spelling the caller uses.
const CHOOSES_A_CEILING = /(?:max_tokens|maxTokens)\s*:/;
const withBudget = SOURCES.filter((f) => CHOOSES_A_CEILING.test(strip(readFileSync(f, "utf8"))));
ok(`call sites were actually found (${withBudget.length})`, withBudget.length >= 20, String(withBudget.length));
list("every max_tokens call site is classified", withBudget.filter((f) => !KNOWN.has(f)));
list("and no classified file has stopped calling one", [...KNOWN].filter((f) => !withBudget.includes(f)));

// =====================================================================
console.log("\n== 2. the budgets are graded, not uniform ==");
{
  const values = new Map();
  for (const f of withBudget) {
    for (const m of strip(readFileSync(f, "utf8")).matchAll(/([A-Z_]*MAX_[A-Z_]*TOKENS)\s*=\s*([\d_]+)/g)) {
      values.set(`${f}:${m[1]}`, Number(m[2].replace(/_/g, "")));
    }
  }
  const all = [...values.values()];
  ok(`named budgets were found (${all.length})`, all.length >= 10, String(all.length));
  // A single number reused everywhere is the failure this half of the
  // brief is about: a chat reply and a research report do not need the
  // same room, and giving them the same is how one gets cut and the
  // other wastes.
  ok(`they span a real range (${Math.min(...all)} to ${Math.max(...all)})`, Math.max(...all) / Math.min(...all) >= 20);
  const memory = [...values].find(([k]) => k.includes("chat/memory"));
  const synthesis = [...values].find(([k]) => k.includes("SYNTHESIS"));
  ok("a memory note gets less room than a research report",
    Boolean(memory && synthesis) && memory[1] < synthesis[1], JSON.stringify({ memory, synthesis }));
}

// =====================================================================
console.log("\n== 3. a deliverable cannot be shipped severed ==");
// THE PART THAT GETS SKIPPED, and the reason this file exists.
for (const file of CLASSIFIED.deliverable) {
  const src = strip(readFileSync(file, "utf8"));
  // ONE RULE, AND IT IS CHECKED PER KIND OF CALL — which matters now
  // that a file can make both kinds. `modelText(` reads an SDK
  // response, `modelTextFrom(` reads a runCompletion outcome
  // (lib/verification/truncation.ts says why there are two), and a file
  // may also compare the stop reason itself.
  //
  // A SINGLE FILE-WIDE FLAG WAS NOT ENOUGH, and the mutation suite is
  // what said so: lib/research/research.ts makes three calls, two
  // routed and one still on the SDK, and while the SDK one kept
  // `modelText(` the whole file read as compliant — the synthesis could
  // write `truncated: false` by hand and nothing went red. Each kind of
  // call now has to show its own door.
  const makesSdkCall = /\bmessages\s*\.\s*(create|stream)\s*\(/.test(src);
  const makesRoutedCall = /\brunCompletion\s*\(/.test(src);
  ok(`${file.split("/").pop()} makes a model call this check can see`, makesSdkCall || makesRoutedCall, file);
  if (makesSdkCall) {
    ok(`${file.split("/").pop()} reads the stop reason of its SDK call`,
      /\bmodelText\(/.test(src) || /stop_reason/.test(src), file);
  }
  if (makesRoutedCall) {
    ok(`${file.split("/").pop()} reads the stop reason of its routed call`,
      /\bmodelTextFrom\(/.test(src) || /AI_TRUNCATED_STOP_REASON/.test(src), file);
  }
  // AND DOES NOT ALSO HAND-ROLL THE EXTRACTION. A file that calls
  // modelText for one response and joins the blocks itself for another
  // has a hole exactly the size of the second call.
  // ANY PARAMETER NAME, AND ACROSS THE PARENTHESES INSIDE THE PREDICATE.
  // Two versions of this missed. The first was pinned to `block`, so an
  // extraction written with `b` walked past. The second used `[^)]*`,
  // which stops at the FIRST `)` — and `filter((b): b is X => ...)` puts
  // one immediately after the parameter, so the character class ended
  // before reaching the thing it was looking for. An extraction is one
  // statement, so the bound is the semicolon.
  const handRolled = /\.filter\([^;]{0,200}?\btype === "text"/.test(src);
  ok(`${file.split("/").pop()} has no hand-rolled extraction left`, !handRolled || /stop_reason/.test(src), file);
}

// =====================================================================
console.log("\n== 4. the notice reaches the reader, in their language ==");
{
  const truncation = await loadTs("src/lib/verification/truncation.ts");
  const LOCALES = [...readdirSync("messages")].sort().filter((f) => f.endsWith(".json")).map((f) => f.replace(".json", ""));
  ok(`locales found (${LOCALES.length})`, LOCALES.length >= 9);
  for (const loc of LOCALES) {
    const notice = truncation.truncationNotice(loc);
    ok(`${loc}: has its own notice`, notice !== truncation.truncationNotice("en") || loc === "en", notice);
  }
  // An unknown locale falls back rather than throwing or returning empty.
  ok("an unknown locale falls back to English", truncation.truncationNotice("xx") === truncation.truncationNotice("en"));
  // EVERY LOCALE, NOT ANY. This concatenated en + el and matched the
  // pair, so rewriting the English one to "Output complete." still passed
  // on the Greek. A notice that lies in one language lies to everyone who
  // reads that language.
  const UNFINISHED = {
    en: /not finished/i, el: /δεν είναι ολοκληρωμένο/, de: /nicht vollständig/,
    es: /no está terminada/, fr: /n’est pas terminée/, it: /non è completo/,
    pt: /não está concluída/, ar: /غير مكتمل/, ja: /未完成/, zh: /尚未完成/,
  };
  for (const [loc, re] of Object.entries(UNFINISHED)) {
    ok(`${loc}: the notice says the output is unfinished`, re.test(truncation.truncationNotice(loc)), truncation.truncationNotice(loc));
  }
}

// =====================================================================
console.log("\n== 5. it is in the path, on every deliverable ==");
{
  const research = readFileSync("src/lib/research/run-research.ts", "utf8");
  ok("research appends the notice", /truncationNotice\(language\)/.test(research));
  // ON WHAT CONDITION. Replacing `synthesis.truncated` with `false` left
  // the notice in the file, the variable in the file, and this gate
  // green — while nothing could ever append it.
  ok("...gated on the synthesis's own truncation flag",
    /const reportMarkdown = synthesis\.truncated/.test(research));
  ok("...and logged when it fires", /stage: "truncation"/.test(research));
  ok("...to the markdown that is actually rendered", /reportMarkdown/.test(research));
  const agent = readFileSync("src/lib/agents/execute-agent.ts", "utf8");
  ok("an agent result carries it too", /truncationNotice\(agentConfig\.language\)/.test(agent));
  ok("...on the output that is delivered, not a copy", /outcome\.truncated/.test(agent));
  const fileAsk = readFileSync("src/lib/jobs/handlers/file-ask.ts", "utf8");
  ok("file-ask marks a cut answer", /hitTokenCeiling/.test(fileAsk));
  ok("...from a flag its three call paths all set", (fileAsk.match(/hitTokenCeiling/g) ?? []).length >= 3, fileAsk.match(/hitTokenCeiling/g)?.length);
}

console.log(`\n${pass} passed, ${failures.length} failed`);
process.exit(failures.length === 0 ? 0 : 1);
