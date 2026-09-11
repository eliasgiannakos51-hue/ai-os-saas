#!/usr/bin/env node
/**
 * DOES THIS GATE GIVE THE SAME ANSWER ON A DIFFERENT MACHINE?
 *
 * Run: node scripts/env-sensitivity.mjs [--only <substring>] [--json <file>]
 *
 * WHY THIS EXISTS, and it is not a hypothetical. Merge commit aec56a2
 * went red on Vercel with one failing check in
 * check-site-spelling.test.mjs — a check that had been green on every
 * local run for days. The cause was not a flake and not a stale message:
 * the test spawned a runner WITHOUT giving it an environment, and
 * asserted the runner's "MISSING ANTHROPIC_API_KEY" line. That line only
 * appears when the key is absent. It is absent on a developer machine
 * and PRESENT on Vercel, because the application needs it. So the gate
 * was green here and red there on byte-identical code.
 *
 * Note the direction, because the obvious guess is backwards: the test
 * passed locally because the variable was MISSING, and failed in CI
 * because it was SET.
 *
 * WHAT THIS DOES. It runs each gate twice with an environment it
 * constructs, not the one it inherited:
 *
 *   BARE      a minimal environment — PATH and friends, nothing else.
 *   DEPLOYED  the same, plus every variable .env.local.example documents
 *             (131 of them, collected by lib/env-usage.mjs, which reads
 *             both `process.env.X` and the `process.env[name]` form), set
 *             to an obviously-fake sentinel, plus the four the PLATFORM
 *             sets rather than the owner: CI=1, VERCEL=1,
 *             VERCEL_ENV=production and NODE_ENV=production.
 *
 * A gate whose verdict differs between the two is a gate that does not
 * mean the same thing in both places. That is the whole finding; which
 * of the two answers is "right" is a separate question this tool does
 * not try to answer.
 *
 * THE SENTINELS ARE DELIBERATELY UNUSABLE. `sentinel-not-a-real-value`
 * is not a key anybody can spend, not a URL anybody can reach and not a
 * connection string anybody can open. A gate that tries to USE one will
 * fail, and that failure is a true finding: it means the gate reaches
 * for a live service the moment a variable appears.
 */
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { envVarsInExample } from "./lib/env-usage.mjs";

const ALWAYS = ["PATH", "HOME", "TMPDIR", "TEMP", "TMP", "SHELL", "LANG", "LC_ALL", "NODE_PATH"];
const SENTINEL = "sentinel-not-a-real-value";

// A SENTINEL HAS TO HAVE THE RIGHT SHAPE, and the first run of
// `npm run build:ci` is what proved it: every one of the 252 gates
// passed and `next build` then died with
//
//     TypeError: Invalid URL
//     Error: Failed to collect page data for /_not-found
//
// because NEXT_PUBLIC_SUPABASE_URL had been set to the string
// "sentinel-not-a-real-value" and new URL() refuses it. That was MY
// instrument being wrong, not the repository: Vercel's values are fake
// to me but well-formed to the code. A tool that cries wolf is one
// somebody stops running, which is the same end as not having it.
//
// .invalid is reserved by RFC 2606 and resolves nowhere, so a
// URL-shaped sentinel still cannot reach anything. The shape is taken
// from the NAME, which is all this file knows — and a name that says
// URL and holds something else is a different problem.
function sentinelFor(name) {
  if (/(?:^|_)(?:URL|URI|ENDPOINT|ORIGIN|HOST)(?:_|$)/.test(name)) return "https://sentinel.invalid";
  if (/EMAIL|MAILTO/.test(name)) return "sentinel@sentinel.invalid";
  if (/(?:_EUR|_USD|_RATIO|_MS|_DAYS|_SECONDS|_MINUTES|_LIMIT|_MAX|_MIN|_COUNT|_PORT|_PERCENT)$/.test(name)) return "1";
  // A key with a required length: 32 bytes, base64, so a decoder that
  // checks the size gets something the right size rather than a crash
  // that says nothing about the gate under test.
  if (/ENCRYPTION_KEY|_SECRET_KEY$/.test(name)) return Buffer.alloc(32, 7).toString("base64");
  return SENTINEL;
}

// THE SECOND HOLE IN THIS FILE, found by its own first run.
//
// The first version built DEPLOYED from .env.local.example alone — the
// 131 variables the APPLICATION reads. The tooling reads thirty-four
// more that no example file documents, because nobody configures them on
// a deployment: CHROMIUM_PATH, BASE_URL, PROD_BASE_URL, SKIP_BUILD,
// RUNS, the CHAT_* knobs. A sweep that never sets them cannot report a
// gate that depends on one, and prodtest-hygiene.test.mjs depends on
// CHROMIUM_PATH. So the set is the UNION, collected from the scripts
// tree rather than typed here.
function envNamesInScripts(dir = "scripts", out = new Set()) {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = `${dir}/${e.name}`;
    if (e.isDirectory()) envNamesInScripts(p, out);
    else if (/\.(mjs|js)$/.test(e.name)) {
      const src = readFileSync(p, "utf8");
      for (const m of src.matchAll(/process\.env\.([A-Z_][A-Z0-9_]*)/g)) out.add(m[1]);
      for (const m of src.matchAll(/process\.env\[["'`]([A-Z_][A-Z0-9_]*)["'`]\]/g)) out.add(m[1]);
    }
  }
  return out;
}

// VARIABLES WHOSE INFLUENCE IS THE POINT, declared with the reason
// rather than silently skipped. Setting any of these to a sentinel does
// not model a deployment; it models a broken one, and the "difference"
// it would report is the gate doing its job.
//
// Checked BOTH WAYS below: a name here that nothing reads is a stale
// excuse, and this list may not quietly grow to cover a real finding.
// A KNOB IS NOT AN ENVIRONMENT, and the second run of
// `npm run build:ci` is what proved this one too.
//
// The shape rule above gives any name ending in _EUR, _RATIO, _PERCENT
// or _MS a numeric sentinel of "1". CREDIT_PRICE_EUR=1 means a credit
// costs one euro, and agent-depth.test.mjs then reported 1 / 1 / 2
// credits for three tiers whose bands are meant to be far apart. Nothing
// was wrong with the repository: the sweep had quietly repriced the
// product.
//
// These variables exist to CHANGE a computed number. Setting one models
// a different price list, not a different machine, so the sweep leaves
// them unset — which is what a deployment that does not configure them
// has, and what every gate asserts against.
//
// THE HONEST LIMIT OF THAT, stated rather than hidden: if any of these
// IS configured on the deployment, the gates that assert its arithmetic
// will disagree there and this sweep will not have said so. The tool
// prints the list on every run for exactly that reason.
const TUNING = new Map([
  ["CREDIT_PRICE_EUR", "what one credit costs; every credit figure in the product is derived from it"],
  ["ENTERPRISE_MIN_PRICE_EUR", "the floor under an enterprise quote"],
  ["RESERVE_BUFFER_PERCENT", "how much more than the estimate is held before a model call"],
  ["BYPASS_CEILING_ADMIN_EUR", "the ceiling above which an admin bypass stops being allowed"],
  ["COST_ALERT_DAILY_RATIO", "the multiple of a normal day that triggers the cost alert"],
  ["SUPABASE_DELAY_MS", "an artificial delay used to reproduce slow-database behaviour"],
]);

const INTENTIONAL = new Map([
  ["DATABASE_URL", "the db suites connect when given one and skip when not — that IS the switch"],
  ["TEST_DATABASE_URL", "the throwaway database the db suites create and drop; present means run, absent means skip"],
  ["PGTEST_URL", "the connection the credit-grant suite opens when it is given one, and skips without"],
  ["PGHOST", "libpq reads it when no URL is given; setting it points the db suites at a host that is not there"],
  ["PGDATABASE", "libpq reads it alongside PGHOST; the same objection applies"],
  ["HTTPS_PROXY", "this machine reaches the network through it; replacing it tests the proxy, not the gate"],
  ["MUTATION_SIDECAR_PATH", "the mutation harness's own handshake with its sidecar writer"],
  ["UNGUARDED_GUARDS_RUNNING", "the marker a mutation run sets so nested runs know they are nested"],
  ["TMPDIR", "already forwarded — a child with no temp directory cannot write at all"],
  ["CI", "set by the platform below, not by an owner"],
  ["X", "not a variable: the literal name env-documented.test.mjs feeds its own parser as a sample"],
]);

function bare() {
  const out = {};
  for (const k of ALWAYS) if (process.env[k] !== undefined) out[k] = process.env[k];
  return out;
}

export function probedNames() {
  const names = new Set([...envVarsInExample(), ...envNamesInScripts()]);
  for (const skip of INTENTIONAL.keys()) names.delete(skip);
  for (const skip of TUNING.keys()) names.delete(skip);
  return names;
}

export function deployedEnv() {
  const out = bare();
  for (const name of probedNames()) out[name] = sentinelFor(name);
  // What the platform itself sets. Not from the example file — nobody
  // configures these, the builder does.
  out.CI = "1";
  out.VERCEL = "1";
  out.VERCEL_ENV = "production";
  // AND NODE_ENV, which the first version of this file left out and
  // should not have: Vercel runs the build step with NODE_ENV=production,
  // so a sweep without it is a sweep of an environment that does not
  // exist. Four places in this repository read it.
  out.NODE_ENV = "production";
  return out;
}

export function verdictOf(file, env) {
  const started = Date.now();
  try {
    const out = execFileSync(process.execPath, [file], {
      encoding: "utf8", stdio: "pipe", env, timeout: 300_000,
    });
    return { code: 0, tally: tallyOf(out), ms: Date.now() - started };
  } catch (e) {
    const out = String(e.stdout ?? "") + String(e.stderr ?? "");
    return { code: e.status ?? 1, tally: tallyOf(out), ms: Date.now() - started, fails: failLines(out) };
  }
}

// THE PASS/FAIL TALLY, not the whole output. Two runs of the same gate
// differ in timings, temp paths and counts printed for information; the
// tally is the part that is the verdict.
function tallyOf(out) {
  const m = out.match(/(\d+) passed, (\d+) failed/) ?? out.match(/(\d+) of (\d+) (?:checks )?passed/);
  return m ? `${m[1]}/${m[2]}` : "no tally";
}
const failLines = (out) => [...out.matchAll(/^ {2}FAIL {2}(.+)$/gm)].map((m) => m[1].trim()).slice(0, 4);

// THE SWEEP ONLY RUNS WHEN THIS FILE IS THE ONE INVOKED. ci-build.mjs
// imports deployedEnv() from here, and a module that starts a 25-minute
// sweep the moment somebody imports one function from it is a trap.
const INVOKED_DIRECTLY = process.argv[1] && process.argv[1].endsWith("env-sensitivity.mjs");
if (!INVOKED_DIRECTLY) {
  // Nothing else to do — the exports above are the whole point of the import.
} else {

const args = process.argv.slice(2);
const only = args.includes("--only") ? args[args.indexOf("--only") + 1] : null;
const jsonOut = args.includes("--json") ? args[args.indexOf("--json") + 1] : null;

const gates = readdirSync("scripts/tests")
  .filter((f) => f.endsWith(".test.mjs"))
  .filter((f) => (only ? f.includes(only) : true))
  .map((f) => `scripts/tests/${f}`);

const BARE = bare();
const DEPLOYED = deployedEnv();
// THE DECLARED LIST, CHECKED THE OTHER WAY: every name excused here must
// still be read somewhere, or it is an excuse for a variable that no
// longer exists.
{
  const read = new Set([...envVarsInExample(), ...envNamesInScripts()]);
  const stale = [...INTENTIONAL.keys(), ...TUNING.keys()].filter((n) => !read.has(n));
  if (stale.length > 0) {
    console.log(`STALE EXCEPTIONS — declared intentional, read nowhere: ${stale.join(", ")}`);
    process.exit(1);
  }
}
console.log(`${gates.length} gates, twice each`);
console.log(`  BARE:     ${Object.keys(BARE).length} variables`);
console.log(`  DEPLOYED: ${Object.keys(DEPLOYED).length} variables (${Object.keys(DEPLOYED).length - Object.keys(BARE).length} set to a sentinel)`);
console.log(`  declared intentional and NOT probed: ${[...INTENTIONAL.keys()].join(", ")}`);
console.log(`  tuning knobs left UNSET — if any of these is configured on the deployment,`);
console.log(`  the gates that assert its arithmetic will disagree there and this run will not say so:`);
console.log(`    ${[...TUNING.keys()].join(", ")}\n`);

const rows = [];
for (const gate of gates) {
  const a = verdictOf(gate, BARE);
  const b = verdictOf(gate, DEPLOYED);
  const same = a.code === b.code && a.tally === b.tally;
  rows.push({ gate, bare: a, deployed: b, same });
  const name = gate.replace("scripts/tests/", "");
  if (same) console.log(`  same   ${name.padEnd(46)} ${a.tally}`);
  else console.log(`  DIFFERS ${name.padEnd(45)} bare ${a.code}/${a.tally}  deployed ${b.code}/${b.tally}\n          ${(b.fails ?? a.fails ?? []).join(" | ")}`);
}

const differing = rows.filter((r) => !r.same);
console.log(`\n${rows.length} gates, ${differing.length} give a different verdict in a deployed environment`);
for (const r of differing) console.log(`  ${r.gate}`);
if (jsonOut) writeFileSync(jsonOut, JSON.stringify(rows, null, 1));
process.exit(differing.length === 0 ? 0 : 1);

}
