// WHAT AN ACCOUNT PAYS FOR IS DECIDED BY THE SERVER (BUILD-SPECS 6, Α1 and
// Α4; the security round of 2026-10-05).
//
// The checks name what was fixed, not how it could be abused: the
// repository is public (BUILD-SPECS 6, «ΠΩΣ ΔΟΥΛΕΥΕΙΣ ΕΔΩ»).
//
//   1. Every entitlement key the billing code reads from user_metadata is
//      on the list supabase/migrations/20261010000000_guard_entitlement_metadata.sql
//      keeps for the server. The population is the code's own reads.
//   2. Signup writes the starting plan through the server's merge, not
//      through Supabase Auth (which the migration now fences).
//   3. The beta invite code exists only when the environment sets one.
//   4. Overage can be switched on only by a subscriber.
//   5. A recurring add-on never overwrites the plan.
//   6. Ownership checks where the admin client reads by an id or a path
//      that came from a user's own row or request.
//   7. The app sends its own security headers.
//   8. The internal hand-off secret is compared in constant time.
//   9. A research report is written by the server only: the migration
//      takes INSERT and UPDATE from the account, and every write in src/
//      goes through the admin client.
//  10. The cost log and the provider log are read by the server only: the
//      migration takes SELECT from the account, and every read in src/
//      goes through the admin client.
//  11. A job's and a report's cost columns are read by the server only: the
//      migration grants the account exactly the lists in
//      src/lib/billing/client-columns.ts, every column the migrations give
//      either table is on one of its two lists, and no read through the
//      user's client asks for `*`.
//  12. Team invites, file rows and published pages are written by the
//      server only: the migration takes the three verbs from the account,
//      and every write in src/ goes through the admin client.
//  13. Agents and sites likewise: no insert or update of either through
//      the user's client, every site update scoped by user_id as well as
//      id, and the only user-client write left is the builder's delete.
//  14. A project is created by the server only, after the plan's project
//      cap, and a published site's history is written by the server only
//      (2026-10-08, ΑΣ-4.11 and ΑΣ-1.14): the migration takes the verbs
//      from the account, every such write in src/ goes through the admin
//      client with the session's user, and the history delete is scoped
//      to the caller.
//
// The behaviour of the migration itself is run against a real Postgres by
// scripts/tests/entitlement-metadata.dbtest.mjs, and that of the research
// migration by scripts/tests/research-reports-writes.dbtest.mjs, and the
// cost-log one by scripts/tests/cost-log-reads.dbtest.mjs, and the
// cost-column one by scripts/tests/cost-columns.dbtest.mjs, and the
// three-table one by scripts/tests/server-written-tables.dbtest.mjs.
//
// Run: node scripts/tests/entitlement-trust.test.mjs
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";

let pass = 0;
const failures = [];
const ok = (name, cond, detail) => {
  if (cond) { pass++; console.log(`  PASS  ${name}`); }
  else { failures.push(name); console.log(`  FAIL  ${name}${detail !== undefined ? "\n        " + detail : ""}`); }
};
const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
const read = (p) => strip(readFileSync(p, "utf8"));

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const p = path.join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.(ts|tsx)$/.test(name)) out.push(p);
  }
  return out;
}

// =====================================================================
console.log("\n== 1. every entitlement key the billing code reads is the server's ==");
// =====================================================================
const MIGRATION = readFileSync("supabase/migrations/20261010000000_guard_entitlement_metadata.sql", "utf8");
const listed = new Set([...(MIGRATION.match(/protected constant text\[\] := array\[([\s\S]*?)\];/)?.[1] ?? "").matchAll(/'([a-z_]+)'/g)].map((m) => m[1]));
// Where billing decisions are made: plans, credits, checkout, the portal,
// the team, the crons, beta, deletion.
const BILLING_DIRS = ["src/lib/billing", "src/lib/team", "src/app/api/billing", "src/app/api/billing-portal", "src/app/api/checkout", "src/app/api/credits", "src/app/api/team", "src/app/api/cron", "src/app/api/delete-account"];
const BILLING_FILES = ["src/lib/beta.ts", ...BILLING_DIRS.flatMap((d) => walk(d))];
const read_keys = new Set();
for (const f of BILLING_FILES) {
  for (const m of read(f).matchAll(/user_metadata\??\.([a-z_]+)/g)) read_keys.add(m[1]);
}
ok("the scan found the billing code's reads", read_keys.size >= 6 && BILLING_FILES.length >= 30, `${read_keys.size} keys over ${BILLING_FILES.length} files`);
const unguarded = [...read_keys].filter((k) => !listed.has(k));
ok("every one is on the server-only list", unguarded.length === 0, `not guarded: ${unguarded.join(", ")}`);
ok("the guard fences Supabase Auth's own role", /if current_user <> 'supabase_auth_admin' then\s+return new;/.test(MIGRATION));
ok("it runs as the caller, so the role it sees is real", /security invoker/.test(MIGRATION) && !/security definer/.test(MIGRATION.split("create or replace function public.guard_entitlement_metadata")[1].split("$$;")[0]));

// =====================================================================
console.log("\n== 2. signup writes the starting plan through the server ==");
// =====================================================================
const SIGNUP = read("src/app/api/signup/route.ts");
const createUserMeta = SIGNUP.match(/admin\.auth\.admin\.createUser\(\{[\s\S]*?user_metadata: \{([\s\S]*?)\},\s*\}\);/)?.[1] ?? null;
ok("the createUser call was found", createUserMeta !== null);
ok("it asks Supabase Auth for no entitlement key", createUserMeta !== null && ![...listed].some((k) => createUserMeta.includes(k)), createUserMeta ?? "");
ok(
  "the plan, the seats and the beta flag are merged by the server after it",
  /mergeUserMetadata\(\s*createData\.user\.id,\s*\{\s*subscription_tier: isValidBetaCode \? "ultimate" : "free",\s*seat_count: 0,/.test(SIGNUP)
);

// =====================================================================
console.log("\n== 3. no beta code unless the environment sets one ==");
// =====================================================================
// beta.ts imports the admin client, which the TS loader does not stub, so
// the function is read rather than run; the read is narrow enough to need
// no running: it returns the trimmed variable or null, and nothing else.
const BETA = read("src/lib/beta.ts");
const betaFn = BETA.slice(BETA.indexOf("export function getBetaInviteCode"), BETA.indexOf("export function computeBetaExpiresAt"));
ok("the code is the environment's or nothing", /const code = process\.env\.BETA_INVITE_CODE\?\.trim\(\);\s*return code \? code : null;/.test(betaFn), betaFn);
ok("no literal code anywhere in the function", !/["'`][A-Z0-9]{4,}["'`]/.test(betaFn) && !/\|\|/.test(betaFn));
ok("signup refuses every code when none is set", /const isValidBetaCode = Boolean\(betaCode && inviteCode && inviteCode === betaCode\);/.test(SIGNUP));

// =====================================================================
console.log("\n== 4. overage only for a subscriber ==");
// =====================================================================
const OVERAGE = read("src/app/api/billing/overage/route.ts");
const post = OVERAGE.slice(OVERAGE.indexOf("export async function POST"));
const refuse = post.indexOf('if (!isSubscriber) return NextResponse.json({ error: "needs_subscription" }, { status: 403 });');
ok("switching overage on refuses an account with no subscription", refuse > 0);
ok("...before anything is saved", refuse > 0 && refuse < post.indexOf("enableOverage("));
ok("...and a subscription means a customer and a subscription id", /typeof meta\.stripe_customer_id === "string" && meta\.stripe_customer_id\.length > 0 &&\s*typeof meta\.stripe_subscription_id === "string" && meta\.stripe_subscription_id\.length > 0/.test(post));

// =====================================================================
console.log("\n== 5. an add-on never overwrites the plan ==");
// =====================================================================
const WEBHOOK = read("src/app/api/webhooks/stripe/route.ts");
const sync = WEBHOOK.slice(WEBHOOK.indexOf("async function syncSubscriptionToUser"));
const skip = sync.indexOf("if (subscription.metadata?.addon_slug) return;");
ok("the plan sync returns on an add-on subscription", skip > 0);
ok("...before it resolves a plan from the price", skip > 0 && skip < sync.indexOf("mergeUserMetadata("));

// =====================================================================
console.log("\n== 6. the admin client reads only what is the account's own ==");
// =====================================================================
const CRON = read("src/app/api/cron/scheduled-runs/route.ts");
ok(
  "a scheduled run whose mission is someone else's is refused",
  /if \(missionError \|\| !mission \|\| \(mission as \{ user_id\?: string \}\)\.user_id !== run\.user_id\) \{/.test(CRON)
);
const CREATE_JOB = read("src/lib/jobs/handlers/create.ts");
ok(
  "attachment paths are filtered to the account's folder before the admin download",
  /const ownPaths = imagePaths\.filter\(\(p\) => p\.startsWith\(`\$\{ctx\.userId\}\/`\) && !p\.includes\("\.\."\)\);/.test(CREATE_JOB) &&
    /downloadAttachmentImages\(admin, ownPaths,/.test(CREATE_JOB) &&
    !/downloadAttachmentImages\(admin, imagePaths,/.test(CREATE_JOB)
);

// =====================================================================
console.log("\n== 7. the app's own security headers ==");
// =====================================================================
const config = await import(path.resolve("next.config.mjs"));
const headers = Object.fromEntries((config.APP_SECURITY_HEADERS ?? []).map((h) => [h.key, h.value]));
ok("framing refused", headers["X-Frame-Options"] === "DENY" && /frame-ancestors 'none'/.test(headers["Content-Security-Policy"] ?? ""));
ok("no content-type guessing", headers["X-Content-Type-Options"] === "nosniff");
ok("a referrer policy and a permissions policy", Boolean(headers["Referrer-Policy"]) && /camera=\(\)/.test(headers["Permissions-Policy"] ?? ""));
const resolved = await config.default.headers();
ok("applied to every path but the published sites", resolved.length === 1 && resolved[0].source === "/((?!s/).*)" && resolved[0].headers === config.APP_SECURITY_HEADERS);
ok("the framework is not announced", config.default.poweredByHeader === false);

// =====================================================================
console.log("\n== 8. the internal hand-off secret, in constant time ==");
// =====================================================================
for (const f of ["src/app/api/jobs/[id]/continue/route.ts", "src/app/api/research/[id]/continue/route.ts"]) {
  const s = read(f);
  ok(`${f}: compared with secretsMatch`, /secretsMatch\(presented, expected\)/.test(s) && !/presented === expected/.test(s));
}

// =====================================================================
console.log("\n== 9. a research report is written by the server only ==");
// =====================================================================
const RESEARCH_MIGRATION = readFileSync("supabase/migrations/20261011000000_research_reports_server_writes.sql", "utf8");
ok(
  "the account loses INSERT and UPDATE on research_reports",
  /revoke insert, update on public\.research_reports from authenticated;/.test(strip(RESEARCH_MIGRATION.replace(/--.*$/gm, ""))) &&
    /drop policy if exists "insert_own_research_reports"/.test(RESEARCH_MIGRATION) &&
    /drop policy if exists "update_own_research_reports"/.test(RESEARCH_MIGRATION)
);
// The population is every write to the table anywhere in src/.
const researchWrites = [];
for (const f of walk("src")) {
  for (const m of read(f).matchAll(/([\w.]+(?:\(\))?)\s*\.from\(\s*"research_reports"\s*\)\s*\.(insert|update|upsert)\(/g)) {
    researchWrites.push({ file: f, receiver: m[1] });
  }
}
ok("the scan found the writes", researchWrites.length >= 15, `${researchWrites.length} writes`);
const userClientWrites = researchWrites.filter((w) => !["admin", "createAdminClient()"].includes(w.receiver));
ok(
  "every one goes through the admin client",
  userClientWrites.length === 0,
  userClientWrites.map((w) => `${w.file}: ${w.receiver}`).join("\n        ")
);

// =====================================================================
console.log("\n== 10. the cost log and the provider log are read by the server only ==");
// =====================================================================
const COST_MIGRATION = strip(readFileSync("supabase/migrations/20261012000000_cost_log_server_reads.sql", "utf8").replace(/--.*$/gm, ""));
ok(
  "the account loses SELECT on both",
  /revoke select on public\.ai_cost_log from anon, authenticated;/.test(COST_MIGRATION) &&
    /revoke select on public\.ai_provider_log from anon, authenticated;/.test(COST_MIGRATION) &&
    /drop policy if exists "select_own_ai_cost_log"/.test(COST_MIGRATION) &&
    /drop policy if exists "ai_provider_log_select_own"/.test(COST_MIGRATION)
);
// The population is every direct read of either table anywhere in src/.
const costReads = [];
for (const f of walk("src")) {
  for (const m of read(f).matchAll(/([\w.]+(?:\(\))?)\s*\.from\(\s*"(ai_cost_log|ai_provider_log)"\s*\)/g)) {
    costReads.push({ file: f, receiver: m[1], table: m[2] });
  }
}
ok("the scan found the reads", costReads.length >= 10, `${costReads.length} reads`);
const userClientReads = costReads.filter((r) => !["admin", "createAdminClient()"].includes(r.receiver));
ok(
  "every one goes through the admin client",
  userClientReads.length === 0,
  userClientReads.map((r) => `${r.file}: ${r.receiver} -> ${r.table}`).join("\n        ")
);
const REGISTRY = read("src/lib/gdpr/user-data-registry.ts");
ok(
  "the export reads them by the server, without cost, margin or model columns",
  /table: "ai_cost_log",[\s\S]{0,120}serverExportColumns: \["id", "feature", "credits_charged", "created_at"\]/.test(REGISTRY) &&
    /table: "ai_provider_log",[\s\S]{0,120}serverExportColumns: \["id", "created_at", "purpose", "outcome"\]/.test(REGISTRY) &&
    /t\.serverExportColumns\s*\?\s*createAdminClient\(\)\.from\(t\.table\)\.select\(t\.serverExportColumns\.join\(", "\)\)/.test(read("src/app/api/account/export/route.ts"))
);

// =====================================================================
console.log("\n== 11. a job's and a report's cost columns are read by the server only ==");
// =====================================================================
{
  const COLS = read("src/lib/billing/client-columns.ts");
  const list = (name) => (COLS.match(new RegExp(`${name} =\\s*"([^"]+)"`))?.[1] ?? "").split(",").map((c) => c.trim()).filter(Boolean);
  const arr = (name) => [...(COLS.match(new RegExp(`${name} = \\[([^\\]]*)\\]`))?.[1] ?? "").matchAll(/"([a-z_]+)"/g)].map((m) => m[1]);
  const MIG = strip(readFileSync("supabase/migrations/20261013000000_cost_columns_server_only.sql", "utf8").replace(/--.*$/gm, ""));
  const granted = (table) => (MIG.match(new RegExp(`grant select \\(([^)]*)\\) on public\\.${table} to authenticated;`))?.[1] ?? "").split(",").map((c) => c.trim()).filter(Boolean);
  const same = (a, b) => a.length > 0 && JSON.stringify([...a].sort()) === JSON.stringify([...b].sort());

  // The population: every column the migrations give each table.
  const migrationColumns = (table) => {
    const cols = new Set();
    for (const f of readdirSync("supabase/migrations").filter((n) => n.endsWith(".sql"))) {
      const sql = readFileSync(path.join("supabase/migrations", f), "utf8").replace(/--.*$/gm, "");
      const body = sql.match(new RegExp(`create table if not exists public\\.${table} \\(([\\s\\S]*?)\\n\\);`))?.[1];
      if (body) for (const m of body.matchAll(/^\s*([a-z_]+)\s+[a-z]/gm)) if (!/^(primary|unique|constraint|check|foreign)$/.test(m[1])) cols.add(m[1]);
      for (const m of sql.matchAll(new RegExp(`alter table (?:if exists )?public\\.${table}[\\s\\S]*?;`, "g"))) {
        for (const c of m[0].matchAll(/add column if not exists ([a-z_]+)/g)) cols.add(c[1]);
      }
    }
    return [...cols];
  };

  for (const [table, client, server] of [
    ["ai_jobs", list("JOB_CLIENT_COLUMNS"), arr("JOB_SERVER_ONLY_COLUMNS")],
    ["research_reports", list("RESEARCH_CLIENT_COLUMNS"), arr("RESEARCH_SERVER_ONLY_COLUMNS")],
  ]) {
    ok(`${table}: the migration grants exactly the client list`, same(granted(table), client), `migration: ${granted(table).join(", ")}`);
    ok(`${table}: the client list holds no server-only column`, server.length >= 2 && !server.some((c) => client.includes(c)));
    const all = migrationColumns(table);
    const unplaced = all.filter((c) => !client.includes(c) && !server.includes(c));
    ok(
      `${table}: every column the migrations create is on one of the two lists (${all.length} columns)`,
      all.length >= 18 && unplaced.length === 0,
      `not placed: ${unplaced.join(", ")}`
    );
  }
  ok("the account loses table-wide SELECT on both", /revoke select on public\.ai_jobs from anon, authenticated;/.test(MIG) && /revoke select on public\.research_reports from anon, authenticated;/.test(MIG));

  // No read through the user's client asks either table for `*`.
  const tableReads = [];
  for (const f of walk("src")) {
    for (const m of read(f).matchAll(/([\w.]+(?:\(\))?)\s*\.from\(\s*"(ai_jobs|research_reports)"\s*\)\s*\.select\(\s*("\*"|[A-Z_]+|"[^"]*")/g)) {
      tableReads.push({ file: f, receiver: m[1], table: m[2], columns: m[3] });
    }
  }
  ok("the scan found the reads of both tables", tableReads.length >= 15, `${tableReads.length} reads`);
  const starReads = tableReads.filter((r) => r.columns === '"*"' && !["admin", "createAdminClient()"].includes(r.receiver));
  ok("no read through the user's client asks for `*`", starReads.length === 0, starReads.map((r) => `${r.file}: ${r.receiver} -> ${r.table}`).join("\n        "));
}

// =====================================================================
console.log("\n== 12. team invites, file rows and published pages are written by the server only ==");
// =====================================================================
{
  const MIG = strip(readFileSync("supabase/migrations/20261014000000_server_written_tables.sql", "utf8").replace(/--.*$/gm, ""));
  const TABLES = ["team_members", "user_files", "published_sites"];
  for (const t of TABLES) {
    ok(
      `${t}: the account loses INSERT, UPDATE and DELETE`,
      new RegExp(`revoke insert, update, delete on public\\.${t} from anon, authenticated;`).test(MIG) &&
        ["insert", "update", "delete"].every((v) => MIG.includes(`drop policy if exists "${v}_own_${t}" on public.${t};`))
    );
  }
  // The population: every write to the three tables anywhere in src/.
  const writes = [];
  for (const f of walk("src")) {
    for (const m of read(f).matchAll(/([\w.]+(?:\(\))?)\s*\.from\(\s*"(team_members|user_files|published_sites)"\s*\)\s*\.(insert|update|upsert|delete)\(/g)) {
      writes.push({ file: f, receiver: m[1], table: m[2], verb: m[3] });
    }
  }
  ok("the scan found the writes", writes.length >= 9, `${writes.length} writes`);
  // The files diagnostic writes through the user's client ON PURPOSE: its
  // check 4 requires that insert to be refused, and removes a canary that
  // lands with the server's client.
  const DIAGNOSTIC = "src/app/api/system-health/files/route.ts";
  const userWrites = writes.filter((w) => !["admin", "createAdminClient()"].includes(w.receiver) && !(w.file === DIAGNOSTIC && w.verb === "insert"));
  ok("every one goes through the admin client", userWrites.length === 0, userWrites.map((w) => `${w.file}: ${w.receiver} ${w.verb} ${w.table}`).join("\n        "));
  ok(
    "...and the diagnostic expects its insert to be refused",
    /const refused = \/permission denied\/i\.test\(insError\?\.message \?\? ""\);/.test(read(DIAGNOSTIC))
  );
}

// =====================================================================
console.log("\n== 13. agents and sites are written by the server only ==");
// =====================================================================
{
  const MIG = strip(readFileSync("supabase/migrations/20261015000000_agents_websites_server_written.sql", "utf8").replace(/--.*$/gm, ""));
  ok(
    "the account loses the writes on both, and keeps deleting its own site",
    /revoke insert, update, delete on public\.user_agents from anon, authenticated;/.test(MIG) &&
      /revoke insert, update on public\.user_websites from anon, authenticated;/.test(MIG) &&
      !/drop policy if exists "delete_own_user_websites"/.test(MIG)
  );
  const writes = [];
  for (const f of walk("src")) {
    const src = read(f);
    for (const m of src.matchAll(/([\w.]+(?:\(\))?)\s*\.from\(\s*"(user_agents|user_websites)"\s*\)\s*\.(insert|update|upsert|delete)\(/g)) {
      writes.push({ file: f, receiver: m[1], table: m[2], verb: m[3], tail: src.slice(m.index, m.index + 900) });
    }
  }
  ok("the scan found the writes", writes.length >= 25, `${writes.length} writes`);
  const userWrites = writes.filter(
    (w) => !["admin", "createAdminClient()", "websiteWriter"].includes(w.receiver) &&
      !(w.table === "user_websites" && w.verb === "delete")
  );
  ok(
    "no insert or update of either goes through the user's client",
    userWrites.length === 0,
    userWrites.map((w) => `${w.file}: ${w.receiver} ${w.verb} ${w.table}`).join("\n        ")
  );
  // The routes the account drives: every site update there is scoped by
  // user_id as well as id, so the service role never writes a stranger's row.
  const routeUpdates = writes.filter((w) => w.table === "user_websites" && w.verb === "update" && w.file.startsWith("src/app/api/websites/") && w.receiver !== "admin");
  const unscoped = routeUpdates.filter((w) => !/\.eq\("user_id", (?:user\.id|writerUserId)\)/.test(w.tail.split(/;\s*\n/)[0]));
  ok(
    `every site update in the routes is scoped to the caller (${routeUpdates.length})`,
    routeUpdates.length >= 12 && unscoped.length === 0,
    unscoped.map((w) => w.file).join("\n        ")
  );
}

// =====================================================================
console.log("\n== 14. projects are created, and site history written, by the server only ==");
// =====================================================================
{
  const MIG_FILE = "supabase/migrations/20261023100000_projects_site_versions_server_written.sql";
  ok("the migration is there", existsSync(MIG_FILE));
  const MIG = existsSync(MIG_FILE) ? strip(readFileSync(MIG_FILE, "utf8").replace(/--.*$/gm, "")) : "";
  ok(
    "projects: the account loses INSERT and keeps the other three",
    /drop policy if exists projects_insert_own on public\.projects;/.test(MIG) &&
      /revoke insert on public\.projects from anon, authenticated;/.test(MIG) &&
      !/revoke[^;]*(select|update|delete)[^;]*on public\.projects/.test(MIG)
  );
  ok(
    "site_versions: the account loses INSERT, UPDATE and DELETE",
    /revoke insert, update, delete on public\.site_versions from anon, authenticated;/.test(MIG) &&
      ["insert", "update", "delete"].every((v) => MIG.includes(`drop policy if exists "${v}_own_site_versions" on public.site_versions;`))
  );
  const writes = [];
  for (const f of walk("src")) {
    const src = read(f);
    for (const m of src.matchAll(/([\w.]+(?:\(\))?)\s*\.from\(\s*"(projects|site_versions)"\s*\)\s*\.(insert|update|upsert|delete)\(/g)) {
      writes.push({ file: f, receiver: m[1], table: m[2], verb: m[3], tail: src.slice(m.index, m.index + 600) });
    }
  }
  const creates = writes.filter((w) => w.table === "projects" && w.verb === "insert");
  ok("the scan found the writes", creates.length >= 2 && writes.filter((w) => w.table === "site_versions").length >= 3, `${writes.length} writes`);
  // The account still renames and deletes its own projects: those stay on
  // its own client, where RLS decides.
  const userWrites = writes.filter((w) => !["admin", "createAdminClient()"].includes(w.receiver) && !(w.table === "projects" && ["update", "delete"].includes(w.verb)));
  ok(
    "every create and every history write goes through the admin client",
    userWrites.length === 0,
    userWrites.map((w) => `${w.file}: ${w.receiver} ${w.verb} ${w.table}`).join("\n        ")
  );
  const unstamped = writes.filter((w) => w.verb === "insert" && !/user_id: user\.id/.test(w.tail.split(/\}\)/)[0]));
  ok("...each insert stamped with the session's user", unstamped.length === 0, unstamped.map((w) => w.file).join(", "));
  const historyDeletes = writes.filter((w) => w.table === "site_versions" && w.verb === "delete");
  ok(
    "...and the history trim is scoped to the caller",
    historyDeletes.length >= 1 && historyDeletes.every((w) => /\.eq\("user_id", userId\)/.test(w.tail.split(";")[0])),
    historyDeletes.map((w) => w.tail.split(";")[0]).join("\n        ")
  );
}

console.log(failures.length === 0 ? `\nALL PASS: ${pass} passed, 0 failed` : `\nFAILED: ${pass} passed, ${failures.length} failed`);
process.exit(failures.length === 0 ? 0 : 1);
