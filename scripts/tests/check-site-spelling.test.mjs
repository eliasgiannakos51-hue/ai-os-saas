#!/usr/bin/env node
/*
 * THE RUNNER THAT POINTS THE SPELLING CHECKER AT A REAL SITE, and the
 * three ways a runner like it is normally worthless.
 *
 * scripts/check-site-spelling.mjs exists because lib/websites-greek-
 * spelling-check.ts has one caller — the end of a website generation — so
 * "does it work on the site I already have?" had no answer that did not
 * cost a whole build. A runner answers it. A runner that has drifted
 * answers a DIFFERENT question and says nothing about that:
 *
 *   1. A RETYPED PROMPT. The runner sends its own copy of the system
 *      message, somebody edits the shipped one, and from then on the
 *      report describes an instruction the product does not give.
 *   2. A HARDCODED MODEL. Same shape, worse: the report carries a price
 *      per MTok, and it is the price of a model nobody is being served.
 *   3. A REBUILT WORD LIST. The one promise this feature rests on is that
 *      the owner's own village never goes to a model. A runner that
 *      selects words its own way can break that promise while every test
 *      of the shipped selector stays green.
 *
 * All three are the same shape — docs/shapes.md calls it a copy that
 * passes forever while the original moves — and all three are checked
 * here by DOCTORING the source and requiring the runner's output to move
 * with it. A check that merely reads the current value would pass against
 * a hardcoded copy that happens to agree today.
 *
 * Run: node scripts/tests/check-site-spelling.test.mjs
 */
import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { cleanEnv } from "./lib/clean-env.mjs";
import { loadTs } from "./load-ts.mjs";
import {
  systemPromptFromSource,
  shippedModel,
  unnamedDefaultModel,
  costOf,
  parseArgs,
  requestBody,
  auditWords,
} from "../check-site-spelling.mjs";

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

const RUNNER = "scripts/check-site-spelling.mjs";
const CHECKER = "src/lib/websites-greek-spelling-check.ts";
const runnerSrc = readFileSync(RUNNER, "utf8");
// THE CODE, WITHOUT THE COMMENTS, and the distinction is not pedantry.
//
// The checks below ask whether the runner CARRIES a copy of a rule — a
// model id, a Greek character class, a sentence of the prompt. Its
// comments necessarily quote all three, because they explain what the
// runner refuses to hardcode and why. Reading them as code fails the file
// for saying what it does. scripts/tests/rtl.test.mjs made exactly this
// mistake in a CSS parser three rounds ago and flagged the block that
// listed the icons it deliberately does NOT mirror.
const runnerCode = runnerSrc
  .replace(/\/\*[\s\S]*?\*\//g, " ")
  .split("\n")
  .filter((l) => !/^\s*\/\//.test(l))
  .join("\n");
const checkerSrc = readFileSync(CHECKER, "utf8");
const pure = await loadTs("src/lib/website-greek-spelling.ts");
const catalog = await loadTs("src/lib/ai/providers/catalog.ts");
const { foldForMatch: fold } = await loadTs("src/lib/text/unicode-patterns.ts");

// A page built the way a generated Greek site is: a wordmark in capitals,
// the owner's own name in the nominative AND in the genitive, two real
// misspellings, and a loanword.
const BRIEF = "Ζαχαροπλαστείο Παπαδόπουλος στο Χαλάνδρι. Παραδοσιακά γλυκά.";
const PAGE = `<!doctype html><html><head><style>.a{color:red}</style>
<script>var t = "ρεύματοςscript";</script></head><body>
<h1>ΖΑΧΑΡΟΠΛΑΣΤΕΙΟ ΠΑΠΑΔΟΠΟΥΛΟΣ</h1>
<p>Στην καρδιά του Χαλανδρίου, το εργαστήριο του Παπαδόπουλου φτιάχνει γλυκά.</p>
<p>Λειτουργούμε με πράσινο ρεμπα και βιολογικά υλλικά.</p>
<p>Το catering μας καλύπτει γάμους και βαπτίσεις.</p>
<footer>Λεωφόρος Πεντέλης 42, Χαλάνδρι</footer></body></html>`;

// ---------------------------------------------------------------------
console.log("== 1. the prompt is READ from the shipped file, not retyped ==");
{
  const prompt = systemPromptFromSource(checkerSrc);
  check("a prompt is produced at all", prompt.length > 50, `${prompt.length} chars`);
  // EVERY LINE OF IT IS IN THE SHIPPED FILE, checked the other way round:
  // the parse could drop a line and still produce a plausible prompt.
  const lines = prompt.split(". ").filter((l) => l.length > 10);
  check(
    "every sentence of the prompt appears verbatim in the checker source",
    lines.every((l) => checkerSrc.includes(l.replace(/\.$/, ""))),
    lines.filter((l) => !checkerSrc.includes(l.replace(/\.$/, ""))).join(" | ")
  );
  // THE PROPERTY THAT MATTERS: it MOVES with the source. A hardcoded copy
  // would pass the check above on the day it was written.
  const doctored = checkerSrc.replace(
    '"If every word is correct, reply with [].",',
    '"If every word is correct, reply with nothing at all.",'
  );
  check("the doctored source actually differs", doctored !== checkerSrc);
  check(
    "editing the shipped prompt changes what the runner would send",
    systemPromptFromSource(doctored).includes("nothing at all") &&
      !systemPromptFromSource(doctored).includes("reply with [].")
  );
  // AND IT REFUSES rather than falling back to a copy of its own.
  let threw = null;
  try {
    systemPromptFromSource("const SYSTEM = buildPrompt();");
  } catch (e) {
    threw = e.message;
  }
  check("a prompt it cannot read is a refusal, not a fallback", threw !== null && /REFUSING/.test(threw), String(threw));
  // NO COPY IN THE RUNNER. If one were ever pasted in, the checks above
  // would still pass while the pasted one was what actually got sent.
  check(
    "the runner file contains no sentence of the prompt",
    !runnerCode.includes("Reply with a JSON array") && !runnerCode.includes("is NOT misspelled")
  );
}

// ---------------------------------------------------------------------
console.log("\n== 2. the model is read from the shipped file too ==");
{
  // THE FINDING THIS CLAUSE PROTECTS. Until 2026-09-07 the call named no
  // model, so complete.ts read it as tier "mid" and served sonnet — 3x
  // the price of the haiku that "one cheap classification call" sounds
  // like, and the only runCompletion caller in the tree whose model was
  // decided by a fallback. If the line goes, this reddens.
  check("the checker names its model", /const MODEL = "[^"]+";/.test(checkerSrc));
  const model = shippedModel(checkerSrc, catalog);
  check("...and it is a model the catalogue knows", model !== null && typeof model.inputPerMTok === "number");
  check(
    "the id the runner reports is the id in the file",
    checkerSrc.includes(`const MODEL = "${model.id}";`),
    model.id
  );
  const other = catalog.AI_CATALOG.find((m) => m.provider === "anthropic" && m.id !== model.id);
  const doctored = checkerSrc.replace(/const MODEL = "[^"]+";/, `const MODEL = "${other.id}";`);
  check(
    "changing the model in the file changes what the runner reports",
    shippedModel(doctored, catalog).id === other.id
  );
  let threw = null;
  try {
    shippedModel(checkerSrc.replace(/const MODEL = "[^"]+";/, ""), catalog);
  } catch (e) {
    threw = e.message;
  }
  check(
    "removing the line is a refusal that names the tier fallback",
    threw !== null && /mid/.test(threw) && /sonnet/.test(threw) && /haiku/.test(threw),
    String(threw)
  );
  check("the runner hardcodes no model id", !/claude-[a-z]+-\d/.test(runnerCode),
    (runnerCode.match(/claude-[a-z]+-\d[a-z0-9-]*/g) ?? []).join(", "));
  check("the unnamed default is still computable, for the report", unnamedDefaultModel(catalog) !== null);
}

// ---------------------------------------------------------------------
console.log("\n== 3. only the shipped selector decides what is sent ==");
{
  const asked = pure.greekWordsToCheck(PAGE, BRIEF);
  const body = requestBody({ model: shippedModel(checkerSrc, catalog), system: "S", words: asked });
  const sent = JSON.parse(body.messages[0].content);
  check("the body carries exactly greekWordsToCheck's output", JSON.stringify(sent) === JSON.stringify(asked));
  // THE ONE THAT MATTERS. Both forms of the owner's own name, and the
  // wordmark, checked against the BODY rather than against the selector —
  // this is the last place before the network.
  for (const own of ["Παπαδόπουλος", "Παπαδόπουλου", "Χαλάνδρι", "Χαλανδρίου", "ΠΑΠΑΔΟΠΟΥΛΟΣ"]) {
    check(`"${own}" never reaches the request body`, !sent.some((w) => fold(w) === fold(own)));
  }
  check("...while a real misspelling does", sent.includes("ρεμπα") && sent.includes("υλλικά"));
  // THE CEILINGS ARE THE SHIPPED ONES, parsed rather than typed: a runner
  // with a bigger max_tokens reports a cost the product never pays.
  const maxTokens = Number(checkerSrc.match(/maxTokens: (\d+)/)[1]);
  const temperature = Number(checkerSrc.match(/temperature: (\d+)/)[1]);
  check(`max_tokens matches the shipped ${maxTokens}`, body.max_tokens === maxTokens, String(body.max_tokens));
  check(`temperature matches the shipped ${temperature}`, body.temperature === temperature, String(body.temperature));
  check("one user message, no more", body.messages.length === 1 && body.messages[0].role === "user");
  // NO SECOND DEFINITION OF "a Greek word" in the runner. greekWordsOnPage
  // was exported from the shipped module for exactly this reason; a regex
  // here would agree today and drift tomorrow. It already did once: a
  // private copy in the first draft counted a word out of a <script> tag,
  // because it stripped tags without stripping script bodies.
  check("the runner defines no Greek character class of its own", !/Ά|Έ-Ί/.test(runnerCode));
  check("...and calls the shipped one", /pure\.greekWordsOnPage\(/.test(runnerSrc));
}

// ---------------------------------------------------------------------
console.log("\n== 4. every word on the page is accounted for ==");
{
  const { onPage, asked, held } = auditWords(pure, fold, PAGE, BRIEF);
  const heldAll = Object.values(held).flat();
  check(
    "asked + held is exactly the page, with nothing counted twice",
    asked.length + heldAll.length === onPage.length &&
      new Set([...asked, ...heldAll]).size === onPage.length,
    `${asked.length} + ${heldAll.length} vs ${onPage.length}`
  );
  check("the wordmark is filed under all-caps", held.allCaps.includes("ΖΑΧΑΡΟΠΛΑΣΤΕΙΟ"));
  check("a word the owner typed is filed as such", held.ownWord.includes("Χαλάνδρι"));
  check("an inflection is filed under the stem rule", held.ownName.includes("Χαλανδρίου"));
  // THE ATTRIBUTION MOVES WITH THE BRIEF, which is what makes it an
  // explanation rather than a decoration.
  const before = auditWords(pure, fold, PAGE, "Ζαχαροπλαστείο Παπαδόπουλος στο Χαλάνδρι.");
  const after = auditWords(pure, fold, PAGE, "Ζαχαροπλαστείο Παπαδόπουλος στο Χαλάνδρι. Πράσινο ρεύμα.");
  check("a word asked about before the brief mentioned it", before.asked.includes("πράσινο"));
  check("...is filed as the owner's own word once it is in the brief",
    !after.asked.includes("πράσινο") && after.held.ownWord.includes("πράσινο"));
  check("a page with no Greek audits to nothing",
    auditWords(pure, fold, "<p>Hello there</p>", "").onPage.length === 0);
}

// ---------------------------------------------------------------------
console.log("\n== 5. what it refuses to do ==");
// THE ENVIRONMENT IS CHOSEN, NOT INHERITED — and this file is the one
// that taught the repository why.
//
// It used to spawn the runner with no `env`, so the child saw whatever
// the machine had. The check below that asserts the runner NAMES the
// missing key was therefore green on a machine without one and RED on
// Vercel, where ANTHROPIC_API_KEY is set because the application needs
// it. Merge commit aec56a2 is where that cost a red deploy, on code that
// had passed locally minutes earlier.
//
// `key` is now an argument of the test rather than a property of the
// machine, so both answers are asserted and neither depends on where it
// runs. See scripts/tests/lib/clean-env.mjs.
function run(args, { key } = {}) {
  const env = cleanEnv({ set: { ANTHROPIC_API_KEY: key ?? undefined } });
  try {
    return { code: 0, out: execFileSync(process.execPath, [RUNNER, ...args], { encoding: "utf8", stdio: "pipe", timeout: 120_000, env }) };
  } catch (e) {
    return { code: e.status ?? 1, out: String(e.stdout ?? "") + String(e.stderr ?? "") };
  }
}
{
  const none = run([], { key: undefined });
  check("with nothing given it skips rather than half-running", none.code === 2);
  check("...and names the URL", /MISSING.*--url/.test(none.out));
  // THE BRIEF IS THE PROTECTION. A run without it would put the owner's
  // own surname in a list headed "possibly misspelled", so it is a
  // missing input rather than a default.
  check("...and names the brief", /MISSING.*--brief/.test(none.out));
  check("...and names the key, when there is no key", /MISSING.*ANTHROPIC_API_KEY/.test(none.out), none.out.slice(0, 400));
  // THE OTHER ANSWER, which is the half that was never asserted and the
  // half CI was giving. With a key present the runner must NOT call it
  // missing — and must still name the two arguments that are.
  const keyed = run([], { key: "sk-ant-not-a-real-key-for-this-test" });
  check("...and does NOT name it when there is one", !/MISSING.*ANTHROPIC_API_KEY/.test(keyed.out), keyed.out.slice(0, 400));
  check("...while still naming the arguments that are missing",
    /MISSING.*--url/.test(keyed.out) && /MISSING.*--brief/.test(keyed.out), keyed.out.slice(0, 400));
  check("...and skips either way, rather than half-running", none.code === 2 && keyed.code === 2);
  check("...and says the dry run needs no key", /--dry-run needs no key/.test(none.out));

  const cheap = run(["--html", "/dev/null", "--brief", "x", "--dry-run"], { key: undefined });
  check("an empty page costs nothing and says so", cheap.code === 0 && /Cost: \$0\.0000/.test(cheap.out), cheap.out.slice(0, 300));

  // THE CEILING IS CHECKED BEFORE ANYTHING IS SENT, not after.
  const capped = run(["--html", "scripts/tests/fixtures/greek-site.html", "--brief", "x", "--dry-run", "--max-cost", "0.000001"], { key: undefined });
  check("a worst case over the ceiling is refused with nothing sent",
    capped.code === 3 && /Nothing was sent, \$0\.00 spent/.test(capped.out), capped.out.slice(-300));

  const dry = run(["--html", "scripts/tests/fixtures/greek-site.html", "--brief", BRIEF, "--dry-run"], { key: undefined });
  check("a dry run completes and spends nothing", dry.code === 0 && /DRY RUN — nothing was sent/.test(dry.out));
  check("...and shows the owner what the brief protected", /AN INFLECTION OF A NAME/.test(dry.out));
  check("...and reports no verdict, because nothing was asked", !/what the owner would be shown/.test(dry.out));
}

// ---------------------------------------------------------------------
console.log("\n== 6. the arithmetic ==");
{
  const model = shippedModel(checkerSrc, catalog);
  check("a million input tokens cost the catalogue's input price",
    Math.abs(costOf(model, { input_tokens: 1e6, output_tokens: 0 }).total - model.inputPerMTok) < 1e-9);
  check("a million output tokens cost the catalogue's output price",
    Math.abs(costOf(model, { input_tokens: 0, output_tokens: 1e6 }).total - model.outputPerMTok) < 1e-9);
  check("no usage costs nothing", costOf(model, {}).total === 0);
  const a = parseArgs(["--brief", "", "--dry-run"]);
  // A FLAG THAT IS PRESENT AND EMPTY IS NOT A FLAG THAT IS ABSENT. `--brief ""`
  // is the owner saying there is no brief on purpose; no --brief at all is
  // an input nobody supplied, and the two get different treatment.
  check("an empty --brief counts as given", a.has("brief") && a.get("brief") === "");
  check("a flag with no value is still present", a.has("dry-run"));
  check("an absent flag is absent", !a.has("url"));
}

console.log(`\n${failures.length === 0 ? "ALL PASS" : "FAILED"}: ${pass} passed, ${failures.length} failed`);
if (failures.length) {
  for (const f of failures) console.log(`  - ${f}`);
  process.exit(1);
}
