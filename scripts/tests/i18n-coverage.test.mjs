// The i18n gap that scripts/check-i18n.js could not see.
//
// check-i18n.js reads messages/*.json and nothing else. It answers exactly
// one question — "does every English key exist, translated, in the other
// nine locales?" — and it answers it well. But its own header claims it
// also catches:
//
//     "2. A UI string never added to messages/*.json at all — a literal in
//      JSX. Nothing can translate what it never sees."
//
// It cannot. It never opens a source file. So the app shipped 46 hardcoded
// English strings across 26 components — every toast and inline error in
// Settings, Modules CRUD, Team, Mission, Entity Links, Billing, Website
// Builder and signup:
//
//     addToast("✓ created")
//     setError("Network error — please try again.")
//     addToast("✗ could not update password", "error")
//
// A Greek or Japanese user completing any of those flows got English. Both
// halves of the app's i18n guard passed the whole time.
//
// This file closes that gap from the SOURCE side, and adds the mirror
// check: a t("key") call whose key does not exist. next-intl does not fail
// the build for that — it logs IntlError: MISSING_MESSAGE to the browser
// console and renders the raw key path to the user. The only reason the
// five sidebar hint keys were caught earlier this project was that someone
// happened to be reading the console.
//
// Run: node scripts/tests/i18n-coverage.test.mjs
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

let pass = 0,
  fail = 0;
function check(name, actual, expected) {
  const a = JSON.stringify(actual),
    e = JSON.stringify(expected);
  if (a === e) {
    pass++;
    console.log(`  PASS  ${name}`);
  } else {
    fail++;
    console.log(`  FAIL  ${name}\n        expected ${e}\n        actual   ${a}`);
  }
}
function checkTrue(name, cond) {
  check(name, Boolean(cond), true);
}

const LOCALES = ["en", "el", "es", "fr", "de", "it", "pt", "zh", "ja", "ar"];
const messages = Object.fromEntries(
  LOCALES.map((l) => [l, JSON.parse(readFileSync(`messages/${l}.json`, "utf8"))])
);
const lookup = (obj, path) => path.split(".").reduce((a, k) => (a == null ? a : a[k]), obj);

function walk(dir) {
  const out = [];
  for (const e of readdirSync(dir)) {
    const p = join(dir, e);
    if (statSync(p).isDirectory()) out.push(...walk(p));
    else if (/\.tsx?$/.test(p)) out.push(p);
  }
  return out;
}
const sources = walk("src");

console.log("== 1. no user-facing string is hardcoded in a component ==");
// The three calls that put a string straight in front of the user. A
// literal here is, by construction, untranslatable.
const USER_FACING_CALLS = ["addToast", "setError", "setMessage"];
// Literals that are NOT user-facing prose: a lone symbol, a formatting
// token, an empty reset. Requiring three consecutive letters is what
// separates "✓ created" from "" or "—".
const PROSE = /[A-Za-z]{3,}/;

// Comments must be stripped first. Several files in this repo document the
// bug they fixed by quoting the OLD code — lib/ndjson-stream.ts's header
// literally contains `setError("Network error")` as an illustration. A
// scanner that flags its own documentation is a scanner people switch off.
function stripComments(src) {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "");
}

const hardcoded = [];
for (const file of sources) {
  const src = stripComments(readFileSync(file, "utf8"));
  for (const fn of USER_FACING_CALLS) {
    const re = new RegExp(`\\b${fn}\\(\\s*"([^"]*)"`, "g");
    for (const m of src.matchAll(re)) {
      if (PROSE.test(m[1])) hardcoded.push(`${file}: ${fn}("${m[1]}")`);
    }
  }
}
check(`no hardcoded prose in ${USER_FACING_CALLS.join("/")} (${sources.length} files scanned)`, hardcoded, []);

// KNOWN GAP, recorded rather than silently tolerated.
//
// Error text that originates on the SERVER is English everywhere: API
// routes return `{ error: "Could not create that entry." }` as prose, and
// the client renders it verbatim through getErrorMessage(err, "English
// fallback"). Translating it properly means routes returning stable error
// CODES that the client looks up, or server-side translation against the
// request's locale cookie — a real refactor, not a string sweep, and out
// of scope for the audit that found it.
//
// The count is asserted so the number cannot quietly GROW. If a change
// adds server-side English prose, this fails and the decision gets made
// deliberately instead of by accident.
const serverErrorProse = sources
  .filter((f) => f.startsWith("src/app/api/"))
  .flatMap((f) => [...stripComments(readFileSync(f, "utf8")).matchAll(/error: "[A-Z][^"]{8,}"/g)]);
const clientFallbacks = sources.flatMap((f) => [
  ...stripComments(readFileSync(f, "utf8")).matchAll(/getErrorMessage\([^,]+,\s*"[^"]{6,}"/g),
]);
// 235 -> 236: api/websites/generate gained "Could not attach the reference
// images. Please try again." when the reference-image scoping fix made that
// insert fail-closed instead of best-effort. Same already-documented class
// (server-side English prose), raised deliberately rather than silently —
// which is the entire point of pinning the number.
// 236 -> 282: V3 Task 1 (Autonomous Agents) added five API routes —
// api/agents, api/agents/[id], api/agents/[id]/run, api/agents/build and
// api/cron/agent-runs — and every validation failure, ownership miss,
// plan-cap rejection and rate-limit response in them returns English
// prose, exactly like the 236 that came before. Raised deliberately, with
// the same decision recorded: translating these means routes returning
// stable error CODES the client looks up, which is a refactor of all 45+
// routes at once and not something to start halfway through in one
// feature. The USER-FACING strings for this feature — every label,
// status, toast and confirmation on /dashboard/agents — are fully
// translated in all ten locales; what is English here is the fallback
// text shown only when a request fails in a way the client has no
// specific message for.
const SERVER_PROSE_BASELINE = 282;
// Measured by the regex above, not by an outside grep: a line-based grep
// misses the calls whose arguments span lines, and a baseline taken with a
// different instrument than the check is just a slow-motion false alarm.
const CLIENT_FALLBACK_BASELINE = 38;
checkTrue(
  `server-side English error prose has not grown (${serverErrorProse.length} <= ${SERVER_PROSE_BASELINE})`,
  serverErrorProse.length <= SERVER_PROSE_BASELINE
);
checkTrue(
  `client English fallbacks have not grown (${clientFallbacks.length} <= ${CLIENT_FALLBACK_BASELINE})`,
  clientFallbacks.length <= CLIENT_FALLBACK_BASELINE
);

console.log("\n== 2. every t() call resolves to a real key ==");
// next-intl renders the raw key path and logs to the console when a key is
// missing. Nothing fails a build. This is the only thing standing between
// a typo'd key and a user seeing "dashboard.chat.streamInterrupted" in the
// UI.
let callSites = 0;
const unresolved = [];
const usedKeys = new Set();

for (const file of sources) {
  const src = readFileSync(file, "utf8");
  // ident -> namespace, for both the client hook and the server helper.
  const hooks = {};
  for (const m of src.matchAll(/const (\w+) = (?:await )?(?:useTranslations|getTranslations)\(\s*"([^"]+)"\s*\)/g)) {
    hooks[m[1]] = m[2];
  }
  for (const [ident, ns] of Object.entries(hooks)) {
    // Only a direct call: `t("key")`. A computed key (`t(someVar)`) cannot
    // be resolved statically and is deliberately not flagged.
    const re = new RegExp(`\\b${ident}\\(\\s*"([^"]+)"`, "g");
    for (const m of src.matchAll(re)) {
      callSites++;
      const full = `${ns}.${m[1]}`;
      usedKeys.add(full);
      if (typeof lookup(messages.en, full) !== "string") {
        unresolved.push(`${file}: ${ident}("${m[1]}") -> ${full}`);
      }
    }
  }
}
checkTrue(`t() call sites found (${callSites})`, callSites > 400);
check("every t() key exists in en.json", unresolved, []);

console.log("\n== 3. every key the code uses exists in all 10 locales ==");
// check-i18n.js covers en -> the other nine for keys that EXIST in en.json.
// This narrows to the keys the code actually calls, so a key added to
// en.json and to the code but forgotten elsewhere is caught as the runtime
// break it is, in the locale it breaks in.
const perLocaleMissing = {};
for (const loc of LOCALES) {
  const missing = [...usedKeys].filter((k) => typeof lookup(messages[loc], k) !== "string");
  if (missing.length) perLocaleMissing[loc] = missing.slice(0, 10);
}
check(`all ${usedKeys.size} code-referenced keys present in every locale`, perLocaleMissing, {});

console.log("\n== 4. the strings extracted in this pass are really there ==");
// Spot-check the specific keys that replaced the 46 literals, in every
// locale — including that the translation is not just the English copied
// across, which is how this class of bug hides.
const EXTRACTED = [
  "common.networkError",
  "common.notAuthenticated",
  "common.created",
  "common.updated",
  "common.linked",
  "dashboard.team.memberRemoved",
  "dashboard.team.couldNotRemoveMember",
  "settings.chatMemory.memoryCleared",
  "settings.changePassword.passwordUpdated",
  "settings.changePassword.passwordsDoNotMatch",
  "settings.aiPersona.personaUpdated",
  "settings.exportData.exportDownloaded",
  "settings.loginActivity.deviceRemoved",
  "settings.dangerZone.emailDoesNotMatch",
  "dashboard.mission.updatedElsewhere",
  "auth.signup.mustAgreeToTerms",
  "auth.resetPassword.passwordsDoNotMatch",
];
for (const key of EXTRACTED) {
  const values = LOCALES.map((l) => lookup(messages[l], key));
  checkTrue(`${key}: present in all 10 locales`, values.every((v) => typeof v === "string" && v.length > 0));
  // Greek, Japanese and Arabic share no alphabet with English, so an
  // identical value in ANY of them means the string was never translated.
  // (Latin-script locales legitimately coincide sometimes — that is what
  // check-i18n.js's allowlist is for; these three never do.)
  const en = lookup(messages.en, key);
  const untranslated = ["el", "ja", "ar"].filter((l) => lookup(messages[l], key) === en);
  check(`${key}: actually translated into el/ja/ar`, untranslated, []);
}

console.log("\n== 5. check-i18n.js no longer claims to do this ==");
// The stale claim is what made the gap invisible: anyone reading that
// header would reasonably conclude JSX literals were already covered.
const guard = readFileSync("scripts/check-i18n.js", "utf8");
checkTrue(
  "check-i18n.js points at this file for the source-side check",
  guard.includes("i18n-coverage.test.mjs")
);

console.log(`\n${fail === 0 ? "ALL PASS" : "FAILURES"}: ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
