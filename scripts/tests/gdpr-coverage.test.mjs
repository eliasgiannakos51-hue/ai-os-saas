// The test the brief asked for: it FAILS when a new table carrying a
// user_id is added to the schema and not classified for export/erasure.
//
// This is the mechanism that keeps GDPR coverage honest. The old export
// read CLASSIFIER_MODULES — a list that exists for a completely different
// reason (which module can "Create Anything" file into) — so every
// feature shipped since then added tables that were never exported and
// nobody found out. A list that has no reason to stay in sync with the
// schema will not stay in sync with the schema.
//
// Run: node scripts/tests/gdpr-coverage.test.mjs
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { loadTs } from "./load-ts.mjs";

let pass = 0;
const failures = [];
function check(name, cond, detail = "") {
  if (cond) {
    pass++;
    console.log(`  PASS  ${name}`);
  } else {
    failures.push(name);
    console.log(`  FAIL  ${name}${detail ? "\n        " + detail : ""}`);
  }
}

const reg = await loadTs("src/lib/gdpr/user-data-registry.ts");
const { USER_DATA_TABLES, NON_PERSONAL_TABLES, exportableTables, tablesNeedingExplicitErasure, redactRow } = reg;

// --- Parse every CREATE TABLE out of the real schema files -------------
function allSql() {
  let sql = "";
  for (const f of readdirSync(".").filter((f) => f.endsWith(".sql"))) sql += readFileSync(f, "utf8") + "\n";
  if (existsSync("supabase/migrations")) {
    for (const f of readdirSync("supabase/migrations").filter((f) => f.endsWith(".sql"))) {
      sql += readFileSync(`supabase/migrations/${f}`, "utf8") + "\n";
    }
  }
  return sql;
}
const SQL = allSql();
const blocks = [...SQL.matchAll(/create table (?:if not exists )?(?:public\.)?([a-z_]+)\s*\(([\s\S]*?)\n\);/gi)];
const tablesWithUserId = new Set();
const cascadeByTable = new Map();
for (const [, name, body] of blocks) {
  if (!/\buser_id\b/i.test(body)) continue;
  tablesWithUserId.add(name);
  const fk = body.match(/user_id[^,]*?references\s+auth\.users\s*\(id\)\s*on\s+delete\s+(\w+)/is);
  if (!cascadeByTable.has(name)) cascadeByTable.set(name, fk ? fk[1].toLowerCase() : null);
}

console.log(`== 1. every table with a user_id is classified (${tablesWithUserId.size} found in schema) ==`);
const classified = new Set(USER_DATA_TABLES.map((t) => t.table));
const nonPersonal = new Set(NON_PERSONAL_TABLES);
const unclassified = [...tablesWithUserId].filter((t) => !classified.has(t) && !nonPersonal.has(t));
check(
  "no table with a user_id is missing from the registry",
  unclassified.length === 0,
  unclassified.length
    ? `UNCLASSIFIED: ${unclassified.join(", ")}\n        Add each to USER_DATA_TABLES (exported) or NON_PERSONAL_TABLES (deliberately excluded) in src/lib/gdpr/user-data-registry.ts.`
    : ""
);
// And the reverse: a registry entry for a table that no longer exists
// would silently export nothing while looking covered.
const ghosts = USER_DATA_TABLES.map((t) => t.table).filter((t) => !tablesWithUserId.has(t));
check("no registry entry points at a table that does not exist", ghosts.length === 0, ghosts.join(", "));

console.log("\n== 2. the export actually covers what the old one missed ==");
const labels = new Set(exportableTables().map((t) => t.label));
// The specific omissions named in the brief.
for (const [label, why] of [
  ["chat_conversations", "chat"],
  ["chat_messages", "chat"],
  ["missions", "missions"],
  ["websites", "websites"],
  ["published_sites", "published sites"],
  ["agents", "agents"],
  ["agent_runs", "agent runs"],
  ["files", "files"],
  ["research_reports", "research"],
  ["credits_balance", "credits"],
  ["credit_transactions", "transactions"],
  ["favorites", "favorites"],
  ["connected_accounts", "integrations"],
]) {
  check(`export includes ${why}`, labels.has(label));
}
check("the export is far larger than the old 13-module one", exportableTables().length > 40, `${exportableTables().length} tables`);

console.log("\n== 3. secrets are redacted, not dumped ==");
const sensitive = USER_DATA_TABLES.filter((t) => t.scope === "sensitive_redacted");
check("integrations, push subscriptions and devices are all redacted", sensitive.length >= 4);
for (const t of sensitive) {
  check(`${t.table} declares which columns to strip`, Array.isArray(t.redactColumns) && t.redactColumns.length > 0);
}
// A redactColumns entry naming a column that does not exist is silently
// useless: redactRow only replaces keys it finds, so the real secret
// column sails straight into the export file. This caught exactly that —
// the registry said "access_token" while the schema column is
// "access_token_encrypted", so every OAuth token would have been
// exported in full.
const columnsByTable = new Map();
for (const [, name, body] of blocks) {
  if (!columnsByTable.has(name)) {
    columnsByTable.set(name, new Set([...body.matchAll(/^\s{2}([a-z_][a-z0-9_]*)\s+/gm)].map((m) => m[1])));
  }
}
for (const t of sensitive) {
  const real = columnsByTable.get(t.table);
  if (!real) continue;
  const phantom = (t.redactColumns ?? []).filter((c) => !real.has(c));
  check(
    `${t.table}: every redacted column actually exists in the schema`,
    phantom.length === 0,
    phantom.length
      ? `${phantom.join(", ")} not in ${t.table}. redactRow would not strip anything, and the real column would be exported verbatim.`
      : ""
  );
}

const redacted = redactRow({ id: "1", access_token: "secret-abc", name: "keep" }, ["access_token"]);
check("redactRow strips the named column and keeps the rest", redacted.access_token === "[redacted]" && redacted.name === "keep" && redacted.id === "1");

console.log("\n== 4. erasure: every table is either cascaded or explicitly scrubbed ==");
const explicit = new Set(tablesNeedingExplicitErasure().map((t) => t.table));
const notCascaded = [...tablesWithUserId].filter((t) => cascadeByTable.get(t) !== "cascade" && !nonPersonal.has(t));
for (const t of notCascaded) {
  check(
    `${t} does not cascade — so it must be flagged needsExplicitErasure`,
    explicit.has(t),
    `${t} has no ON DELETE CASCADE and is not scrubbed explicitly. A deleted account's id survives in it.`
  );
}
check("production_errors is the known non-cascading table and is handled", explicit.has("production_errors"));
// The scrub must actually be wired into the delete flow, not just exist.
const strip = (t) => t.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
const confirmSrc = strip(readFileSync("src/app/api/delete-account/confirm/route.ts", "utf8"));
check("delete-account calls the explicit scrub", /forget_user_in_production_errors/.test(confirmSrc));
check(
  "...BEFORE deleteUser, so a failure stops the deletion",
  confirmSrc.indexOf("forget_user_in_production_errors") < confirmSrc.indexOf("deleteUser(")
);
check("...and storage objects are still deleted too", /delete_user_file_objects/.test(confirmSrc));
// The migration that defines it has to be in the repo.
const migration = "supabase/migrations/20260808_gdpr_erasure_gaps.sql";
check("the erasure migration exists", existsSync(migration));
if (existsSync(migration)) {
  const mig = readFileSync(migration, "utf8");
  check("it nulls the user_id pointer", /set user_id = null/i.test(mig));
  check("it removes the id from the affected_user_ids array", /array_remove\(affected_user_ids/i.test(mig));
  check("it is service-role only", /grant execute[\s\S]*to service_role/i.test(mig) && /revoke all[\s\S]*from authenticated/i.test(mig));
}

console.log("\n== 5. the export runs server-side, under the user's own session ==");
const routeFile = "src/app/api/account/export/route.ts";
check("the export route exists", existsSync(routeFile));
if (existsSync(routeFile)) {
  const route = strip(readFileSync(routeFile, "utf8"));
  check("it builds from the registry, not from CLASSIFIER_MODULES", /exportableTables\(\)/.test(route) && !/CLASSIFIER_MODULES/.test(route));
  check("it filters by the authenticated user's id", /\.eq\("user_id", user\.id\)/.test(route));
  check("it uses the user's session (RLS), not the service role", !/createAdminClient/.test(route));
  check("it redacts on the way out", /redactRow/.test(route));
  check("it reports tables it could not read instead of implying they were empty", /unreadable_tables/.test(route));
}
// The old client-side button must be gone — leaving it means two exports
// with different contents and no way to tell which one a user got.
const oldButton = "src/components/settings/export-data-button.tsx";
if (existsSync(oldButton)) {
  const btn = strip(readFileSync(oldButton, "utf8"));
  check(
    "the settings button no longer queries CLASSIFIER_MODULES from the browser",
    !/CLASSIFIER_MODULES/.test(btn),
    "the old 13-table client-side export is still live"
  );
}

console.log(`\n${failures.length === 0 ? "ALL PASS" : "FAILURES"}: ${pass} passed, ${failures.length} failed`);
if (failures.length) process.exit(1);
