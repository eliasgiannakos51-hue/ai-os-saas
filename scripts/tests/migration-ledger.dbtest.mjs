// THE MIGRATION LEDGER IS WRITABLE AND READABLE ONLY BY THE SERVICE ROLE,
// AGAINST A REAL POSTGRES.
//
// supabase/migrations/20261026000000_migration_ledger.sql. As the signed-in
// role or anonymously, public.schema_migrations cannot be read or written.
// As the service role, it can — and already holds the ledger migration's
// own row, because the file registers itself at its own end.
//
// Run: node scripts/tests/migration-ledger.dbtest.mjs   (needs a database;
// run through `npm run test:db`, which provisions one)
import { execFileSync } from "node:child_process";

let pass = 0;
const failures = [];
const ok = (name, cond, detail) => {
  if (cond) { pass++; console.log(`  PASS  ${name}`); }
  else { failures.push(name); console.log(`  FAIL  ${name}${detail !== undefined ? "\n        " + detail : ""}`); }
};

if (!process.env.DATABASE_URL && !process.env.PGDATABASE) {
  console.log("migration-ledger: SKIPPED — no DATABASE_URL or PGDATABASE");
  process.exit(0);
}

const PSQL_TAG = /^(BEGIN|COMMIT|ROLLBACK|SET|DO|INSERT \d+ \d+|UPDATE \d+|DELETE \d+|SELECT \d+)$/;
const dbArgs = () => (process.env.DATABASE_URL ? ["-d", process.env.DATABASE_URL] : ["-d", process.env.PGDATABASE]);
function run(query) {
  try {
    const out = execFileSync("psql", [...dbArgs(), "-v", "ON_ERROR_STOP=1", "-tAc", query], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
    const lines = out.split("\n").map((l) => l.trim()).filter((l) => l !== "" && !PSQL_TAG.test(l));
    return { ok: true, out: lines.length === 0 ? "" : lines[lines.length - 1] };
  } catch (err) {
    return { ok: false, out: String(err.stderr ?? err.message) };
  }
}
const sql = (q) => {
  const r = run(q);
  if (!r.ok) throw new Error(r.out);
  return r.out;
};
const asAnon = (q) => run(`begin; set local role anon; ${q}; commit;`);
const asUser = (uid, q) => run(`begin; set local role authenticated; set local request.jwt.claim.sub = '${uid}'; ${q}; commit;`);
const asServer = (q) => run(`begin; set local role service_role; ${q}; commit;`);

console.log("migration-ledger");

const U = "eeeeeeee-0000-0000-0000-000000000701";
sql(`delete from auth.users where id = '${U}'`);
sql(`insert into auth.users (id, email) values ('${U}', 'ledger@test.local')`);

console.log("\n== 1. the table exists and already registered itself ==");
const self = asServer(`select filename from public.schema_migrations where filename = '20261026000000_migration_ledger.sql'`);
ok("the ledger migration's own row is present", self.ok && self.out === "20261026000000_migration_ledger.sql", self.out);

console.log("\n== 2. nobody through PostgREST can read it ==");
const readUser = asUser(U, `select filename from public.schema_migrations limit 1`);
ok("authenticated is refused", !readUser.ok && /permission denied/.test(readUser.out), readUser.out);
const readAnon = asAnon(`select filename from public.schema_migrations limit 1`);
ok("anon is refused", !readAnon.ok && /permission denied/.test(readAnon.out), readAnon.out);

console.log("\n== 3. nor can anybody write it ==");
const writeUser = asUser(U, `insert into public.schema_migrations (filename) values ('forged.sql')`);
ok("authenticated cannot insert", !writeUser.ok && /permission denied/.test(writeUser.out), writeUser.out);
const writeAnon = asAnon(`insert into public.schema_migrations (filename) values ('forged.sql')`);
ok("anon cannot insert", !writeAnon.ok && /permission denied/.test(writeAnon.out), writeAnon.out);

console.log("\n== 4. the service role can both read and write ==");
const seeded = asServer(`insert into public.schema_migrations (filename) values ('dbtest_probe.sql') on conflict (filename) do nothing returning filename`);
ok("service_role can insert", seeded.ok, seeded.out);
const read = asServer(`select filename from public.schema_migrations where filename = 'dbtest_probe.sql'`);
ok("...and read it back", read.ok && read.out === "dbtest_probe.sql", read.out);
sql(`delete from public.schema_migrations where filename = 'dbtest_probe.sql'`);

sql(`delete from auth.users where id = '${U}'`);

console.log(`\n${failures.length === 0 ? "ALL PASS" : "FAILURES"}: ${pass} passed, ${failures.length} failed`);
process.exit(failures.length === 0 ? 0 : 1);
