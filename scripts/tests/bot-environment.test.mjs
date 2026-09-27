/*
 * THE BOT MUST KNOW WHAT KIND OF PLACE IT IS POINTED AT.
 *
 * Run: node scripts/tests/bot-environment.test.mjs
 *
 * THE FAILURE. A billable check driven against a deployment with no
 * provider key does not find a broken product. It finds an empty
 * environment — and reports BROKEN, which is the product blamed for
 * where the harness was aimed. It is the same shape as the fifteen red
 * builds of 2026-09-19..26: an instrument running somewhere that does
 * not look like production, with nothing anywhere saying so.
 *
 * WHY THIS IS NOT A REGEX OVER scripts/e2e-bot.mjs. A check that finds
 * the string `canCallModel` in that file proves the word is present, and
 * the eleven prose-anchored gates fixed on 2026-09-19 are what that is
 * worth. So the three cases are RUN: a stub /api/health answers yes, no,
 * and not-at-all, the real bot is spawned against each, and its own
 * stdout has to say the right thing. Delete the preflight and all three
 * go red; invert the verdict and two do.
 *
 * WHAT IT DOES NOT COVER, and says so rather than implying otherwise:
 * whether a check marked NOT RUN for this reason ends up in broken.md's
 * not-run table. That needs a successful sign-in, which needs the
 * credentials, which are not in any environment a gate runs in. The
 * branch that records it is asserted structurally below and marked as
 * the weaker half.
 */
import { spawn } from "node:child_process";
import { readFileSync, mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { stripComments } from "../check-mutation-markers.mjs";

let pass = 0;
const failures = [];
function check(name, cond, detail) {
  if (cond) {
    pass++;
    console.log(`  PASS  ${name}`);
  } else {
    failures.push(name);
    console.log(`  FAIL  ${name}${detail !== undefined ? "\n        " + detail : ""}`);
  }
}

const BOT = resolve("scripts/e2e-bot.mjs");
const CHECKS = resolve("checks/make.md");
const botSrc = readFileSync(BOT, "utf8");
const botCode = stripComments(botSrc);

// ---------------------------------------------------------------------
console.log("== 1. the three answers a target can give, each one run ==");

// THE REAL FUNCTION, WITH A FAKE FETCH. Not a stub server on a port:
// billing-coverage.test.mjs §10 forbids a unit gate from binding one,
// and its reason is the right one — a gate that needs a working network
// is a coin flip. So preflight() is imported and handed a fetch that
// returns the three bodies a deployment can produce, and what is under
// test is the shipped function rather than a copy of it.
const { preflight, preflightLine } = await import("../lib/bot-preflight.mjs");

const ANSWERS = {
  yes: { ok: true, ai: { canCallModel: true, providers: ["anthropic"], missing: [] } },
  no: { ok: true, ai: { canCallModel: false, providers: [], missing: ["ANTHROPIC_API_KEY is not set"] } },
  silent: { ok: true },
};
let asked = [];
const fakeFetch = (answer) => async (url) => {
  asked.push(url);
  return { json: async () => ANSWERS[answer] };
};

const yes = preflightLine(await preflight("https://target.example", fakeFetch("yes")));
check("a target WITH a key: the bot says so, and names the provider",
  /can call a model: YES \(anthropic\)/.test(yes), yes);

const no = preflightLine(await preflight("https://target.example", fakeFetch("no")));
check("a target WITHOUT a key: the bot says NO", /can call a model: NO/.test(no), no);
check("...and prints which variable is missing, so it can be fixed",
  no.includes("ANTHROPIC_API_KEY is not set"), no);

const silent = preflightLine(await preflight("https://target.example", fakeFetch("silent")));
check("a deployment too old to answer is UNKNOWN, not NO",
  /can call a model: UNKNOWN/.test(silent) && !/can call a model: NO/.test(silent), silent);

// AND A TARGET THAT DOES NOT ANSWER AT ALL is the fourth case, which is
// the one this container is in for www.ionexa.app.
const dead = preflightLine(
  await preflight("https://target.example", async () => {
    throw new Error("connect_rejected");
  })
);
check("a target that does not answer is UNKNOWN too, with the reason",
  /UNKNOWN/.test(dead) && dead.includes("connect_rejected"), dead);

// A FLOOR UNDER THE FOUR. All four differ, so a preflight that printed
// one constant could not satisfy them — the shape that made the first
// LITERAL detector match 264 of 275 gates.
check("the four answers produce four different lines",
  new Set([yes, no, silent, dead]).size === 4, [yes, no, silent, dead].join(" | "));

// AND IT ASKED THE TARGET'S OWN ADDRESS, four times, with no other host
// touched.
check("every ask went to the target's own /api/health",
  asked.length === 3 && asked.every((u) => u === "https://target.example/api/health"),
  asked.join(", "));

// ---------------------------------------------------------------------
console.log("\n== 2. it asks the TARGET, never this machine ==");

// Section 1 ran the preflight and proved where it asks. This is the
// other half: that the BOT runs that same function, rather than a second
// copy that could drift from the one under test.
check("the bot runs the preflight that section 1 exercised",
  /from "\.\/lib\/bot-preflight\.mjs"/.test(botCode) && /await preflight\(BASE\)/.test(botCode),
  "the bot has its own copy, so the gate above is testing something else");
check("no billable decision is taken from this machine's ANTHROPIC_API_KEY",
  !/process\.env\.ANTHROPIC_API_KEY/.test(botCode),
  "the bot reads the key locally — that is the wrong environment, one level in");

// THE WEAKER HALF, named as such: structural, because the branch it
// guards needs a signed-in session to reach.
const guard = botCode.match(/if \(check\.costs && NO_MODEL_KEY\) \{[\s\S]{0,400}?\n  \}/);
check("a billable check on a keyless target is recorded (structural)", Boolean(guard), "the guard is gone");
check("...as NOT RUN, which is the third outcome — never BROKEN (structural)",
  Boolean(guard) && /"NOT RUN"/.test(guard[0]) && !/"BROKEN"/.test(guard[0]),
  guard ? guard[0].slice(0, 300) : "no guard");

// ---------------------------------------------------------------------
console.log("\n== 3. /api/health answers from the registry, not from process.env ==");

const health = stripComments(readFileSync("src/app/api/health/route.ts", "utf8"));
check("health reports `ai`", /body\.ai\s*=/.test(health), "no ai field is set");
check("...built from providerStatuses(), the function a real call resolves through",
  /providerStatuses\(process\.env\)/.test(health),
  "the field is derived some other way, so it can disagree with what a generation would find");
check("...and carries no key value, only names and booleans",
  !/ANTHROPIC_API_KEY\s*[,)\]}]/.test(health) && !/process\.env\.ANTHROPIC_API_KEY/.test(health),
  "a key or a fragment of one can reach the response");

// AND THE POPULATION, so "it reports the providers" is a claim about all
// of them rather than about Anthropic. The registry names the env var for
// every provider it knows; the health field must range over the same set,
// which it does by calling the function that produces it.
const registry = stripComments(readFileSync("src/lib/ai/providers/registry.ts", "utf8"));
const providerVars = [...registry.matchAll(/^\s+(\w+): "([A-Z_]+_API_KEY)",$/gm)].map((m) => m[1]);
check(`the registry knows ${providerVars.length} providers and health asks about all of them`,
  providerVars.length >= 2 && /providerStatuses\(process\.env\)/.test(health),
  providerVars.join(", "));

// ---------------------------------------------------------------------
console.log("\n== 4. .env.local reaches a plain node script, and never wins ==");

// next build reads .env.local itself; a node script does not, so a key
// sitting in a developer's own file was invisible to the bot and to
// nothing else. Run in a temp directory so the repository's own file —
// if there is one — is neither read nor written.
const tmp = mkdtempSync(join(tmpdir(), "botenv-"));
try {
  writeFileSync(join(tmp, ".env.local"), 'BOT_BASE_URL="https://from-the-file.example"\n');
  const run = (env) =>
    new Promise((r) => {
      const c = spawn(process.execPath, [BOT, CHECKS], { cwd: tmp, env: { ...process.env, ...env }, stdio: ["ignore", "pipe", "pipe"] });
      let out = "";
      c.stdout.on("data", (d) => (out += d));
      c.on("close", () => r(out));
    });

  const fromFile = await run({ BOT_BASE_URL: undefined, BOT_EMAIL: "", BOT_PASSWORD: "" });
  check("a variable only in .env.local is picked up",
    fromFile.includes("https://from-the-file.example"), fromFile.slice(0, 400));

  const fromEnv = await run({ BOT_BASE_URL: "https://from-the-environment.example", BOT_EMAIL: "", BOT_PASSWORD: "" });
  check("...and an environment variable beats it, so a stale file cannot redirect a run",
    fromEnv.includes("https://from-the-environment.example") && !fromEnv.includes("from-the-file"),
    fromEnv.slice(0, 400));
} finally {
  rmSync(tmp, { recursive: true, force: true });
}

console.log(`\n${failures.length === 0 ? "ALL PASS" : "FAILURES"}: ${pass} passed, ${failures.length} failed`);
process.exit(failures.length === 0 ? 0 : 1);
