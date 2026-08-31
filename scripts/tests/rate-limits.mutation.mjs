// EVERY CLAUSE OF rate-limits.test.mjs, BROKEN ON PURPOSE.
//
// The gate answers "can one user eat everybody else's budget". That
// answer rests on an arithmetic relationship between two constants, on
// which header decides a rate-limit bucket, and on a scan of 123 routes
// that can report "all pass" over an empty list.
//
// The defect it was written for is a mutation here: getClientIp reading
// the client-supplied end of x-forwarded-for, which gives an attacker a
// fresh bucket per request and makes every IP-scoped limit decorative.
//
// The ENFORCEMENT is not tested here — a rate limiter cannot be tested
// one call at a time. That is scripts/tests/rate-limit-atomicity.dbtest.mjs,
// against a real Postgres, 30 connections at once.
//
// EVERY MUTATION IS A DELETION OR AN EDIT OF REAL CODE.
//
// Run: node scripts/tests/rate-limits.mutation.mjs
import { readFileSync } from "node:fs";
import { writeFileSync } from "./lib/sidecar-write.mjs";
import { execFileSync } from "node:child_process";

const GATE = "scripts/tests/rate-limits.test.mjs";
const IP = "src/lib/get-client-ip.ts";
const LIMIT = "src/lib/rate-limit.ts";
const BREAKER = "src/lib/ai-circuit-breaker.ts";
const MIG = "supabase/migrations/20260919000000_atomic_rate_limit.sql";

function gateIsGreen() {
  try { execFileSync("node", [GATE], { stdio: "pipe" }); return true; } catch { return false; }
}

const MUTATIONS = [
  // ---- the budget arithmetic ----
  {
    name: "the per-user hourly cap is raised past the point where one user can take the day",
    file: BREAKER,
    from: "const USER_HOURLY_MAX_CALLS = 20;",
    to: "const USER_HOURLY_MAX_CALLS = 250;",
    expect: "250 x 24 = 6000 > 5000: one account can deny AI to everyone else",
  },
  {
    name: "the shared daily budget is lowered below what one user can spend",
    file: BREAKER,
    from: "const DEFAULT_MAX_DAILY_AI_CALLS = 5000;",
    to: "const DEFAULT_MAX_DAILY_AI_CALLS = 100;",
    expect: "the same inequality, from the other side",
  },
  {
    name: "the platform cap reads a second column, so the uncounted-modules measurement is against the wrong thing",
    file: BREAKER,
    from: '.select("total_calls")',
    to: '.select("total_calls, estimated_cost")',
    expect: "section 7's premise",
  },

  // ---- THE DEFECT ITSELF ----
  {
    name: "getClientIp goes back to trusting the client end of x-forwarded-for",
    file: IP,
    from: '  const vercel = request.headers.get("x-vercel-forwarded-for")?.split(",")[0]?.trim();\n  if (vercel) return vercel;\n\n  const real = request.headers.get("x-real-ip")?.trim();\n  if (real) return real;\n\n',
    to: "",
    expect: "a bucket key an attacker can choose is a limit an attacker can skip",
  },
  {
    name: "x-real-ip is preferred over the platform header",
    file: IP,
    from: '  const vercel = request.headers.get("x-vercel-forwarded-for")?.split(",")[0]?.trim();\n  if (vercel) return vercel;\n\n  const real = request.headers.get("x-real-ip")?.trim();\n  if (real) return real;',
    to: '  const real = request.headers.get("x-real-ip")?.trim();\n  if (real) return real;\n\n  const vercel = request.headers.get("x-vercel-forwarded-for")?.split(",")[0]?.trim();\n  if (vercel) return vercel;',
    expect: "the order is the whole point",
  },
  {
    name: "an empty header counts as an identifier",
    file: IP,
    from: '  const real = request.headers.get("x-real-ip")?.trim();\n  if (real) return real;',
    to: '  const real = request.headers.get("x-real-ip")?.trim();\n  if (real !== undefined) return real;',
    expect: "an empty identifier collapses every caller into one bucket",
  },
  {
    name: "no header at all returns an empty string instead of 'unknown'",
    file: IP,
    from: '  return "unknown";',
    to: '  return "";',
    expect: "same collapse, by a different route",
  },
  {
    name: "whitespace stops being trimmed",
    file: IP,
    from: '  const real = request.headers.get("x-real-ip")?.trim();',
    to: '  const real = request.headers.get("x-real-ip");',
    expect: "' 1.2.3.4 ' and '1.2.3.4' would be two buckets",
  },

  // ---- the limiter's wiring ----
  {
    name: "checkRateLimit goes back to the read-then-write",
    file: LIMIT,
    from: '  const { data, error } = await admin.rpc("consume_rate_limit", {',
    to: '  const { data, error } = await admin.rpc("consume_rate_limit_renamed", {',
    expect: "the name the migration declares",
  },
  {
    name: "a non-boolean answer is trusted as 'allowed'",
    file: LIMIT,
    from: '    if (typeof data === "boolean") return { allowed: data };',
    to: "    return { allowed: Boolean(data) };",
    expect: "a changed signature must not read as allowed",
  },
  {
    name: "the unrun-migration fallback goes silent",
    file: LIMIT,
    from: '  logApiError("rate-limit", error, { scope, stage: "consume_rate_limit" });',
    to: "",
    expect: "'the migration is unrun' must not become permanent by going unnoticed",
  },
  {
    name: "the racy path becomes exported, so a route can call it directly",
    file: LIMIT,
    from: "async function legacyCheck(",
    to: "export async function legacyCheck(",
    expect: "it is the fallback, not an API",
  },

  // ---- the migration ----
  {
    name: "the advisory lock is dropped, leaving the function racy inside one statement",
    file: MIG,
    from: "  perform pg_advisory_xact_lock(hashtextextended(p_scope || ':' || p_identifier, 0));",
    to: "",
    expect: "the count and the insert are two statements without it",
  },
  {
    name: "authenticated regains execute on the limiter",
    file: MIG,
    from: "revoke all on function public.consume_rate_limit(text, text, integer, integer) from authenticated;",
    to: "",
    expect: "security definer on an RLS table with no policies: the grant IS the boundary",
  },

  // ---- THE INSTRUMENT'S OWN CLAUSES ----
  {
    name: "the route scan finds nothing, so 'no unauthenticated endpoint is unlimited' is vacuous",
    file: GATE,
    from: '      else if (e === "route.ts") routes.push(p);\n    }\n  })(API);\n  check(`the scan found routes (${routes.length})`',
    to: '      else if (e === "no-such-file") routes.push(p);\n    }\n  })(API);\n  check(`the scan found routes (${routes.length})`',
    expect: "the floor on the route count",
  },
  {
    name: "the auth patterns stop matching, so every route looks authenticated",
    file: GATE,
    from: "      !/auth\\.getUser\\(\\)|requireUser|getAuthedUser|requireAuth/.test(s) &&",
    to: "      !/NOTHING_MATCHES_THIS/.test(s) && false &&",
    expect: "the floor on how many routes were classified public",
  },
  {
    name: "the whitespace trim is removed from the platform header",
    file: IP,
    from: '  const vercel = request.headers.get("x-vercel-forwarded-for")?.split(",")[0]?.trim();',
    to: '  const vercel = request.headers.get("x-vercel-forwarded-for")?.split(",")[0];',
    expect: "the whitespace-only case — the Headers class would have hidden this",
  },
  {
    name: "the provider-client detector matches nothing, so no route 'reaches AI'",
    file: GATE,
    from: "  const CONSTRUCTS = /new Anthropic|anthropic\\.messages\\.create/;",
    to: "  const CONSTRUCTS = /NOTHING_MATCHES_THIS/;",
    expect: "the floor on modules that construct the client",
  },
  {
    name: "the exception list grows an entry that nothing needs",
    file: GATE,
    from: '    ["cron/agent-batches", "cron: CRON_SECRET, fires on a schedule, not on demand"],',
    to: '    ["cron/agent-batches", "cron: CRON_SECRET, fires on a schedule, not on demand"],\n    ["some/route/that/does/not/exist", "invented"],',
    expect: "the stale-entry check — an exception list that outlives its entries stops being read",
  },
];

console.log("rate-limits mutations\n");
if (!gateIsGreen()) { console.log("baseline: the gate is RED on the unmutated tree — fix that first."); process.exit(1); }
console.log("baseline: the gate is GREEN on the unmutated tree");

let caught = 0;
const survivors = [];
const missed = [];

for (const m of MUTATIONS) {
  const before = readFileSync(m.file, "utf8");
  if (!before.includes(m.from)) { missed.push(`${m.name} — ANCHOR NOT FOUND in ${m.file}`); continue; }
  if (before.split(m.from).length - 1 !== 1) { missed.push(`${m.name} — anchor appears more than once in ${m.file}`); continue; }
  writeFileSync(m.file, before.replace(m.from, () => m.to));
  const red = !gateIsGreen();
  writeFileSync(m.file, before);
  if (red) { caught++; console.log(`  CAUGHT  ${m.name}${m.expect ? `\n          -> by ${m.expect}` : ""}`); }
  else { survivors.push(`${m.name} (${m.file}) — the gate stayed GREEN`); console.log(`  SURVIVED  ${m.name}`); }
}

console.log("");
if (!gateIsGreen()) { console.log("baseline: the gate is RED on the restored tree — a mutation was not put back."); process.exit(1); }
console.log("baseline: the gate is green again on the restored tree\n");
console.log(`${caught} of ${MUTATIONS.length} mutations caught.`);
if (missed.length) { console.log("\nMISSED ANCHORS:"); for (const s of missed) console.log(`  - ${s}`); }
if (survivors.length) { console.log("\nSURVIVORS:"); for (const s of survivors) console.log(`  - ${s}`); }
if (missed.length || survivors.length) process.exit(1);
console.log("Every clause of rate-limits.test.mjs is load-bearing.");
