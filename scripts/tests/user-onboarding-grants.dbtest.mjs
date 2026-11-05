// THE FREE ACTIVATION RUN CANNOT BE UN-SPENT BY THE ACCOUNT, AGAINST A REAL
// POSTGRES (2026-11-05 review, A2).
//
// supabase/migrations/20261115000001_user_onboarding_column_grants.sql. As
// the signed-in role, on the account's OWN row: the flow's progress
// columns still write, through the same statements the app sends
// (api/onboarding's upsert, api/home/seen's update), and
// activation_used_at does not. The server still claims the run.
//
// Run: node scripts/tests/user-onboarding-grants.dbtest.mjs   (needs a
// database; run through `npm run test:db`, which provisions one)
import { execFileSync } from "node:child_process";

let pass = 0;
const failures = [];
const ok = (name, cond, detail) => {
  if (cond) { pass++; console.log(`  PASS  ${name}`); }
  else { failures.push(name); console.log(`  FAIL  ${name}${detail !== undefined ? "\n        " + detail : ""}`); }
};

if (!process.env.DATABASE_URL && !process.env.PGDATABASE) {
  console.log("user-onboarding-grants: SKIPPED — no DATABASE_URL or PGDATABASE");
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

console.log("user-onboarding-grants");

const U = "eeeeeeee-0000-0000-0000-000000000d01";
sql(`delete from auth.users where id = '${U}'`);
sql(`insert into auth.users (id, email) values ('${U}', 'onboarding-grants@test.local')`);

try {
  console.log("\n== 1. the flow's own progress still writes ==");
  // The statement PostgREST builds for api/onboarding's upsert: an insert
  // that, on the existing row, updates every column it sent.
  const upsertSql = (goal) =>
    `insert into public.user_onboarding (user_id, goal, completed_at) values ('${U}', '${goal}', now()) on conflict (user_id) do update set user_id = excluded.user_id, goal = excluded.goal, completed_at = excluded.completed_at`;
  const first = asUser(U, upsertSql("first"));
  ok("the upsert creates the row", first.ok, first.out);
  const second = asUser(U, upsertSql("second"));
  ok("...and updates it the second time", second.ok && sql(`select goal from public.user_onboarding where user_id = '${U}'`) === "second", second.out);
  const skipped = asUser(U, `update public.user_onboarding set skipped_at = now() where user_id = '${U}'`);
  ok("skipped_at writes", skipped.ok, skipped.out);
  const seen = asUser(U, `update public.user_onboarding set home_seen_at = now() where user_id = '${U}'`);
  ok("home_seen_at writes (api/home/seen)", seen.ok, seen.out);

  console.log("\n== 2. the free run stays spent ==");
  const claimed = asServer(`select public.claim_activation_run('${U}')`);
  ok("the server claims the free run", claimed.ok && claimed.out === "t", claimed.out);
  const reset = asUser(U, `update public.user_onboarding set activation_used_at = null where user_id = '${U}'`);
  ok("the account cannot clear activation_used_at", denied(reset), reset.out);
  ok("...and it is still set", sql(`select activation_used_at is not null from public.user_onboarding where user_id = '${U}'`) === "t");
  const viaUpsert = asUser(
    U,
    `insert into public.user_onboarding (user_id, activation_used_at) values ('${U}', null) on conflict (user_id) do update set activation_used_at = excluded.activation_used_at`
  );
  ok("...not through an upsert either", denied(viaUpsert), viaUpsert.out);
  const again = asServer(`select public.claim_activation_run('${U}')`);
  ok("...so a second claim is refused", again.ok && again.out === "f", again.out);
  const created = asUser(U, `update public.user_onboarding set created_at = now() where user_id = '${U}'`);
  ok("created_at is the server's too", denied(created), created.out);

  console.log("\n== 3. the catalog says the same ==");
  ok(
    "authenticated holds UPDATE on exactly the five columns",
    sql(
      `select string_agg(column_name, ',' order by column_name) from information_schema.column_privileges where table_schema = 'public' and table_name = 'user_onboarding' and grantee = 'authenticated' and privilege_type = 'UPDATE'`
    ) === "completed_at,goal,home_seen_at,skipped_at,user_id"
  );
} finally {
  sql(`delete from auth.users where id = '${U}'`);
}

console.log(failures.length === 0 ? `\nALL PASS: ${pass} passed, 0 failed` : `\nFAILED: ${pass} passed, ${failures.length} failed`);
process.exit(failures.length === 0 ? 0 : 1);
