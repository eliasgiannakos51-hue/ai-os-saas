// THE DIAGNOSTIC, RUN AGAINST A REAL SERVER — and made to go red.
//
// db-inventory.test.mjs reads the GENERATED TEXT: that every CREATE POLICY
// reaches expected_policies, that no statement is destructive, that every
// repair is guarded. All of that is true of a query that returns nothing
// useful, because nothing there executes it.
//
// WHAT ONLY A DATABASE CAN SAY, and both halves of it were wrong about
// storage until 2026-09-08:
//
//   1. THAT THE QUERY IS QUIET ON A COMPLETE SCHEMA. A list of ten
//      expected storage policies compared against an `actual_policies`
//      restricted to `public` reports all ten MISSING, on every run, for
//      ever — the shape CLAUDE.md calls worse than no probe, and the one
//      /api/health's schema sweep produced twice.
//
//   2. THAT IT NOTICES WHEN ONE IS GONE. The reverse failure, and the
//      one that was live: `on storage.objects` was parsed as a table
//      called `storage`, which is in no expected-table list, so the ten
//      policies on the table where every uploaded document lives were
//      dropped from the inventory without a word.
//
// So one storage policy is dropped here, inside a transaction, and the
// query has to name it; then row level security is switched off and the
// query has to say the rest are decoration. Both are rolled back and the
// schema is compared before and after.
//
// Run: DATABASE_URL=... node scripts/tests/db-inventory.dbtest.mjs
//  or: npm run test:db -- db-inventory
import { execFileSync } from "node:child_process";

const DB = process.env.DATABASE_URL ?? process.env.PGDATABASE;
if (!DB) {
  console.log("SKIPPED: no DATABASE_URL / PGDATABASE — this file needs a real Postgres.");
  process.exit(0);
}

let pass = 0;
const failures = [];
function check(name, cond, detail) {
  if (cond) {
    pass++;
    console.log(`  PASS  ${name}`);
  } else {
    failures.push(name);
    console.log(`  FAIL  ${name}${detail !== undefined ? "\n        " + detail : ""}`);
  }
}

const psql = (sql) =>
  execFileSync("psql", [DB, "-v", "ON_ERROR_STOP=1", "-tAF|", "-c", sql], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });

/** The diagnostic the tool emits — generated, never re-typed here. */
const QUERY = execFileSync("node", ["scripts/db-inventory.mjs", "--sql"], {
  encoding: "utf8",
  maxBuffer: 32 * 1024 * 1024,
  stdio: ["ignore", "pipe", "pipe"],
});

/**
 * Findings as {kind, object, detail, fix}. Two things are dropped:
 * informational rows, and psql's own COMMAND TAGS — `BEGIN`, `DROP
 * POLICY`, `ALTER TABLE` are echoed on their own lines by the statements
 * this file runs BEFORE the query, and the first draft counted them as
 * findings. A tag has no `|` in it, which is what tells them apart.
 */
function findings(prefix = "") {
  const out = psql(`${prefix}${QUERY}`);
  return out
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l.includes("|"))
    .map((l) => {
      const [kind, object, detail, fix] = l.split("|");
      return { kind, object: object ?? "", detail: detail ?? "", fix: fix ?? "" };
    })
    .filter((f) => !f.kind.startsWith("CHECK CONSTRAINT (read") && !f.kind.startsWith("UNEXPECTED"));
}

console.log("== 1. the query runs, and says nothing is missing ==");
const base = findings();
// A FLOOR ON THE INSTRUMENT, not on the result: a query that returned
// nothing at all would satisfy "no findings" while proving nothing.
const allRows = psql(QUERY).split("\n").filter((l) => l.trim() !== "");
check(`the diagnostic returned rows to read (${allRows.length})`, allRows.length >= 10, String(allRows.length));
check(
  `no defect on a database with every migration applied (${base.length})`,
  base.length === 0,
  base.map((f) => `${f.kind} ${f.object} ${f.detail}`).join("\n        ")
);

console.log("\n== 2. the ten storage policies are in scope ==");
const STORAGE_POLICIES = [
  ["user-files", "select_own_user_files_objects"],
  ["user-files", "insert_own_user_files_objects"],
  ["user-files", "update_own_user_files_objects"],
  ["user-files", "delete_own_user_files_objects"],
  ["website-references", "select_own_website_references"],
  ["website-references", "insert_own_website_references"],
  ["website-references", "delete_own_website_references"],
  ["create-attachments", "select_own_create_attachments"],
  ["create-attachments", "insert_own_create_attachments"],
  ["create-attachments", "delete_own_create_attachments"],
];
{
  // NAMED, NOT COUNTED — in the query text AND in the database, because
  // the two can disagree in either direction.
  const inQuery = STORAGE_POLICIES.filter(([, n]) => QUERY.includes(`('storage', 'objects', '${n}')`));
  check(
    `all ${STORAGE_POLICIES.length} are expected by the query, by name (${inQuery.length})`,
    inQuery.length === STORAGE_POLICIES.length,
    STORAGE_POLICIES.filter(([, n]) => !QUERY.includes(`('storage', 'objects', '${n}')`)).map(([, n]) => n).join(", ")
  );
  const live = new Set(
    psql("select policyname from pg_policies where schemaname='storage' and tablename='objects'")
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean)
  );
  const absent = STORAGE_POLICIES.filter(([, n]) => !live.has(n));
  check(`...and all ${STORAGE_POLICIES.length} exist in the database (${live.size} on storage.objects)`, absent.length === 0, absent.map(([, n]) => n).join(", "));
}

console.log("\n== 3. and the query goes red when one is gone ==");
const before = psql("select count(*) from pg_policies where schemaname='storage' and tablename='objects'").trim();
const rlsBefore = psql("select relrowsecurity from pg_class where oid='storage.objects'::regclass").trim();
{
  const dropped = "select_own_user_files_objects";
  const withDrop = findings(`begin; drop policy "${dropped}" on storage.objects; `);
  const named = withDrop.filter((f) => f.kind === "MISSING POLICY" && f.detail === dropped);
  check(`dropping ${dropped} is reported as MISSING POLICY`, named.length === 1, JSON.stringify(withDrop.slice(0, 4)));
  check(
    "...and it is filed against storage.objects, not against a table called `storage`",
    named[0]?.object === "storage.objects",
    named[0]?.object ?? "(nothing)"
  );
  check("...and nothing else changed", withDrop.length === 1, JSON.stringify(withDrop));
}
{
  // ROW LEVEL SECURITY OFF IS THE STATE THIS FIXTURE WAS IN, with ten
  // correct policies and nothing enforcing any of them. Production was
  // asked on 2026-09-05 and answered relrowsecurity = true, so this
  // reproduces the fixture's hole rather than a production one.
  const withoutRls = findings("begin; alter table storage.objects disable row level security; ");
  const named = withoutRls.filter((f) => f.kind === "RLS DISABLED" && f.object === "storage.objects");
  check("switching RLS off on storage.objects is reported", named.length === 1, JSON.stringify(withoutRls.slice(0, 4)));
  check(
    "...and the fix names the table, qualified",
    (named[0]?.fix ?? "").includes("alter table storage.objects enable row level security"),
    named[0]?.fix ?? "(nothing)"
  );
}

console.log("\n== 4. the database was put back ==");
// EVERY STATEMENT ABOVE RAN INSIDE A TRANSACTION THAT WAS NEVER
// COMMITTED — psql -c wraps its whole string in one, and a `begin` with
// no `commit` rolls back when the session ends. Verified rather than
// believed, because a suite that edits a schema has to be able to say it
// put it back: user-isolation.mutation.mjs learned that when a failed
// restore made every later result noise.
const after = psql("select count(*) from pg_policies where schemaname='storage' and tablename='objects'").trim();
const rlsAfter = psql("select relrowsecurity from pg_class where oid='storage.objects'::regclass").trim();
check(`the ten policies are still there (${before} before, ${after} after)`, after === before && after === "10", `${before} -> ${after}`);
check(`row level security is still on (${rlsBefore} -> ${rlsAfter})`, rlsAfter === rlsBefore && rlsAfter === "t");
check("and the diagnostic is quiet again", findings().length === 0);

console.log(`\n${failures.length === 0 ? "ALL PASS" : "FAILURES"}: ${pass} passed, ${failures.length} failed`);
if (failures.length) {
  for (const f of failures) console.log(`  - ${f}`);
  process.exit(1);
}
