// The data export cannot fall behind the schema.
//
// GDPR Article 20 is not failed by refusing a request — it is failed by
// answering one INCOMPLETELY, which looks exactly like answering it. The
// realistic way that happens here is mundane: somebody adds a feature
// table, nobody remembers the export, and eighteen months later a subject
// access request returns a file that is quietly missing a year of their
// chat memory.
//
// So the manifest is not maintained by hand and hoped over. This parses
// the same schema file the RLS gate reads and fails the build on any
// table that appears in neither the included nor the excluded list. The
// decision then has to be made in the pull request that adds the table,
// by the person who knows what is in it.
//
// This repo has shipped the "list that drifts from reality" bug twice
// already — a SECURITY.md naming a test that had been renamed, and two
// migrations never appended to the backup the RLS gate reads. This is the
// same class of failure with a legal consequence attached.
//
// Run: node scripts/tests/gdpr.test.mjs
import { readFileSync } from "node:fs";

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
function checkTrue(name, cond, detail) {
  check(name, Boolean(cond), true);
  if (!cond && detail) console.log(`        ${detail}`);
}

const { loadTs } = await import("./load-ts.mjs");
const manifest = await loadTs("src/lib/gdpr/export-manifest.ts");
const sql = readFileSync("supabase_full_project_backup.sql", "utf8");

console.log("== 1. every table is accounted for ==");

// Table name -> its column list, from the same file the RLS gate reads.
const tables = new Map();
for (const m of sql.matchAll(
  /create table (?:if not exists )?(?:public\.)?"?([a-z_0-9]+)"?\s*\(([\s\S]*?)\n\);/g
)) {
  tables.set(m[1], m[2]);
}
checkTrue(`the schema was parsed (${tables.size} tables)`, tables.size >= 60);

const included = new Set(manifest.EXPORTED_TABLES.map((t) => t.table));
const excluded = new Set(manifest.EXCLUDED_TABLES.map((t) => t.table));

const unaccounted = [...tables.keys()].filter((t) => !included.has(t) && !excluded.has(t)).sort();
check("no table is missing from both lists", unaccounted, []);

// A table cannot be in both — that reads as a decision made twice, in
// opposite directions.
const both = [...included].filter((t) => excluded.has(t)).sort();
check("no table is both included and excluded", both, []);

// Every exported table has to exist. A typo in a table name produces an
// export that silently returns nothing for it, which is the omission this
// file exists to catch wearing a different hat.
const phantom = manifest.EXPORTED_TABLES.map((t) => t.table).filter((t) => !tables.has(t)).sort();
check("every exported table exists in the schema", phantom, []);

// And the column it is scoped by has to exist ON that table, for exactly
// the same reason: `.eq("user_id", …)` against a table whose column is
// `seller_id` errors, and the route records that as "could not be read"
// rather than failing loudly.
const badColumn = manifest.EXPORTED_TABLES.filter((entry) => {
  const body = tables.get(entry.table);
  if (!body) return false;
  return !new RegExp(`^\\s*${entry.column}\\s+uuid`, "m").test(body);
}).map((entry) => `${entry.table}.${entry.column}`);
check("every scope column exists on its table", badColumn, []);

console.log("\n== 2. exclusions are justified, not just listed ==");
// The three legitimate reasons are: not personal data, a live
// credential, or including it harms the subject. "It did not seem
// important" is not one, so every entry must carry prose long enough to
// actually be a reason.
for (const entry of manifest.EXCLUDED_TABLES) {
  checkTrue(
    `${entry.table} carries a real reason`,
    typeof entry.reason === "string" && entry.reason.length > 40,
    `reason was ${JSON.stringify(entry.reason)}`
  );
}

console.log("\n== 3. the export does not hand out credentials ==");
// The integrations table holds AES-256-GCM ciphertext of somebody's
// Gmail and Drive credentials. It is exported, but narrowed — and the
// narrowing is the point, so it is asserted rather than trusted.
const integrations = manifest.EXPORTED_TABLES.find((t) => t.table === "user_integrations");
checkTrue("user_integrations is exported", Boolean(integrations));
checkTrue("...but not with select *", integrations?.select !== undefined && integrations.select !== "*");
checkTrue(
  "...and no token column is named",
  !/token|secret|refresh/i.test(integrations?.select ?? ""),
  integrations?.select
);
// The deletion token is a credential that ERASES the account. It must
// not be in a file that lands in a downloads folder.
checkTrue("account_deletion_requests is excluded", excluded.has("account_deletion_requests"));

console.log("\n== 4. the route holds the line ==");
const route = readFileSync("src/app/api/account/export/route.ts", "utf8");
checkTrue("it authenticates", /supabase\.auth\.getUser\(\)/.test(route));
checkTrue("it 401s without a session", /status:\s*401/.test(route));
checkTrue("it rate limits", /checkRateLimit/.test(route));
// The security design: every query runs under the caller's own RLS, so a
// wrong scope column in the manifest returns nothing instead of somebody
// else's rows. A service-role client here would turn that same mistake
// into a data breach.
checkTrue("it reads through the caller's own client", /createClient\(\)/.test(route));
checkTrue("...and NOT through the service-role client", !/createAdminClient/.test(route));
// Failures are reported in the manifest rather than swallowed: a table
// that silently vanished is indistinguishable from one that was empty.
checkTrue("read failures are reported to the subject", /couldNotBeRead/.test(route));
checkTrue("truncation is reported to the subject", /truncatedAtRowCap/.test(route));
checkTrue("what is NOT included is stated in the file", /NOT INCLUDED/.test(route));

console.log("\n== 5. erasure still comes with it ==");
// Article 17 was already honoured; this asserts it stayed that way while
// Article 20 was added, since the two are usually broken by the same
// change.
// Comments stripped first: that route DOCUMENTS the ordering ("Done
// BEFORE deleteUser so a failure is still reportable"), and the comment
// sits above the call it describes — so an indexOf over raw source finds
// the explanation, not the code, and reports the order backwards.
const confirm = readFileSync("src/app/api/delete-account/confirm/route.ts", "utf8")
  .replace(/\/\*[\s\S]*?\*\//g, "")
  .replace(/^\s*\/\/.*$/gm, "");
checkTrue("the file objects are deleted", /delete_user_file_objects/.test(confirm));
checkTrue(
  "...before the auth user, so a failure is still reportable",
  confirm.indexOf("delete_user_file_objects") < confirm.indexOf("deleteUser")
);

console.log(
  fail === 0 ? `\nALL PASS: ${pass} passed, 0 failed` : `\nFAILURES: ${pass} passed, ${fail} failed`
);
process.exit(fail === 0 ? 0 : 1);
