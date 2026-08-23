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
import { readFileSync, readdirSync, statSync, existsSync } from "node:fs";
import { join } from "node:path";
import { schemaSql } from "./lib/schema-sql.mjs";

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

// Was `supabase_full_project_backup.sql` — a snapshot of one project at
// one moment, which nothing built a database from. supabase/migrations is
// what does, so that is what the posture is measured against.
const sql = schemaSql();

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
// DENY-ALL BY DESIGN: RLS on, no policy, so a user-scoped client sees
// nothing. Every one of these is read and written exclusively through
// createAdminClient(), which section 2 below asserts file by file.
//
// `production_errors` joined the list when this test started reading the
// real migrations instead of a hand-maintained backup snapshot. It was
// always deny-all — supabase/migrations/20260804000001_baseline_gaps.sql
// enables RLS on it and grants no policy — and the two places that touch
// it (the admin-gated /dashboard/system-health page and
// api/system-health/resolve) were always on the admin client. The old
// source simply did not carry the ALTER TABLE, so the check had nothing
// to see.
const ADMIN_ONLY_TABLES = new Set([
  "rate_limit_log",
  "daily_ai_spend_tracking",
  "account_deletion_requests",
  "production_errors",
  // What every customer's spend triggered, with the numbers. RLS on with
  // NO policy is deny-all, which is stricter than any policy could be and
  // is exactly right here: a customer who could read this would learn the
  // shape of the whole business. Written and read only through
  // createAdminClient(), behind an isAdminEmail() gate on the page.
  "cost_alert_log",
  // V4 #26. The owner's view of the business: what every account pays,
  // what the whole book is worth, what it costs to run, and what the
  // owner typed in as marketing spend and cash in the bank. RLS on with
  // NO policy is deny-all — stricter than any policy could be, and the
  // right answer here because "owner" is decided in TypeScript by
  // isAdminEmail() and a second notion of owner living in the database is
  // one more thing to drift out of step with the first. Reached only
  // through createAdminClient(), behind that gate.
  "subscription_events",
  "subscriber_months",
  "revenue_snapshots",
  "business_inputs",
  // V4 #34/#35. Which model served which request, what the customer was
  // charged, and — the column that matters — what OUR failed cheap
  // attempts cost us. Deny-all for the same reason as the four above:
  // "owner" is decided in TypeScript by isAdminEmail(), and a customer
  // who could read it would learn our per-request margin. Reached only
  // through createAdminClient(), behind that gate.
  "routing_decisions",
]);

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

// V3 feature tables, asserted by name for the same reason the module
// tables are: a count that moves tells you nothing about WHICH table lost
// its policies.
const V3_TABLES = [
  "user_agents",
  "agent_runs",
  "published_sites",
  "site_versions",
  "site_analytics",
  "user_integrations",
  "integration_sync_log",
  "user_files",
  "file_collections",
  "file_collection_items",
  "research_reports",
  "user_imports",
  "user_insights",
  "user_onboarding",
];
for (const t of MODULE_TABLES) {
  if (!rlsEnabled.has(t)) {
    fail++;
    console.log(`  FAIL  module table ${t} has no RLS`);
  }
}
check(`all ${MODULE_TABLES.length} module tables have RLS`, MODULE_TABLES.every((t) => rlsEnabled.has(t)), true);
check(`all ${V3_TABLES.length} V3 feature tables have RLS`, V3_TABLES.every((t) => rlsEnabled.has(t)), true);

// RLS with no policy denies everything to anon/authenticated (service_role
// bypasses) — correct for the admin-only tables, a bug for anything else.
const policyTables = new Set(
  [...sql.matchAll(/create policy[^;]*?\son\s+(?:public\.)?"?([a-z_0-9]+)"?/gis)].map((m) => m[1])
);
for (const t of [...MODULE_TABLES, ...V3_TABLES]) {
  checkTrue(`${t} has at least one policy`, policyTables.has(t) || loopRls.has(t));
}

// agent_runs is READ-ONLY to its owner by design: only the service-role
// client writes run history. A user who could insert here could fabricate
// runs; one who could delete could hide a run they were charged for.
const agentRunsPolicies = [...sql.matchAll(/create policy[^;]*?\son\s+(?:public\.)?"?agent_runs"?[^;]*/gis)].map(
  (m) => m[0]
);
checkTrue(`agent_runs has exactly one policy (${agentRunsPolicies.length})`, agentRunsPolicies.length === 1);
checkTrue("...and it is select-only", /for select/i.test(agentRunsPolicies[0] ?? ""));

// site_analytics is read-only to its owner for the same reason: only the
// public serving route writes counts, through the service-role client.
const analyticsPolicies = [...sql.matchAll(/create policy[^;]*?\son\s+(?:public\.)?"?site_analytics"?[^;]*/gis)].map(
  (m) => m[0]
);
checkTrue(`site_analytics has exactly one policy (${analyticsPolicies.length})`, analyticsPolicies.length === 1);
checkTrue("...and it is select-only", /for select/i.test(analyticsPolicies[0] ?? ""));

// integration_sync_log is the user-facing audit trail of what the AI read
// from their mail and files. A user-writable audit trail is not an audit
// trail, so it is select-only for exactly the same reason agent_runs is.
const syncLogPolicies = [
  ...sql.matchAll(/create policy[^;]*?\son\s+(?:public\.)?"?integration_sync_log"?[^;]*/gis),
].map((m) => m[0]);
checkTrue(`integration_sync_log has exactly one policy (${syncLogPolicies.length})`, syncLogPolicies.length === 1);
checkTrue("...and it is select-only", /for select/i.test(syncLogPolicies[0] ?? ""));

// The tables holding third-party OAuth tokens must be reachable ONLY by
// their owner. A policy here that was not scoped to auth.uid() would hand
// every stored Gmail grant to anyone with the anon key, which ships in the
// client bundle.
const integrationPolicies = [
  ...sql.matchAll(/create policy[^;]*?\son\s+(?:public\.)?"?user_integrations"?[^;]*/gis),
].map((m) => m[0]);
checkTrue(`user_integrations has policies (${integrationPolicies.length})`, integrationPolicies.length >= 1);
checkTrue(
  "...and every one is scoped to auth.uid()",
  integrationPolicies.every((p) => /auth\.uid\(\) = user_id/.test(p))
);
// The columns are ciphertext, and the schema must keep saying so: a column
// renamed to `access_token` would be a plaintext-shaped invitation.
checkTrue(
  "the token columns are named as ciphertext",
  /access_token_encrypted/.test(sql) && /refresh_token_encrypted/.test(sql)
);
checkTrue("...and no plaintext token column exists", !/\baccess_token text\b/.test(sql));

// The File Workspace holds the most sensitive objects this product
// touches — contracts, payroll, medical letters. Three things must stay
// true, and each has been a real bug in some product at some point:
//   1. every policy is scoped to the owner;
//   2. the bucket is PRIVATE (a public bucket makes every RLS policy
//      above it decorative, because the object URL bypasses the table);
//   3. account deletion clears the OBJECTS, which nothing cascades.
const filePolicies = [...sql.matchAll(/create policy[^;]*?\son\s+(?:public\.)?"?user_files"?[^;]*/gis)].map(
  (m) => m[0]
);
checkTrue(`user_files has policies (${filePolicies.length})`, filePolicies.length >= 1);
checkTrue(
  "...and every one is scoped to auth.uid()",
  filePolicies.every((p) => /auth\.uid\(\) = user_id/.test(p))
);
const bucketInsert = /insert into storage\.buckets[^;]*'user-files'[^;]*;/is.exec(sql)?.[0] ?? "";
checkTrue("the user-files bucket is declared", bucketInsert.length > 0);
checkTrue("...and it is PRIVATE", /,\s*false\s*\)/.test(bucketInsert));
// `on conflict do update set public = false` is what makes a bucket that
// was flipped public in the dashboard get CORRECTED by running the
// schema, rather than silently left open.
checkTrue("...and re-running the schema forces it private again", /on conflict[^;]*public\s*=\s*false/is.test(bucketInsert));
const objectPolicies = [
  ...sql.matchAll(/create policy[^;]*?\son\s+storage\.objects[^;]*/gis),
].map((m) => m[0]).filter((p) => p.includes("user-files"));
checkTrue(`the bucket's own object policies exist (${objectPolicies.length})`, objectPolicies.length >= 3);
checkTrue(
  "...and every one matches the owner's folder",
  objectPolicies.every((p) => /auth\.uid\(\)::text = \(storage\.foldername\(name\)\)\[1\]/.test(p))
);

// V3 Task 16 (Instant Value). Two things must stay true here, and both
// are about a flag that decides whether real money is spent for free.
//
//   1. `user_insights` has NO delete policy. An insight is DISMISSED,
//      not erased: the row records that a claim was made about somebody's
//      business and what numbers it rested on, and a user who could
//      delete it could also make a wrong claim unanswerable.
//   2. The free activation run is claimed by a CONDITIONAL UPDATE in the
//      database, granted only to service_role. A read-then-write in
//      application code would hand two requests the same free run, and
//      the user owns their user_onboarding row, so the flag has to be out
//      of their reach even though the row is not.
const insightPolicies = [...sql.matchAll(/create policy[^;]*?\son\s+(?:public\.)?"?user_insights"?[^;]*/gis)].map(
  (m) => m[0]
);
checkTrue(`user_insights has policies (${insightPolicies.length})`, insightPolicies.length >= 1);
checkTrue(
  "...every one scoped to auth.uid()",
  insightPolicies.every((p) => /auth\.uid\(\) = user_id/.test(p))
);
checkTrue(
  "...and none of them is a delete policy",
  insightPolicies.every((p) => !/for delete/i.test(p))
);

const claimFn = /create or replace function public\.claim_activation_run[\s\S]*?\$\$;/i.exec(sql)?.[0] ?? "";
checkTrue("the activation claim is a database function", claimFn.length > 0);
checkTrue("...that is security definer", /security definer/i.test(claimFn));
// The `where activation_used_at is null` is what makes it exactly-once.
checkTrue("...and claims conditionally, not by read-then-write", /activation_used_at is null/i.test(claimFn));
checkTrue(
  "...and is granted ONLY to service_role",
  /grant execute on function public\.claim_activation_run\(uuid\) to service_role/i.test(sql) &&
    /revoke all on function public\.claim_activation_run\(uuid\) from authenticated/i.test(sql)
);
// The route that records onboarding progress must never write the
// billing flag, even though the user owns that row.
const onboardingRoute = readFileSync("src/app/api/onboarding/route.ts", "utf8");
checkTrue(
  "the onboarding route never sets activation_used_at",
  !/activation_used_at\s*[:=]/.test(onboardingRoute)
);

// The importer stamps user_id from the SESSION and drops any that came
// in on the row. The rows originate from a model's output and a user's
// file, and neither gets a say in whose account they land in.
const applySrc = readFileSync("src/lib/import/apply.ts", "utf8");
checkTrue("imported rows are stamped with the session user", /user_id: userId/.test(applySrc));
checkTrue(
  "...through a field allowlist, so an incoming user_id cannot survive",
  /allowedKeys\.has\(key\)/.test(applySrc)
);

// Formula injection. The export path is where a stored payload actually
// executes, so the defence has to be there and not only on import.
const csvExport = readFileSync("src/lib/csv.ts", "utf8");
checkTrue("the CSV export defuses formula cells", /neutraliseFormula/.test(csvExport));

// published_sites must NOT be publicly readable. The anon key is printed
// in the client bundle, so a "true" select policy here would hand every
// site row — user_id included — to anyone who asked.
const publishedPolicies = [...sql.matchAll(/create policy[^;]*?\son\s+(?:public\.)?"?published_sites"?[^;]*/gis)].map(
  (m) => m[0]
);
checkTrue(`published_sites has policies (${publishedPolicies.length})`, publishedPolicies.length >= 1);
checkTrue(
  "...and every one of them is scoped to auth.uid()",
  publishedPolicies.every((p) => /auth\.uid\(\) = user_id/.test(p))
);

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
// EVERY route handler in the app, not just the ones under /api. The public
// site route added by V3 Task 2 lives at src/app/s/[subdomain]/route.ts and
// would have been invisible to a scan of src/app/api alone — which is
// precisely the kind of route that most needs to be on a justified list.
const routes = walk("src/app").filter((f) => f.endsWith("route.ts"));
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
  "src/app/api/cron/agent-runs/route.ts": "authenticated by CRON_SECRET (lib/cron-auth.ts); executes every due Autonomous Agent, so it spends real money on many accounts per call",
  "src/app/api/cron/affiliate-payouts/route.ts":
    "authenticated by CRON_SECRET (lib/cron-auth.ts); moves real money to affiliates' Stripe Connect accounts, so the claim of accrued commissions is atomic (claim_affiliate_commissions) and each transfer carries an idempotency key",
  "src/app/r/[code]/route.ts":
    "the affiliate share link. The visitor is a stranger by definition — requiring a session would defeat the only thing the URL is for. It touches NO database (so a million hits write nothing), never validates the code against the table (which would make it an oracle for enumerating real codes), and always redirects to /signup rather than anywhere the code asks for.",
  "src/app/api/weekly-digest/route.ts": "authenticated by CRON_SECRET (lib/cron-auth.ts)",
  "src/app/api/cron/monthly-credits/route.ts":
    "authenticated by CRON_SECRET (lib/cron-auth.ts); grants every annual subscriber their monthly credit allowance, so it moves real entitlement across many accounts per call",
  "src/app/api/delete-account/confirm/route.ts": "single-use emailed token, atomically claimed",
  "src/app/api/websites/[id]/submit-form/route.ts": "public contact form on generated sites; write-only, honeypot + 30/hr cap",
  "src/app/api/client-error/route.ts": "browser error beacon; fires when there may be no session",
  "src/app/api/health/route.ts":
    "the uptime probe, and the one route whose intended caller IS a stranger: an external monitor has no session, and a health check behind auth monitors the auth rather than the app. It returns up-or-down and nothing else — no version, no counts, no table names, no error text. Its single query reads one column of one row of agent_templates, the public catalogue of starter agents, so the row it touches discloses nothing about any account even in principle. It is not rate-limited and that is deliberate: checkRateLimit is itself a database round trip, so it would double the cost it bounds, and a monitor handed a 429 records an outage that did not happen. Instead the probe result is cached in process for five seconds, which collapses a flood to one query per five seconds per instance while keeping the answer fresher than any monitor's polling interval.",
  "src/app/auth/callback/route.ts":
    "the OAuth/magic-link landing. It CREATES the session by exchanging a single-use code — requiring one first is a contradiction. Surfaced by widening this scan beyond src/app/api; it was never checked before, and reading it line by line confirmed everything after the exchange acts on the user that exchange returned, never on an id from the request.",
  "src/app/s/[subdomain]/route.ts":
    "the public web: serves a published site to anonymous visitors. Reads through the admin client and selects only the columns a visitor needs; published_sites has no public RLS policy, so a visitor cannot read the table at all. In-memory rate limited, and every response carries a restrictive CSP.",
  "src/app/s/[subdomain]/[page]/route.ts":
    "the same public site, one page further in. Identical posture to the parent route — admin client, named columns, rate limit, CSP — with one addition that is the reason this exists separately: the page segment is a URL path, so it goes through validatePageSlug BEFORE any lookup. The slug must match ^[a-z0-9]+(-[a-z0-9]+)*$, which rejects ../admin, a/b, %2e%2e and a leading dot on SHAPE rather than by reasoning about path semantics — a rule written as 'does not contain ..' falls to encoding, and one written on the decoded string falls to double encoding. An unknown slug is a 404, never a fallback to the home page, so a crawler is not told that every URL under the site exists.",
  "src/app/api/cron/website-storage-cleanup/route.ts":
    "authenticated by CRON_SECRET (lib/cron-auth.ts), which fails CLOSED. It DELETES from Storage, which is the one operation in this app that cannot be undone — so the decision about what may go lives in lib/websites/orphan-images.ts, is pure, and is tested without deleting anything: a file is removed only when no document embeds it, no surviving website row names it, it is not the derivative of something still referenced, and it is over a day old (an upload in flight is referenced by nothing at all in the window between the browser storing it and generate using it).",
  "src/app/api/cron/agent-batches/route.ts":
    "authenticated by CRON_SECRET (lib/cron-auth.ts), which fails CLOSED. It collects Anthropic Batch API results for scheduled agent runs and SETTLES the charge for each one, so an unauthenticated call would take money from other people's accounts and deliver their agents' output. It reads no request body: everything it acts on is rows it finds in agent_runs with status 'queued'.",
  "src/app/api/cron/cost-alerts/route.ts":
    "authenticated by CRON_SECRET (lib/cron-auth.ts), which fails CLOSED — with no secret configured the route refuses to run on any deployment. It reads aggregates across every account's spend and can send email, so it is in the same class as the other cron routes and not a lighter one.",
  "src/app/s/[subdomain]/sitemap.xml/route.ts":
    "the public site's own sitemap, for its owner to submit to Search Console. Same posture as the routes above — admin client, rate limit, subdomain validated before any lookup — and it selects only `pages, status, is_active, updated_at`: the page SLUGS and a timestamp, never html_content, so nothing about a site's contents is reachable here that /s/<subdomain>/<page> does not already serve publicly. A site that is not live is a 404 rather than an empty sitemap, so this cannot be used to learn that a withdrawn address once existed.",
  "src/app/s/[subdomain]/robots.txt/route.ts":
    "the same, for robots.txt. It reads only `status, is_active` and returns a fixed two-line file built from the address in the request — it discloses nothing that requesting the site itself does not. Worth stating plainly: a crawler reads robots.txt from the HOST ROOT, so while sites are served at /s/<subdomain> the file that actually governs them is the app's own /robots.txt; this one exists for Search Console and for the day a wildcard domain makes it the root file.",
};

// Routes a BROWSER navigates to, rather than fetches. Their rejection is a
// redirect, not a status code — see the check below.
const REJECTS_BY_REDIRECT = {
  "src/app/share/route.ts":
    "the Web Share Target: the operating system POSTs a form here and the browser follows the answer",
  "src/app/api/n/[id]/route.ts":
    "the notification click: somebody followed a link from their email, and JSON in the address bar is a dead end",
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
  //
  // WHAT THE REJECTION MAY BE, and why this is two shapes rather than one.
  // Almost every route here is called by fetch() and answers 401. A route
  // the BROWSER navigates to cannot: a 401 JSON body in the address bar is
  // a dead end for somebody who clicked a link in their email or chose
  // Ionexa from a share sheet, and the correct answer is to send them to
  // log in. So a redirect whose target is the login page counts as a
  // rejection too. Two such routes exist: /api/n/<id> (the notification
  // click redirect) and /share (the Web Share Target, which receives a
  // real form POST from the operating system).
  //
  // AND THE REJECTION MUST BE IN THE GUARD. The old form was
  // `/if \(!user\b/.test(src) && /401/.test(src)` — the two halves tested
  // independently, anywhere in the file, so a route with a `!user` guard
  // that fell through and a 401 two hundred lines later for an unrelated
  // reason passed. The span after the guard is what is searched now, which
  // is strictly narrower: every route that passed on merit still passes,
  // and one that passed by coincidence no longer does.
  if (authenticates) {
    const guard = src.match(/if \(!user\b[^)]*\)\s*\{?([\s\S]{0,400})/);
    const rejection = guard ? guard[1] : "";
    checkTrue(
      `  ${key} rejects a missing user in the guard (401, or a redirect to login)`,
      Boolean(guard) && (/401/.test(rejection) || /\/login/.test(rejection))
    );
    // AND, for the routes that reject by redirect, that they really do —
    // the generic rule above accepts either shape, so without this a
    // navigation route could silently start answering 401 and nobody
    // would notice until a user was staring at JSON.
    if (key in REJECTS_BY_REDIRECT) {
      checkTrue(
        `  ${key} rejects by SENDING THEM TO SIGN IN, not with JSON (${REJECTS_BY_REDIRECT[key]})`,
        /\/login/.test(rejection)
      );
    }
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

// Same rule, applied to the V3 Task 3 addition the moment it shipped: the
// integrations audit trail is pruned by an RPC whose own comment says the
// daily cron calls it. This asserts that it does.
checkTrue(
  "prune_integration_sync_log is actually invoked by the cron",
  /rpc\("prune_integration_sync_log"\)/.test(cronSrc)
);
checkTrue(
  "...and its failure cannot fail the cron",
  /catch[\s\S]{0,260}prune_integration_sync_log/.test(cronSrc)
);

// Same rule for erasure: storage.objects has no FK to auth.users, so the
// only thing that removes a deleted account's uploaded files is this RPC
// being called. A function that exists and is never invoked would leave
// every deleted user's documents in the bucket.
const DELETE_ROUTE = "src/app/api/delete-account/confirm/route.ts";
const deleteSrc = readFileSync(DELETE_ROUTE, "utf8");
checkTrue(
  "account deletion clears the user's file objects",
  /rpc\("delete_user_file_objects"/.test(deleteSrc)
);
// ...and BEFORE the auth user is deleted, so a failure is still
// attributable to an account that exists.
checkTrue(
  "...before the auth user is deleted",
  deleteSrc.indexOf('delete_user_file_objects') < deleteSrc.indexOf("admin.deleteUser")
);

// The route this cron actually runs on must be the one the scheduler
// fires — a sweeper wired into a route nobody calls is the same bug again.
const vercel = JSON.parse(readFileSync("vercel.json", "utf8"));
const scheduledPaths = (vercel.crons ?? []).map((c) => c.path);
checkTrue(
  `the sweeper's route is in vercel.json crons (${scheduledPaths.join(", ") || "none"})`,
  scheduledPaths.includes("/api/cron/scheduled-runs")
);
// Same rule for the agent engine: agents that are never executed are the
// whole feature failing silently, and nothing in the app would say so.
checkTrue(
  "the Autonomous Agents engine is scheduled in vercel.json",
  scheduledPaths.includes("/api/cron/agent-runs")
);

console.log("\n== 5. SECURITY.md describes gates that actually exist ==");
// The same rule as section 4, turned on the documentation itself. A
// SECURITY.md that names a gate which was renamed or deleted is worse
// than no SECURITY.md: it tells the next person a rule is enforced when
// nothing enforces it, which is exactly the failure the "documentation
// is not wiring" section above exists to catch.
const securityDoc = readFileSync("SECURITY.md", "utf8");
const namedGates = [...new Set([...securityDoc.matchAll(/`?(?:scripts\/tests\/)?([a-z0-9-]+\.test\.mjs|check-i18n\.js)`?/g)].map((m) => m[1]))];
checkTrue(`SECURITY.md names its gates (${namedGates.length})`, namedGates.length >= 5);
for (const gate of namedGates) {
  const path = gate === "check-i18n.js" ? "scripts/check-i18n.js" : `scripts/tests/${gate}`;
  checkTrue(`the gate SECURITY.md names exists: ${path}`, existsSync(path));
}
// And the six lettered rules are all still present, so a section cannot
// be quietly dropped while the file still looks complete.
for (const heading of ["## α.", "## β.", "## γ.", "## δ.", "## ε.", "## στ.", "## ζ."]) {
  checkTrue(`SECURITY.md still has ${heading}`, securityDoc.includes(heading));
}

console.log(`\n${fail === 0 ? "ALL PASS" : "FAILURES"}: ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
