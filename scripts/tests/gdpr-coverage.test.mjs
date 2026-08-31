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
// The same comment stripper the pre-commit marker checker uses, rather
// than a fifth copy of it: every legacy table below is discussed at
// length in the prose that explains WHY it is legacy, and a scan that
// counted prose would report all six as live.
import { stripComments } from "../check-mutation-markers.mjs";

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
// A BODY MAY NOT CONTAIN ANOTHER `create table`, and this tempering is
// not cosmetic. The lazy body runs to the next "\n);", and a
// `create table` that has none — because it is inside a quoted string in
// a DO block, like the throwaway probe in
// 20260909000000_revoke_anon_default_privileges — swallows every file
// after it until one turns up.
//
// Measured when nav_events was added: the probe's "body" was 30,272
// characters long, ended halfway through nav_events' own definition, and
// therefore (a) reported `zz_anon_default_probe` as a table carrying a
// user_id, which it does not, and (b) hid nav_events from this check
// entirely, so a new table full of one person's browsing history was
// never asked for a GDPR classification at all. The gate was red, and it
// was red about the wrong table — which is worse than being green,
// because the name in the failure is the thing somebody goes and fixes.
//
// Tempering the body costs nothing on real definitions (the longest is
// 3,064 characters) and changes exactly two entries in the result: the
// phantom out, nav_events in.
const blocks = [...SQL.matchAll(/create table (?:if not exists )?(?:public\.)?([a-z_]+)\s*\(((?:(?!create table)[\s\S])*?)\n\);/gi)];
const tablesWithUserId = new Set();
const cascadeByTable = new Map();
for (const [, name, body] of blocks) {
  if (!/\buser_id\b/i.test(body)) continue;
  tablesWithUserId.add(name);
  const fk = body.match(/user_id[^,]*?references\s+auth\.users\s*\(id\)\s*on\s+delete\s+(\w+)/is);
  if (!cascadeByTable.has(name)) cascadeByTable.set(name, fk ? fk[1].toLowerCase() : null);
}

// A CASCADE DECLARED AS A SEPARATE STATEMENT COUNTS TOO.
//
// The loop above only sees `user_id uuid references auth.users(id) on
// delete cascade` written INSIDE the create table. Postgres's own dump
// format does not write it that way: it emits a bare column and then
// `alter table ... add constraint ..._user_id_fkey foreign key (user_id)
// references auth.users(id) on delete cascade` further down the file, and
// the baseline migrations — which are transformed dumps — are full of them.
//
// Reading only the inline form reported security_check_log, user_favorites
// and website_form_submissions as un-erasable when all three cascade
// correctly. A false accusation in a data-protection check is not a safe
// failure: it gets three tables added to an explicit-scrub list they do
// not belong on, and the day one of them really loses its cascade the
// check is already saying so.
for (const m of SQL.matchAll(
  /alter table (?:only )?(?:public\.)?"?([a-z_0-9]+)"?[\s\S]{0,200}?foreign key\s*\(\s*user_id\s*\)\s*references\s+auth\.users\s*\(\s*id\s*\)\s*on\s+delete\s+(\w+)/gi
)) {
  const [, table, action] = m;
  if (!tablesWithUserId.has(table)) continue;
  // An inline declaration and a separate one cannot disagree in practice
  // — the constraint is one object — so the later statement simply fills
  // in what the create table did not say.
  if (!cascadeByTable.get(table)) cascadeByTable.set(table, action.toLowerCase());
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

// THE `status` FIELD IS THE OTHER ONE THAT COULD BE ABUSED, and it was
// written under an instruction to take six "dead" tables out of this
// registry entirely. Two of them hold rows from replaced features, one of
// them is written every time somebody presses Quick Start on the home
// screen, and check 1 above would have gone red on all six — so the field
// records the state instead of removing the table, and these checks are
// what stop it drifting back towards being an exemption.
const STATUSES = ["legacy", "provisioned"];
const withStatus = USER_DATA_TABLES.filter((t) => t.status);
check(
  `every status is one of ${STATUSES.join("/")} and carries a reason (${withStatus.length} tables)`,
  withStatus.every(
    (t) => STATUSES.includes(t.status) && typeof t.statusNote === "string" && t.statusNote.length >= 60,
  ),
  withStatus
    .filter((t) => !STATUSES.includes(t.status) || (t.statusNote ?? "").length < 60)
    .map((t) => t.table)
    .join(", "),
);
// A STATUS NEVER TAKES A TABLE OUT OF THE EXPORT OR THE ERASURE. Whatever
// it says, an exportable scope is still exported and the erasure list is
// still the erasure list. Stated as a check so "it is legacy anyway"
// cannot become the reason somebody drops one.
for (const t of withStatus) {
  if (t.scope === "not_personal" || t.scope === "derived_index") continue;
  check(
    `${t.table}: still exported despite being ${t.status}`,
    exportableTables().some((e) => e.table === t.table),
  );
}
// AND THE CLAIM IS CHECKED AGAINST THE CODE. "legacy" means nothing
// writes it. A table that is a live module's table, or one a workspace
// template seeds, is not legacy — ai_coding_requests was called dead and
// is written by the Developer template on every Quick Start.
//
// NAMED ANYWHERE IN src, not only in a module config. The first version
// of this asked whether the table appeared in modules.ts,
// build-modules.ts, classifier-modules.ts or workspace-templates.ts, and
// four tables that are perfectly alive — ai_missions, ai_jobs,
// ai_cost_log, ai_provider_log — went red, because they are reached by a
// literal `.from("ai_missions")` and belong to no module at all. The
// question is "does anything in the product name this table", so that is
// what is asked.
const srcFiles = [];
(function walkSrc(dir) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = `${dir}/${entry.name}`;
    if (entry.isDirectory()) walkSrc(full);
    else if (/\.tsx?$/.test(entry.name)) srcFiles.push(full);
  }
})("src");
const SRC = srcFiles
  .filter((f) => !f.endsWith("src/lib/gdpr/user-data-registry.ts"))
  .map((f) => readFileSync(f, "utf8"))
  .join("\n");
// The two shapes a table name takes in this codebase: a direct query and
// a module/template config entry. A mention inside a COMMENT does not
// count — every one of the legacy tables is discussed at length in the
// prose that explains why it is legacy, and matching that would call all
// of them live.
const CODE = stripComments(SRC);
const namedInCode = (table) =>
  new RegExp(`from\\(["'\`]${table}["'\`]\\)`).test(CODE) ||
  new RegExp(`table: "${table}"`).test(CODE);
const wronglyLegacy = withStatus
  .filter((t) => t.status === "legacy")
  .filter((t) => new RegExp(`table: "${t.table}"`).test(CODE))
  .map((t) => t.table);
check(
  "no table called legacy is a live module table or seeded by a template",
  wronglyLegacy.length === 0,
  wronglyLegacy.join(", "),
);
// The reverse, which is the one that would go unnoticed: a table that
// stopped being written and is still described as live.
const aiTables = USER_DATA_TABLES.filter((t) => /^ai_/.test(t.table));
const unlabelled = aiTables
  .filter((t) => !t.status)
  .filter((t) => !namedInCode(t.table))
  .map((t) => t.table);
check(
  `every ai_* table is named in the code or labelled (${aiTables.length} found)`,
  unlabelled.length === 0,
  `${unlabelled.join(", ")} — nothing in src names these and no status says so`,
);

// THE "derived_index" SCOPE IS THE ONE THAT COULD BE ABUSED. It is the
// only classification that says "personal data, deliberately NOT in the
// export", and its whole justification is that the same text is exported
// under the source table's own label and erased by the source row's
// cascade. Both halves are checked here, so the scope cannot become a
// quiet way to drop a table out of a subject access request.
const derived = USER_DATA_TABLES.filter((t) => t.scope === "derived_index");
for (const t of derived) {
  check(`${t.table} is kept out of the export`, !exportableTables().some((e) => e.table === t.table));
  check(`${t.table} is erased by the auth.users cascade`,
    cascadeByTable.get(t.table) === "cascade",
    `on delete ${cascadeByTable.get(t.table) ?? "(no FK to auth.users found)"} — a derived index that does not cascade is personal data that survives account deletion`);
  check(`${t.table} does not also claim to need explicit erasure`, !t.needsExplicitErasure);
}

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
    // ANY leading indentation, not exactly two spaces. Postgres's dump
    // format indents columns by four, so this read zero columns out of
    // every table that came from the baseline migrations and reported
    // production_errors' three real columns as phantoms.
    columnsByTable.set(name, new Set([...body.matchAll(/^[ \t]+([a-z_][a-z0-9_]*)\s+/gm)].map((m) => m[1])));
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

console.log("\n== 6. the two GDPR routes are bounded ==");
// A right of access is a right, not a rate — but one export is
// ninety-two sequential queries and up to two minutes of function time,
// and nothing bounded it. An account could hold the connection pool open
// against everybody else on the instance for as long as it liked, for
// free. The erasure route has been bounded since it was written; the
// export was not, and the asymmetry is the tell.
{
  const exportSrc = readFileSync("src/app/api/account/export/route.ts", "utf8");
  check('the export is rate limited per ACCOUNT', /scope: "account_export"/.test(exportSrc) &&
    /identifier: user\.id/.test(exportSrc),
    "an IP bucket would block a household behind one NAT and let one account spread its load");
  check("...and says so with a 429 rather than an empty file",
    /status: 429/.test(exportSrc) && /times an hour/.test(exportSrc));
  const confirmSrc = readFileSync("src/app/api/delete-account/confirm/route.ts", "utf8");
  check("the erasure confirmation is rate limited too", /checkRateLimit\(\{/.test(confirmSrc));
  // The number itself, so a change to it is a change somebody sees.
  const n = exportSrc.match(/const EXPORT_MAX_PER_HOUR = (\d+);/);
  check(`the export ceiling is a named constant (${n ? n[1] : "none"})`,
    Boolean(n) && Number(n[1]) >= 3 && Number(n[1]) <= 20,
    "below 3 is a right made awkward; above 20 is not a bound");
}

console.log(`\n${failures.length === 0 ? "ALL PASS" : "FAILURES"}: ${pass} passed, ${failures.length} failed`);
if (failures.length) process.exit(1);
