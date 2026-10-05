// THE COST LOG AND THE PROVIDER LOG ARE READ BY THE SERVER ONLY, AGAINST A
// REAL POSTGRES.
//
// supabase/migrations/20261012000000_cost_log_server_reads.sql. As the
// signed-in role, on the account's OWN rows: neither table can be read.
// As the service role, both still can.
//
// Run: node scripts/tests/cost-log-reads.dbtest.mjs   (needs a database;
// run through `npm run test:db`, which provisions one)
import { execFileSync } from "node:child_process";

let pass = 0;
const failures = [];
const ok = (name, cond, detail) => {
  if (cond) { pass++; console.log(`  PASS  ${name}`); }
  else { failures.push(name); console.log(`  FAIL  ${name}${detail !== undefined ? "\n        " + detail : ""}`); }
};

if (!process.env.DATABASE_URL && !process.env.PGDATABASE) {
  console.log("cost-log-reads: SKIPPED — no DATABASE_URL or PGDATABASE");
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

console.log("cost-log-reads");

const U = "eeeeeeee-0000-0000-0000-000000000601";
sql(`delete from auth.users where id = '${U}'`);
sql(`insert into auth.users (id, email) values ('${U}', 'cost-log@test.local')`);
sql(`insert into public.ai_cost_log (user_id, feature, real_cost_usd, credits_charged) values ('${U}', 'chat_message', 0.0123, 5)`);
sql(`insert into public.ai_provider_log (user_id, request_id, attempt_index, purpose, provider, model, outcome) values ('${U}', gen_random_uuid(), 0, 'chat', 'anthropic', 'a-model', 'success')`);

console.log("\n== 1. the account cannot read its cost log ==");
const c = asUser(U, `select real_cost_usd from public.ai_cost_log where user_id = '${U}'`);
ok("ai_cost_log is refused", !c.ok && /permission denied/.test(c.out), c.out);
const c2 = asUser(U, `select feature from public.ai_cost_log where user_id = '${U}'`);
ok("...even its harmless columns", !c2.ok && /permission denied/.test(c2.out), c2.out);

console.log("\n== 2. nor its provider log ==");
const p = asUser(U, `select model from public.ai_provider_log where user_id = '${U}'`);
ok("ai_provider_log is refused", !p.ok && /permission denied/.test(p.out), p.out);

console.log("\n== 3. the server still reads both ==");
const s1 = asServer(`select count(*) from public.ai_cost_log where user_id = '${U}'`);
ok("the service role reads ai_cost_log", s1.ok && s1.out === "1", s1.out);
const s2 = asServer(`select count(*) from public.ai_provider_log where user_id = '${U}'`);
ok("the service role reads ai_provider_log", s2.ok && s2.out === "1", s2.out);

sql(`delete from auth.users where id = '${U}'`);

console.log(failures.length === 0 ? `\nALL PASS: ${pass} passed, 0 failed` : `\nFAILED: ${pass} passed, ${failures.length} failed`);
process.exit(failures.length === 0 ? 0 : 1);
