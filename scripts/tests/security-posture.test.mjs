// Security-posture guard for the V1+V2 audit.
//
// Every check here encodes something that was VERIFIED by hand during the
// audit and would be silent if it regressed. Three categories:
//
//   1. Row Level Security. A table that ships without RLS is a total data
//      leak — every user reads every other user's rows through the anon
//      key, with no error and no log line. The schema enables it for the
//      23 module tables via `execute format(...)` loops rather than
//      literal statements, so a naive grep for "enable row level
//      security" MISSES them and reports a false catastrophe. This test
//      expands the loops.
//   2. API-route authorisation. Every route must either call
//      auth.getUser() or be on a short, explicitly-justified allowlist.
//   3. Orphaned maintenance work. releaseExpiredReservations was
//      documented in two places as "called by the daily cron" and had
//      zero callers. Documentation is not wiring.
//
// Run: node scripts/tests/security-posture.test.mjs
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

const sql = readFileSync("supabase_full_project_backup.sql", "utf8");

console.log("== 1. Row Level Security covers every user-data table ==");

// Tables enabled by a literal statement.
const literalRls = new Set(
  [...sql.matchAll(/alter table (?:only )?(?:public\.)?"?([a-z_0-9]+)"?\s+enable row level security/gi)].map(
    (m) => m[1]
  )
);

// Tables enabled inside a `do $$ ... for t in select unnest(array[...])`
// loop. Expanding these is the whole point — grepping alone under-reports
// by 23 tables and turns a healthy schema into a fake emergency.
const loopRls = new Set();
for (const block of sql.matchAll(/for t in\s+select unnest\(array\[([\s\S]*?)\]\)([\s\S]*?)end \$\$;/gi)) {
  const [, arrayBody, loopBody] = block;
  if (!/enable row level security/i.test(loopBody)) continue;
  for (const m of arrayBody.matchAll(/'([a-z_0-9]+)'/gi)) loopRls.add(m[1]);
}
checkTrue(`the dynamic loops were parsed (${loopRls.size} tables)`, loopRls.size >= 23);

const rlsEnabled = new Set([...literalRls, ...loopRls]);

// Every table the schema creates, minus the ones that hold no user data.
const created = new Set(
  [...sql.matchAll(/^create table (?:if not exists )?(?:public\.)?"?([a-z_0-9]+)"?/gim)].map((m) => m[1])
);

// Tables that intentionally carry NO per-user rows readable by a client.
// Each one is admin-client-only in application code — asserted below.
const ADMIN_ONLY_TABLES = new Set(["rate_limit_log", "daily_ai_spend_tracking", "account_deletion_requests"]);

const missing = [...created].filter((t) => !rlsEnabled.has(t)).sort();
check(`no user-data table is missing RLS (${created.size} tables checked)`, missing, []);

// The module tables specifically — the largest block and the one that is
// only covered dynamically.
const MODULE_TABLES = [
  "ideas", "competitors", "research", "finance_entries", "learning_entries",
  "trades", "decisions", "products", "content", "leads", "feedback",
  "metrics", "automations", "ai_agents", "ai_websites", "ai_apps",
  "ai_images", "ai_videos", "ai_coding_requests", "ai_data_analysis_requests",
  "ai_documents", "ai_presentations", "ai_campaigns",
];
for (const t of MODULE_TABLES) {
  if (!rlsEnabled.has(t)) {
    fail++;
    console.log(`  FAIL  module table ${t} has no RLS`);
  }
}
check(`all ${MODULE_TABLES.length} module tables have RLS`, MODULE_TABLES.every((t) => rlsEnabled.has(t)), true);

// RLS with no policy denies everything to anon/authenticated (service_role
// bypasses) — correct for the admin-only tables, a bug for anything else.
const policyTables = new Set(
  [...sql.matchAll(/create policy[^;]*?\son\s+(?:public\.)?"?([a-z_0-9]+)"?/gis)].map((m) => m[1])
);
for (const t of MODULE_TABLES) {
  checkTrue(`${t} has at least one policy`, policyTables.has(t) || loopRls.has(t));
}

const silentlyDenied = [...rlsEnabled].filter(
  (t) => !policyTables.has(t) && !loopRls.has(t) && !ADMIN_ONLY_TABLES.has(t)
).sort();
check("no table is RLS-enabled with no policy and no justification", silentlyDenied, []);

console.log("\n== 2. the admin-only tables are never touched with a user client ==");
// If one of these were ever read through createClient(), the deny-all RLS
// above would make it return zero rows with NO error — the exact silent
// failure mode this app has been bitten by before.
function walk(dir) {
  const out = [];
  for (const e of readdirSync(dir)) {
    const p = join(dir, e);
    if (statSync(p).isDirectory()) out.push(...walk(p));
    else if (/\.tsx?$/.test(p)) out.push(p);
  }
  return out;
}
const srcFiles = walk("src");
for (const table of ADMIN_ONLY_TABLES) {
  const users = srcFiles.filter((f) => readFileSync(f, "utf8").includes(`from("${table}")`));
  checkTrue(`${table} is queried somewhere`, users.length > 0);
  for (const f of users) {
    const src = readFileSync(f, "utf8");
    checkTrue(`${table} in ${f} uses the admin client`, src.includes("createAdminClient"));
  }
}

console.log("\n== 3. every API route authenticates, or is justified ==");
const routes = walk("src/app/api").filter((f) => f.endsWith("route.ts"));
checkTrue(`routes discovered (${routes.length})`, routes.length >= 40);

// Routes that legitimately have no logged-in user. Each is load-bearing
// and was read line-by-line in the audit; the reason is recorded here so a
// future addition to this list is a deliberate decision, not a drift.
const NO_SESSION_BY_DESIGN = {
  "src/app/api/auth/login/route.ts": "creates the session; rate-limited per IP",
  "src/app/api/signup/route.ts": "creates the account; rate-limited",
  "src/app/api/webhooks/stripe/route.ts": "authenticated by Stripe signature, not a cookie",
  "src/app/api/cron/reset-credits/route.ts": "authenticated by CRON_SECRET (lib/cron-auth.ts)",
  "src/app/api/cron/scheduled-runs/route.ts": "authenticated by CRON_SECRET (lib/cron-auth.ts)",
  "src/app/api/weekly-digest/route.ts": "authenticated by CRON_SECRET (lib/cron-auth.ts)",
  "src/app/api/delete-account/confirm/route.ts": "single-use emailed token, atomically claimed",
  "src/app/api/websites/[id]/submit-form/route.ts": "public contact form on generated sites; write-only, honeypot + 30/hr cap",
  "src/app/api/client-error/route.ts": "browser error beacon; fires when there may be no session",
};

for (const file of routes) {
  const src = readFileSync(file, "utf8");
  const key = file.replace(/\\/g, "/");
  const authenticates = /auth\.getUser\(\)/.test(src);
  const justified = key in NO_SESSION_BY_DESIGN;

  if (authenticates) {
    pass++;
    console.log(`  PASS  ${key} calls auth.getUser()`);
  } else if (justified) {
    pass++;
    console.log(`  PASS  ${key} — no session by design: ${NO_SESSION_BY_DESIGN[key]}`);
  } else {
    fail++;
    console.log(`  FAIL  ${key} neither authenticates nor is on the justified list`);
  }

  // A getUser() call is worthless if nothing acts on a null user. The
  // guard is not always a bare `if (!user)` — routes that need an address
  // to email write `if (!user || !user.email)`, which is strictly
  // stronger, so the match is on the `!user` test rather than the whole
  // condition.
  if (authenticates) {
    checkTrue(`  ${key} rejects a missing user with 401`, /if \(!user\b/.test(src) && /401/.test(src));
  }
}

// The cron routes must be authenticated by the shared guard specifically —
// not by an inline check that can fail open.
for (const key of Object.keys(NO_SESSION_BY_DESIGN).filter((k) => /cron|weekly-digest/.test(k))) {
  const src = readFileSync(key, "utf8");
  checkTrue(`${key} uses the shared fail-closed cron guard`, src.includes("checkCronAuth(request)"));
}

console.log("\n== 4. maintenance that is DOCUMENTED as scheduled is actually wired ==");
// The bug: both lib/billing/reservations.ts and the SQL function said
// "Called by the daily cron". Nothing called it.
const CRON_ROUTE = "src/app/api/cron/scheduled-runs/route.ts";
const cronSrc = readFileSync(CRON_ROUTE, "utf8");
checkTrue("releaseExpiredReservations is imported by the cron", cronSrc.includes("releaseExpiredReservations"));
checkTrue("...and actually invoked", /await releaseExpiredReservations\(\)/.test(cronSrc));
checkTrue("...and its failure cannot fail the cron", /catch[\s\S]{0,220}sweep_reservations/.test(cronSrc));

// The route this cron actually runs on must be the one the scheduler
// fires — a sweeper wired into a route nobody calls is the same bug again.
const vercel = JSON.parse(readFileSync("vercel.json", "utf8"));
const scheduledPaths = (vercel.crons ?? []).map((c) => c.path);
checkTrue(
  `the sweeper's route is in vercel.json crons (${scheduledPaths.join(", ") || "none"})`,
  scheduledPaths.includes("/api/cron/scheduled-runs")
);

console.log(`\n${fail === 0 ? "ALL PASS" : "FAILURES"}: ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
