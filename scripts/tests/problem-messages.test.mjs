// "SOMETHING WENT WRONG." IS NOT A MESSAGE.
//
// That sentence is in this codebase twenty times, and every one of them is
// the same three failures of nerve: it does not say WHAT happened, it does
// not say WHAT THE USER CAN DO, and — the one that costs money — it does
// not say whether the credits were taken. A user who ran out of credits, a
// user whose connection dropped and a user who hit an hourly cap all read
// it and all draw the same conclusion: the product is broken and their
// balance is gone.
//
// This file covers the four failures a user is actually going to hit —
// out of credits, rate limited, timeout, network — and holds each of them
// to three parts, in ten languages.
//
// THE THIRD PART IS THE POINT. `what` and `next` are ordinary good copy.
// The money line is the one nothing answered, and it is not optional here:
// it is keyed off the code through CREDIT_OUTCOME_FOR, so a route cannot
// report the wrong one, and the component renders it unconditionally
// rather than when someone remembered to pass it.
//
// WHAT THIS IS NOT. It is not the whole-API-surface error-code refactor
// that i18n-coverage.test.mjs has had recorded as the fix for 521 lines of
// English server prose. It is the four failures that refactor exists to
// fix, done properly, with the mechanism the rest can adopt one route at a
// time — so the baseline over there is untouched and honest, and this does
// not pretend to have paid it.
//
// Run: node scripts/tests/problem-messages.test.mjs
import { readFileSync } from "node:fs";

let pass = 0;
const failures = [];
function check(name, cond, detail) {
  if (cond) {
    pass++;
    console.log(`  PASS  ${name}`);
  } else {
    failures.push(name);
    console.log(`  FAIL  ${name}${detail ? "\n        " + detail : ""}`);
  }
}
function checkList(name, actual) {
  check(name, actual.length === 0, actual.slice(0, 6).join("\n        "));
}

const LOCALES = ["en", "el", "es", "fr", "de", "it", "pt", "zh", "ja", "ar"];
const messages = Object.fromEntries(
  LOCALES.map((l) => [l, JSON.parse(readFileSync(`messages/${l}.json`, "utf8"))])
);
function lookup(obj, dotted) {
  return dotted.split(".").reduce((node, part) => (node == null ? undefined : node[part]), obj);
}

const { loadTs } = await import("./load-ts.mjs");
const { PROBLEM_CODES, CREDIT_OUTCOME_FOR, isProblemCode, problemCodeFrom, problemKey, creditOutcomeKey } =
  await loadTs("src/lib/errors/problem-codes.ts");

console.log("== 1. the four failures a user actually hits ==");
check(`four codes (${PROBLEM_CODES.length})`, PROBLEM_CODES.length === 4);
for (const code of ["out_of_credits", "rate_limited", "timeout", "network"]) {
  check(`${code} is one of them`, PROBLEM_CODES.includes(code));
}

console.log("\n== 2. WHAT happened, and WHAT you can do — in ten languages ==");
for (const locale of LOCALES) {
  const missing = [];
  for (const code of PROBLEM_CODES) {
    for (const part of ["what", "next"]) {
      if (typeof lookup(messages[locale], problemKey(code, part)) !== "string") {
        missing.push(problemKey(code, part));
      }
    }
  }
  checkList(`${locale}: every code says what happened and what to do`, missing);
}
// "next" must be a different sentence from "what". A message that restates
// the problem where the remedy goes is the generic sentence again, split
// across two lines.
for (const locale of LOCALES) {
  const echoes = PROBLEM_CODES.filter(
    (c) => lookup(messages[locale], problemKey(c, "what")) === lookup(messages[locale], problemKey(c, "next"))
  );
  checkList(`${locale}: no remedy merely restates the problem`, echoes);
}
// And each code has to describe a DIFFERENT failure, or the codes are
// decoration and the user is back to one message for four situations.
for (const locale of LOCALES) {
  const whats = PROBLEM_CODES.map((c) => lookup(messages[locale], problemKey(c, "what")));
  check(
    `${locale}: the four read differently from each other (${new Set(whats).size}/4)`,
    new Set(whats).size === 4
  );
}
// The remedy has to be actionable. "Try again" alone is what these
// messages already said; a remedy that is only that is not a remedy.
for (const locale of ["en"]) {
  const lazy = PROBLEM_CODES.filter((c) => {
    const next = lookup(messages[locale], problemKey(c, "next"));
    return typeof next === "string" && next.trim().length < 40;
  });
  checkList(`${locale}: no remedy is just "try again"`, lazy);
}

console.log("\n== 3. and whether the credits were taken ==");
// The question none of the twenty "Something went wrong."s answered.
for (const locale of LOCALES) {
  const missing = ["untouched", "refunded", "charged"].filter(
    (o) => typeof lookup(messages[locale], creditOutcomeKey(o)) !== "string"
  );
  checkList(`${locale}: every credit outcome has words`, missing);
}
// "untouched" and "refunded" are the same arithmetic and a different
// sentence: one answers a user about to retry, the other a user who
// watched the credits leave. Collapsing them loses the only part of the
// message that is about their money.
for (const locale of LOCALES) {
  check(
    `${locale}: "not charged" and "refunded" are not the same sentence`,
    lookup(messages[locale], creditOutcomeKey("untouched")) !==
      lookup(messages[locale], creditOutcomeKey("refunded"))
  );
}
// Every code has an outcome, decided in one place rather than per route.
for (const code of PROBLEM_CODES) {
  check(`${code}: its credit outcome is fixed by the code, not by a caller`, Boolean(CREDIT_OUTCOME_FOR[code]));
}
// The two that are refused BEFORE anything is reserved cannot be
// "refunded" — there was nothing to give back, and saying otherwise would
// invent a transaction.
check("out_of_credits reports nothing taken", CREDIT_OUTCOME_FOR.out_of_credits === "untouched");
check("rate_limited reports nothing taken", CREDIT_OUTCOME_FOR.rate_limited === "untouched");
// A timeout DID reserve, and run-job.ts hands the hold back.
check("timeout reports the hold returned", CREDIT_OUTCOME_FOR.timeout === "refunded");
// A dropped connection cannot know what the server did, so it must not
// claim a refund it has not seen.
check("network claims nothing it cannot know", CREDIT_OUTCOME_FOR.network === "untouched");

console.log("\n== 4. a code is read, never guessed ==");
check("a body with a known code yields it", problemCodeFrom({ ok: false, code: "rate_limited" }) === "rate_limited");
check("an unknown code yields nothing", problemCodeFrom({ ok: false, code: "kaboom" }) === null);
// The important one: an unconverted route returns English prose and no
// code, and must NOT be pattern-matched into one. Guessing from the words
// is how "Too many agents created" would tell somebody their credits were
// refunded.
check("English prose is not mined for a code", problemCodeFrom({ ok: false, error: "Too many agents created." }) === null);
check("a non-object yields nothing", problemCodeFrom("rate_limited") === null);
check("isProblemCode rejects a near-miss", !isProblemCode("rate-limited"));

console.log("\n== 5. the routes that already refuse say why in a stable way ==");
// Rate limiting is the one of the four a server decides, so it is the one
// that has to carry a code across the wire.
const RATE_LIMITED_ROUTES = [
  "src/app/api/agents/route.ts",
  "src/app/api/agents/[id]/route.ts",
  "src/app/api/agents/[id]/run/route.ts",
  "src/app/api/agents/build/route.ts",
  "src/app/api/research/route.ts",
  "src/app/api/documents/route.ts",
];
for (const file of RATE_LIMITED_ROUTES) {
  const src = readFileSync(file, "utf8");
  check(`${file.split("/api/")[1]}: its 429 carries a code`, /code: "rate_limited"/.test(src), file);
  // The English sentence stays beside it on purpose: callers that have not
  // been converted keep working, so this can land route by route instead
  // of as one irreversible sweep.
  check(`${file.split("/api/")[1]}: and keeps its prose for unconverted callers`, /Too many|too many/.test(src));
}

console.log("\n== 6. the notice renders all three parts, always ==");
const notice = readFileSync("src/components/errors/problem-notice.tsx", "utf8");
check("it renders what", /problemKey\(code, "what"\)/.test(notice));
check("it renders next", /problemKey\(code, "next"\)/.test(notice));
// Unconditionally — not behind a prop a caller can forget, which is how
// the money line goes missing on the one screen that needed it.
check(
  "and the credit outcome, with no condition in front of it",
  /\{t\(creditOutcomeKey\(outcome\)\)\}/.test(notice) && !/\{outcome && /.test(notice)
);
check("the outcome comes from the code, not from a prop", /CREDIT_OUTCOME_FOR\[code\]/.test(notice));
// role="alert" or a screen reader never hears that the action failed.
check("it announces itself", /role="alert"/.test(notice));

console.log("\n== 7. a converted caller prefers the code to the prose ==");
const agents = readFileSync("src/components/agents/agents-workspace.tsx", "utf8");
check("agents reads the code off the body", /problemCodeFrom\(data\)/.test(agents));
check("and falls back to the route's prose when there is none", /else addToast\(data\.error/.test(agents));
check("a failed fetch becomes network or timeout", /problemCodeForFetchFailure\(err\)/.test(agents));
check("and the notice is rendered where the action was", /<ProblemNotice/.test(agents));

console.log(`\n${failures.length === 0 ? "ALL PASS" : "FAILURES"}: ${pass} passed, ${failures.length} failed`);
process.exit(failures.length === 0 ? 0 : 1);
