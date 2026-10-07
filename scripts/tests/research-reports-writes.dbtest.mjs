// A RESEARCH REPORT IS WRITTEN BY THE SERVER ONLY, AGAINST A REAL POSTGRES.
//
// supabase/migrations/20261011000000_research_reports_server_writes.sql.
// As the signed-in role, on the account's OWN row: reading and deleting
// still work, inserting and updating do not. As the service role, the
// server's writes still land.
//
// Run: node scripts/tests/research-reports-writes.dbtest.mjs   (needs a
// database; run through `npm run test:db`, which provisions one)
import { execFileSync } from "node:child_process";

let pass = 0;
const failures = [];
const ok = (name, cond, detail) => {
  if (cond) { pass++; console.log(`  PASS  ${name}`); }
  else { failures.push(name); console.log(`  FAIL  ${name}${detail !== undefined ? "\n        " + detail : ""}`); }
};

if (!process.env.DATABASE_URL && !process.env.PGDATABASE) {
  console.log("research-reports-writes: SKIPPED — no DATABASE_URL or PGDATABASE");
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
const asUser = (uid, q) => run(`begin; set local role authenticated; set local request.jwt.claim.sub = '${uid}'; ${q}; commit;`);
const asServer = (q) => run(`begin; set local role service_role; ${q}; commit;`);

console.log("research-reports-writes");

const U = "eeeeeeee-0000-0000-0000-000000000501";
const R = "eeeeeeee-0000-0000-0000-0000000005a1";
const R2 = "eeeeeeee-0000-0000-0000-0000000005a2";
sql(`delete from auth.users where id = '${U}'`);
sql(`insert into auth.users (id, email) values ('${U}', 'research-writes@test.local')`);
sql(`insert into public.research_reports (id, user_id, topic, status, chunk_count) values ('${R}', '${U}', 'a topic', 'researching', 3)`);
const col = (c) => sql(`select ${c}::text from public.research_reports where id = '${R}'`);

console.log("\n== 1. the account reads its own report ==");
const read = asUser(U, `select count(*) from public.research_reports where id = '${R}'`);
ok("select works", read.ok && read.out === "1", read.out);

console.log("\n== 2. the account cannot change it ==");
const upd = asUser(U, `update public.research_reports set chunk_count = 0, status = 'pending' where id = '${R}'`);
ok("update is refused", !upd.ok && /permission denied/.test(upd.out), upd.out);
ok("...and the row is as the server left it", col("chunk_count") === "3" && col("status") === "researching");

console.log("\n== 3. nor create one ==");
const ins = asUser(U, `insert into public.research_reports (user_id, topic, status) values ('${U}', 'mine', 'researching')`);
ok("insert is refused", !ins.ok && /permission denied/.test(ins.out), ins.out);

console.log("\n== 4. the server still writes ==");
const sIns = asServer(`insert into public.research_reports (id, user_id, topic, status) values ('${R2}', '${U}', 'planned', 'pending')`);
ok("the service role inserts", sIns.ok, sIns.out);
const sUpd = asServer(`update public.research_reports set status = 'researching' where id = '${R2}'`);
ok("the service role updates", sUpd.ok && sql(`select status from public.research_reports where id = '${R2}'`) === "researching", sUpd.out);

console.log("\n== 5. the account still deletes its own ==");
const del = asUser(U, `delete from public.research_reports where id = '${R2}'`);
ok("delete works", del.ok && sql(`select count(*) from public.research_reports where id = '${R2}'`) === "0", del.out);

sql(`delete from auth.users where id = '${U}'`);

console.log(failures.length === 0 ? `\nALL PASS: ${pass} passed, 0 failed` : `\nFAILED: ${pass} passed, ${failures.length} failed`);
process.exit(failures.length === 0 ? 0 : 1);
