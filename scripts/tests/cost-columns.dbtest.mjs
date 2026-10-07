// THE COST COLUMNS OF A JOB AND A REPORT ARE READ BY THE SERVER ONLY,
// AGAINST A REAL POSTGRES.
//
// supabase/migrations/20261013000000_cost_columns_server_only.sql. As the
// signed-in role, on the account's OWN rows: the columns a screen shows
// are readable, the cost record, the timeline and the credit hold are not.
// As the service role, everything still is.
//
// Run: node scripts/tests/cost-columns.dbtest.mjs   (needs a database;
// run through `npm run test:db`, which provisions one)
import { execFileSync } from "node:child_process";

let pass = 0;
const failures = [];
const ok = (name, cond, detail) => {
  if (cond) { pass++; console.log(`  PASS  ${name}`); }
  else { failures.push(name); console.log(`  FAIL  ${name}${detail !== undefined ? "\n        " + detail : ""}`); }
};

if (!process.env.DATABASE_URL && !process.env.PGDATABASE) {
  console.log("cost-columns: SKIPPED — no DATABASE_URL or PGDATABASE");
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
const denied = (r) => !r.ok && /permission denied/.test(r.out);

console.log("cost-columns");

const U = "eeeeeeee-0000-0000-0000-000000000701";
const J = "eeeeeeee-0000-0000-0000-0000000007a1";
const R = "eeeeeeee-0000-0000-0000-0000000007b1";
sql(`delete from auth.users where id = '${U}'`);
sql(`insert into auth.users (id, email) values ('${U}', 'cost-columns@test.local')`);
sql(`insert into public.ai_jobs (id, user_id, kind, status, result, usage_entries) values ('${J}', '${U}', 'create', 'done', '{"ok":true}'::jsonb, '[{"model":"m"}]'::jsonb)`);
sql(`insert into public.research_reports (id, user_id, topic, status, usage_entries) values ('${R}', '${U}', 'a topic', 'ready', '[{"model":"m"}]'::jsonb)`);

console.log("\n== 1. a job: what the screen shows, and nothing it does not ==");
const jOk = asUser(U, `select status from public.ai_jobs where id = '${J}'`);
ok("the account reads its job's status and result", jOk.ok && jOk.out === "done", jOk.out);
for (const c of ["usage_entries", "timeline", "reservation_id", "running"]) {
  ok(`...but not ${c}`, denied(asUser(U, `select ${c} from public.ai_jobs where id = '${J}'`)));
}
ok("...nor all of it at once", denied(asUser(U, `select * from public.ai_jobs where id = '${J}'`)));

console.log("\n== 2. a report: the same ==");
const rOk = asUser(U, `select topic from public.research_reports where id = '${R}'`);
ok("the account reads its report", rOk.ok && rOk.out === "a topic", rOk.out);
for (const c of ["usage_entries", "reservation_id"]) {
  ok(`...but not ${c}`, denied(asUser(U, `select ${c} from public.research_reports where id = '${R}'`)));
}
const cnt = asUser(U, `select count(*) from public.research_reports where user_id = '${U}'`);
ok("a count still works (the monthly cap and the page read one)", cnt.ok && cnt.out === "1", cnt.out);

console.log("\n== 3. the server still reads everything ==");
const sj = asServer(`select usage_entries->0->>'model' from public.ai_jobs where id = '${J}'`);
ok("the service role reads a job's cost record", sj.ok && sj.out === "m", sj.out);
const sr = asServer(`select usage_entries->0->>'model' from public.research_reports where id = '${R}'`);
ok("...and a report's", sr.ok && sr.out === "m", sr.out);

console.log("\n== 4. and the account still deletes its own report ==");
const del = asUser(U, `delete from public.research_reports where id = '${R}'`);
ok("delete works", del.ok && sql(`select count(*) from public.research_reports where id = '${R}'`) === "0", del.out);

sql(`delete from auth.users where id = '${U}'`);

console.log(failures.length === 0 ? `\nALL PASS: ${pass} passed, 0 failed` : `\nFAILED: ${pass} passed, ${failures.length} failed`);
process.exit(failures.length === 0 ? 0 : 1);
