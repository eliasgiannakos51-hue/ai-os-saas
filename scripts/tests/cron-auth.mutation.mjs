#!/usr/bin/env node
/*
 * THE THREE ROUTES THAT REWRITE BALANCES, SPEND MONEY AND EMAIL EVERYONE.
 *
 * cron-auth.test.mjs exists because all three once guarded themselves with
 * `if (secret) { ...401... }`, so a deployment that never set CRON_SECRET
 * served them to the internet. The gate is the reason that cannot come
 * back. This suite is the reason to believe the gate.
 *
 * Every mutant below is a defect somebody could plausibly write — a
 * fail-open, a comparison loosened to make a test pass, an information
 * leak, a guard that logs instead of returning. None is a syntax error.
 *
 * Run: node scripts/tests/cron-auth.mutation.mjs
 */
import { readFileSync } from "node:fs";
import { writeFileSync } from "./lib/sidecar-write.mjs";
import { execFileSync } from "node:child_process";

const GATE = "scripts/tests/cron-auth.test.mjs";
const LIB = "src/lib/cron-auth.ts";
const RESET = "src/app/api/cron/reset-credits/route.ts";

const MUTANTS = [
  {
    // THE ORIGINAL BUG, VERBATIM. No secret configured means open to
    // everyone — the state that would let a stranger rewrite every
    // account's balance.
    name: "no CRON_SECRET fails OPEN again — the V1+V2 audit finding",
    file: LIB,
    from: "    if (isLocalDevelopment()) return { ok: true };",
    to: "    return { ok: true };",
    expect: "unauthenticated request on Vercel production is REFUSED",
  },
  {
    // The same hole one level down: a deployment stops being recognised
    // as a deployment, so production is treated as somebody's laptop.
    name: "a Vercel deployment counts as local development",
    file: LIB,
    from: "  if (process.env.VERCEL_ENV || process.env.VERCEL) return false;",
    to: "  if (false) return false;",
    expect: "VERCEL=1 alone is enough to disqualify 'local'",
  },
  {
    // The comparison loosened to a prefix — what somebody writes when a
    // token with trailing whitespace keeps failing and the deadline is
    // today. Every prefix of the secret then opens the route, so it can
    // be brute-forced one character at a time.
    name: "the secret comparison becomes a prefix match",
    file: LIB,
    from: "  if (a.length !== b.length) return false;\n  return timingSafeEqual(a, b);",
    to: "  return expected.startsWith(provided);",
    expect: "a prefix of the secret rejected",
  },
  {
    // Drop the length guard and timingSafeEqual throws on any
    // wrong-length token, turning a 401 into an unhandled 500.
    name: "the length guard goes, so a wrong-length token throws instead of being refused",
    file: LIB,
    from: "  if (a.length !== b.length) return false;\n",
    to: "",
    expect: "a different-length token does not throw",
  },
  {
    // An information leak reachable by anyone on the internet: the 503
    // tells a stranger exactly which variable to go looking for.
    name: "the unconfigured response names the missing variable",
    file: LIB,
    from: '      error: "This endpoint is not available.",',
    to: '      error: "CRON_SECRET is not set on this deployment.",',
    expect: "does not name the missing variable",
  },
  {
    // 401 invites retries with a different token; 503 says the endpoint
    // is off. The gate pins the distinction on purpose.
    name: "an unconfigured endpoint answers 401, inviting the caller to keep guessing",
    file: LIB,
    from: "      status: 503,",
    to: "      status: 401,",
    expect: "with 503, not a silent success",
  },
  {
    // THE HEADER PATH, UNVERIFIED. The authorization branch is compared
    // properly; this one just checks the header is present. A stranger
    // sending `x-cron-secret: x` is in.
    name: "x-cron-secret is accepted for merely existing, whatever it says",
    file: LIB,
    from: "  if (headerSecret && secretsMatch(headerSecret, secret)) {",
    to: "  if (headerSecret) {",
    expect: "a wrong x-cron-secret is rejected",
  },
  {
    // The inline fail-open guard, reintroduced in a route. This is the
    // exact shape the gate's section 4 was written to prevent.
    name: "a route reintroduces its own inline fail-open guard",
    file: RESET,
    from: "export async function GET(request: Request) {",
    to: "export async function GET(request: Request) {\n  const secret = process.env.CRON_SECRET;\n  if (secret) { /* inline guard */ }",
    expect: "no inline 'if (secret)' fail-open guard",
  },
  {
    // A guard that logs and carries on. The route runs, the balances are
    // rewritten, and there is a line in the log saying it should not have
    // happened.
    name: "a failed check is logged instead of returned",
    file: RESET,
    from: "    if (!auth.ok) {\n      return NextResponse.json(",
    to: "    if (!auth.ok) {\n      console.warn(\"cron auth failed\");\n    }\n    if (false) {\n      return NextResponse.json(",
    expect: "a failed check returns immediately",
  },
];

function runGate() {
  try {
    execFileSync(process.execPath, [GATE], { encoding: "utf8", stdio: "pipe" });
    return { green: true, failed: [] };
  } catch (e) {
    const out = String(e.stdout ?? "") + String(e.stderr ?? "");
    const failed = [...out.matchAll(/^ {2}FAIL {2}(.+)$/gm)].map((m) => m[1].trim());
    return { green: false, failed: failed.length ? failed : ["(exited non-zero with no FAIL line)"] };
  }
}

console.log("cron-auth mutations\n");
const TARGETS = [...new Set(MUTANTS.map((m) => m.file))];
const originals = new Map(TARGETS.map((f) => [f, readFileSync(f, "utf8")]));
const restoreAll = () => { for (const [f, t] of originals) writeFileSync(f, t); };

let caught = 0;
const missed = [];
try {
  const base = runGate();
  console.log(`baseline: the gate is ${base.green ? "GREEN" : "RED"} on the unmutated tree`);
  if (!base.green) {
    console.log(`\nBASELINE IS RED — no result below would mean anything.\n  ${base.failed.join("\n  ")}`);
    process.exit(1);
  }
  for (const m of MUTANTS) {
    const original = originals.get(m.file);
    if (!original.includes(m.from)) {
      missed.push({ ...m, why: `the mutation target no longer exists in ${m.file}` });
      console.log(`  STALE   ${m.name}`);
      continue;
    }
    writeFileSync(m.file, original.replace(m.from, m.to));
    let result;
    try { result = runGate(); } finally { restoreAll(); }
    if (result.green) {
      missed.push({ ...m, why: "the gate stayed green — nothing here is load-bearing" });
      console.log(`  MISSED  ${m.name}`);
      continue;
    }
    const onTarget = result.failed.filter((f) => f.includes(m.expect));
    if (onTarget.length === 0) {
      missed.push({ ...m, why: `red on "${result.failed.slice(0, 3).join('", "')}" — nothing matching "${m.expect}"` });
      console.log(`  WRONG   ${m.name}\n          -> red on: ${result.failed.slice(0, 3).join(" | ")}`);
      continue;
    }
    caught++;
    console.log(`  CAUGHT  ${m.name}\n          -> ${onTarget[0]}`);
  }
} finally {
  restoreAll();
}

const after = runGate();
console.log(after.green ? "\nbaseline: green again on the restored tree" : "\nBASELINE IS RED — a mutation was not restored.");
console.log(`\n${caught} of ${MUTANTS.length} mutations caught.`);
if (missed.length > 0 || !after.green) {
  if (missed.length) { console.log("\nHOLES:"); for (const m of missed) console.log(`  - ${m.name}\n    ${m.why}`); }
  process.exit(1);
}
console.log("No cron route can be opened to the internet without this going red.");
