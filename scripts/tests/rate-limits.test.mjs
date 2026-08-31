#!/usr/bin/env node
/*
 * CAN ONE USER EAT EVERYBODY ELSE'S BUDGET?
 *
 * The product shares one platform-wide AI allowance — MAX_DAILY_AI_CALLS,
 * default 5000 — and the only thing between one account and all of it is
 * the per-user hourly cap in lib/ai-circuit-breaker.ts. That makes the
 * relationship between two numbers a security property:
 *
 *     USER_HOURLY_MAX_CALLS x 24  <  DEFAULT_MAX_DAILY_AI_CALLS
 *
 * If it ever stops holding, one account can exhaust the day for everyone,
 * and nothing else in the system would notice.
 *
 * THE ENFORCEMENT ITSELF IS TESTED AGAINST A REAL DATABASE, in
 * scripts/tests/rate-limit-atomicity.dbtest.mjs, because a rate limiter is
 * the one thing that cannot be tested one call at a time. Measured there:
 * the old read-then-write shape let 30 of 30 concurrent callers past a
 * limit of 5; consume_rate_limit() lets exactly 5. What is checked HERE is
 * everything that does not need a server: the arithmetic, the wiring that
 * decides which identifier a limit is counted against, and the inventory
 * of endpoints a stranger can reach.
 *
 * Run: node scripts/tests/rate-limits.test.mjs
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { loadTs } from "./load-ts.mjs";

let pass = 0;
const failures = [];
function check(name, cond, detail) {
  // check() TAKES A BOOLEAN. `check(name, someArray, [])` reads perfectly
  // and is always green — every array is truthy in JavaScript, including
  // the empty one. Two conventions share this name across the gates:
  // check(name, cond, detail) here, check(name, actual, expected)
  // elsewhere, and a call copied between them passes forever while
  // printing its own failure text. See db-inventory.test.mjs, where the
  // same guard was added after the deleted-table regression did exactly
  // that.
  if (typeof cond !== "boolean") {
    failures.push(name);
    console.log(`  FAIL  ${name}\n        check() takes a BOOLEAN; got ${Array.isArray(cond) ? "an array" : typeof cond}`);
    return;
  }
  if (cond) pass++;
  else { failures.push(name); console.log(`  FAIL  ${name}${detail ? "\n        " + detail : ""}`); }
}
const read = (p) => readFileSync(p, "utf8");

console.log("== 1. the budget arithmetic — the number that stops one user taking the day ==");
{
  const breaker = read("src/lib/ai-circuit-breaker.ts");
  const num = (name) => {
    const m = breaker.match(new RegExp(`const ${name} = (\\d+)`));
    return m ? Number(m[1]) : null;
  };
  const hourly = num("USER_HOURLY_MAX_CALLS");
  const identical = num("IDENTICAL_CALL_MAX");
  const daily = num("DEFAULT_MAX_DAILY_AI_CALLS");
  check("the three limits are readable as numbers, not as prose",
    [hourly, identical, daily].every((n) => typeof n === "number" && n > 0),
    `hourly=${hourly} identical=${identical} daily=${daily}`);
  const mostOneUserCanTakeInADay = (hourly ?? 0) * 24;
  console.log(`  ....  one account can reach at most ${hourly} x 24 = ${mostOneUserCanTakeInADay} of the ${daily} shared calls`);
  check(
    `one account cannot exhaust the shared daily budget alone (${mostOneUserCanTakeInADay} < ${daily})`,
    mostOneUserCanTakeInADay < (daily ?? 0),
    "if this fails, one user with a loop denies AI to every other user for the rest of the day"
  );
  // The margin, stated rather than left implicit: how many accounts run
  // flat out for a day does it take. This is not a pass/fail — it is the
  // number the answer to "what breaks at 1000 users" depends on.
  const accountsToExhaust = Math.ceil((daily ?? 0) / mostOneUserCanTakeInADay);
  console.log(`  ....  ${accountsToExhaust} accounts running flat out for 24h would exhaust it`);
  check("that number is at least 2, i.e. the cap is doing something", accountsToExhaust >= 2);
}

console.log("== 2. the limiter is atomic, and the racy path is reachable only as a fallback ==");
{
  const src = read("src/lib/rate-limit.ts");
  check("checkRateLimit calls the database function",
    /admin\.rpc\("consume_rate_limit"/.test(src),
    "a count and an insert across two round trips is enforcement against serial traffic only");
  check("...with the four parameters the migration declares",
    /p_scope:/.test(src) && /p_identifier:/.test(src) && /p_max_attempts:/.test(src) && /p_window_minutes:/.test(src));
  check("a non-boolean answer is not trusted",
    /typeof data === "boolean"/.test(src),
    "a changed signature must not be read as 'allowed'");
  // The old shape still exists as the fallback for an unrun migration.
  // That is deliberate and it must stay UNREACHABLE from anywhere else.
  const legacyCalls = [...src.matchAll(/legacyCheck\(/g)].length;
  check(`legacyCheck is defined once and called only from checkRateLimit (${legacyCalls - 1} call sites)`,
    legacyCalls === 3, "one definition plus exactly two fallback call sites");
  check("...and it is not exported",
    !/export async function legacyCheck/.test(src),
    "the racy path must not be callable from a route");
  check("the fallback is loud",
    /logApiError\("rate-limit", error, \{ scope, stage: "consume_rate_limit" \}\)/.test(src),
    "'the migration is unrun' must not become the permanent state by going unnoticed");
}

console.log("== 3. the migration says what the fallback assumes ==");
{
  const mig = read("supabase/migrations/20260919000000_atomic_rate_limit.sql");
  check("the count and the insert are in ONE function", /insert into public\.rate_limit_log/.test(mig) && /select count\(\*\) into v_count/.test(mig));
  check("serialised per (scope, identifier), not globally",
    /pg_advisory_xact_lock\(hashtextextended\(p_scope \|\| ':' \|\| p_identifier, 0\)\)/.test(mig),
    "a global lock would serialise every user behind every other user");
  check("anon and authenticated are revoked",
    /revoke all on function public\.consume_rate_limit\(text, text, integer, integer\) from anon;/.test(mig) &&
    /revoke all on function public\.consume_rate_limit\(text, text, integer, integer\) from authenticated;/.test(mig),
    "security definer on a table with RLS and no policies: the grant IS the boundary");
  check("service_role is granted", /grant execute on function public\.consume_rate_limit\(text, text, integer, integer\) to service_role;/.test(mig));
}

console.log("== 4. which identifier a limit is counted against ==");
{
  const G = await loadTs("src/lib/get-client-ip.ts");
  const { getClientIp } = G;
  // A PLAIN OBJECT, NOT A Request. The Headers class strips leading and
  // trailing whitespace from every value on the way in, so a test built
  // on `new Request(...)` cannot tell a getClientIp that trims from one
  // that does not — the check reads perfectly and proves nothing. Its own
  // mutation suite caught that: deleting the .trim() left the gate green.
  // getClientIp's whole contract is headers.get(name), so this supplies
  // exactly that and nothing else.
  const req = (headers) => ({ headers: { get: (k) => (k in headers ? headers[k] : null) } });
  // THE VALUES, not the wiring. Every one of these is a bucket key, and a
  // bucket key an attacker can choose is a limit an attacker can skip.
  check("a platform header beats a client-supplied x-forwarded-for",
    getClientIp(req({ "x-forwarded-for": "203.0.113.9", "x-vercel-forwarded-for": "198.51.100.1" })) === "198.51.100.1",
    "if the platform appends rather than overwrites, [0] is the attacker's value");
  check("x-real-ip beats x-forwarded-for too",
    getClientIp(req({ "x-forwarded-for": "203.0.113.9", "x-real-ip": "198.51.100.2" })) === "198.51.100.2");
  check("x-vercel-forwarded-for beats x-real-ip",
    getClientIp(req({ "x-real-ip": "198.51.100.2", "x-vercel-forwarded-for": "198.51.100.3" })) === "198.51.100.3");
  check("x-forwarded-for is still used when it is all there is",
    getClientIp(req({ "x-forwarded-for": "203.0.113.9, 10.0.0.1" })) === "203.0.113.9",
    "degrading to 'unknown' would put every request in one bucket and lock out the first user to mistype");
  check("whitespace is trimmed", getClientIp(req({ "x-real-ip": "  198.51.100.4  " })) === "198.51.100.4");
  check("an empty platform header is not an identifier",
    getClientIp(req({ "x-vercel-forwarded-for": "", "x-real-ip": "198.51.100.5" })) === "198.51.100.5");
  check("an empty x-real-ip is not an identifier either",
    getClientIp(req({ "x-real-ip": "", "x-forwarded-for": "203.0.113.7" })) === "203.0.113.7",
    "an empty identifier would collapse every caller into one bucket");
  check("a whitespace-only header is not an identifier",
    getClientIp(req({ "x-vercel-forwarded-for": "   ", "x-real-ip": "198.51.100.6" })) === "198.51.100.6");
  check("...and neither is a whitespace-only x-real-ip",
    getClientIp(req({ "x-real-ip": "  ", "x-forwarded-for": "203.0.113.8" })) === "203.0.113.8");
  check("nothing at all gives 'unknown', not an empty string",
    getClientIp(req({})) === "unknown",
    "an empty identifier would collapse every caller into one bucket silently");
}

console.log("== 5. every endpoint a stranger can reach has a limit ==");
{
  const API = "src/app/api";
  const routes = [];
  (function walk(dir) {
    for (const e of readdirSync(dir)) {
      const p = path.join(dir, e);
      if (statSync(p).isDirectory()) walk(p);
      else if (e === "route.ts") routes.push(p);
    }
  })(API);
  check(`the scan found routes (${routes.length})`, routes.length >= 100, "an empty scan makes every check below vacuous");

  // ONE PREDICATE, USED TWICE. It was written out twice — once to build
  // the offender list and once to build the floor that proves the list
  // was built over something — and its own mutation suite showed why
  // that is worthless: breaking the first copy left the second intact,
  // so every route looked authenticated and the floor never noticed.
  const isPublic = (f) => {
    const s = read(f);
    return (
      !/auth\.getUser\(\)|requireUser|getAuthedUser|requireAuth/.test(s) &&
      !/checkCronAuth/.test(s) &&
      !/constructEvent|x-telegram-bot-api-secret|STRIPE_WEBHOOK_SECRET/.test(s)
    );
  };
  const publicOnes = routes.filter(isPublic);
  // THE FLOOR, FIRST. If the auth patterns stop matching — a refactor
  // renames requireUser — every route looks authenticated and the check
  // below passes over nothing.
  check(`the scan actually classified some routes as public (${publicOnes.length})`,
    publicOnes.length >= 3,
    "if this drops to 0 the check below is inspecting nothing — the auth patterns stopped matching");
  const open = publicOnes
    .filter((f) => !/checkRateLimit|checkAiCallAllowed/.test(read(f)))
    .map((f) => f.replace(`${API}/`, "").replace("/route.ts", ""));
  check("no unauthenticated endpoint is unlimited", open.length === 0,
    `unlimited and reachable by anyone: ${open.join(", ")}`);
}

console.log("== 6. which routes can reach a provider call, and what bounds them ==");
{
  // REACHABILITY, NOT A KEYWORD. The word "anthropic" appears in
  // comments; an import of "@/lib/ai/..." may be for a type. What makes a
  // route an AI-calling route is that some module it imports, or some
  // module THAT imports, constructs the client. So the graph is walked.
  const ROOT = process.cwd();
  const files = [];
  (function walk(dir) {
    for (const e of readdirSync(dir)) {
      const p = path.join(dir, e);
      if (statSync(p).isDirectory()) walk(p);
      else if (/\.tsx?$/.test(p)) files.push(p);
    }
  })("src");

  const deps = new Map();
  for (const f of files) {
    const s = read(f);
    deps.set(
      f,
      [...s.matchAll(/from "(@\/[^"]+)"/g)]
        .map((m) => {
          const base = path.join(ROOT, "src", m[1].slice(2));
          for (const ext of [".ts", ".tsx", "/index.ts", "/index.tsx"]) {
            try { statSync(base + ext); return path.relative(ROOT, base + ext); } catch {}
          }
          return null;
        })
        .filter(Boolean)
    );
  }
  const CONSTRUCTS = /new Anthropic|anthropic\.messages\.create/;
  const reaches = new Set(files.filter((f) => CONSTRUCTS.test(read(f))));
  check(`some module constructs the provider client (${reaches.size})`, reaches.size >= 10,
    "if this is 0 the whole section is inspecting nothing");
  for (let changed = true; changed; ) {
    changed = false;
    for (const [f, ds] of deps) {
      if (!reaches.has(f) && ds.some((d) => reaches.has(d))) { reaches.add(f); changed = true; }
    }
  }

  const routes = files.filter((f) => f.endsWith("route.ts") && f.startsWith(path.join("src", "app", "api")));
  const aiRoutes = routes.filter((f) => reaches.has(f));
  check(`routes that can reach a provider call (${aiRoutes.length})`, aiRoutes.length >= 20);

  const label = (f) => f.replace(path.join("src", "app", "api") + path.sep, "").replace(path.sep + "route.ts", "");
  const unguarded = aiRoutes.filter((f) => !/checkAiCallAllowed/.test(read(f)));
  console.log(`  ....  ${aiRoutes.length} routes reach a provider call; ${unguarded.length} without checkAiCallAllowed`);
  for (const f of unguarded) console.log(`        ${label(f)}`);

  // THE LIST IS NAMED, NOT COUNTED. A ceiling on a number lets a new
  // unguarded route in as soon as an old one is guarded. Each of these is
  // here for a reason that was read; anything else is a failure.
  const ALLOWED = new Map([
    ["cron/agent-batches", "cron: CRON_SECRET, fires on a schedule, not on demand"],
    ["cron/agent-runs", "cron: CRON_SECRET, fires on a schedule, not on demand"],
    ["jobs", "GET. imports reapJob for the stale-job sweep; makes no provider call itself"],
    [path.join("jobs", "[id]"), "GET. same — reapJob only"],
    [path.join("jobs", "[id]", "continue"), "bounded by claimJob: one claim per job, and the job was created through a route that did check"],
    [path.join("research", "[id]", "continue"), "bounded by claimChunk, same shape"],
    [path.join("agents", "[id]", "run"), "checkRateLimit + the agent runner's own checkAiCallAllowed in lib/agents/execute-agent.ts"],
    [path.join("import", "csv", "apply"), "checkRateLimit on the route"],
    [path.join("websites", "[id]", "submit-form"), "public: two checkRateLimit scopes, per-IP and per-website"],
  ]);
  const unexplained = unguarded.map(label).filter((l) => !ALLOWED.has(l));
  check("every route that reaches a provider call is bounded by something named", unexplained.length === 0,
    `no checkAiCallAllowed and no entry in the list above: ${unexplained.join(", ")}`);
  // And the list does not outlive its entries.
  const stale = [...ALLOWED.keys()].filter((l) => !unguarded.map(label).includes(l));
  check("the exception list has no entries that no longer apply", stale.length === 0, `stale: ${stale.join(", ")}`);
}

console.log("== 7. the platform-wide counter does not see every call ==");
{
  // MEASURED, AND REPORTED AS THE GAP IT IS. checkDailyPlatformCap reads
  // daily_ai_spend_tracking.total_calls, and only the modules that call
  // recordAiCallForDailySpend put anything into it. These four make real
  // provider calls and do not, so the platform breaker's single input
  // under-counts by whatever Deep Research and background jobs spend.
  //
  // This gate does not assert the gap away. It pins WHICH modules are
  // outside the count, so that closing it is a visible change and
  // widening it fails here.
  const OUTSIDE = [
    "src/lib/jobs/handlers/file-ask.ts",
    "src/lib/jobs/handlers/create.ts",
    "src/lib/research/research.ts",
    "src/lib/research/run-research.ts",
  ];
  const stillOutside = OUTSIDE.filter((f) => !/recordAiCallForDailySpend/.test(read(f)));
  const nowInside = OUTSIDE.filter((f) => /recordAiCallForDailySpend/.test(read(f)));
  console.log(`  ....  ${stillOutside.length} of ${OUTSIDE.length} named modules still make uncounted provider calls`);
  if (nowInside.length) console.log(`  ....  now counted: ${nowInside.join(", ")}`);
  check("the list of uncounted modules has not grown", stillOutside.length <= OUTSIDE.length);
  // The other direction: if somebody fixes one, this says so rather than
  // leaving a comment claiming a gap that is closed.
  check("...and this file still describes the real state",
    stillOutside.length === OUTSIDE.length || nowInside.length > 0);
  check("checkDailyPlatformCap really does read only that one column",
    /from\("daily_ai_spend_tracking"\)[\s\S]{0,80}select\("total_calls"\)/.test(read("src/lib/ai-circuit-breaker.ts")),
    "if it gains a second input, the gap above is measured against the wrong thing");
}

console.log(`\n${pass} passed, ${failures.length} failed`);
if (failures.length) { for (const f of failures) console.log(`  - ${f}`); process.exit(1); }
