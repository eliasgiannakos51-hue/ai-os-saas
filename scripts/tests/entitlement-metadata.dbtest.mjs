// THE ENTITLEMENT KEYS OF user_metadata ARE THE SERVER'S, AGAINST A REAL POSTGRES.
//
// supabase/migrations/20261010000000_guard_entitlement_metadata.sql.
// Supabase Auth writes auth.users as supabase_auth_admin. This file makes
// changes AS THAT ROLE and looks at the row: the plan, the team grant, the
// Stripe ids, the interval, the seats and the beta flag keep the value they
// had; the display name changes; a new account cannot be born with them.
// And the server's own write, public.merge_user_metadata, still sets them.
//
// Run: node scripts/tests/entitlement-metadata.dbtest.mjs   (needs a
// database; run through `npm run test:db`, which provisions one)
import { execFileSync } from "node:child_process";

let pass = 0;
const failures = [];
const ok = (name, cond, detail) => {
  if (cond) { pass++; console.log(`  PASS  ${name}`); }
  else { failures.push(name); console.log(`  FAIL  ${name}${detail !== undefined ? "\n        " + detail : ""}`); }
};
const eq = (name, actual, expected) =>
  ok(name, actual === expected, `expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);

if (!process.env.DATABASE_URL && !process.env.PGDATABASE) {
  console.log("entitlement-metadata: SKIPPED — no DATABASE_URL or PGDATABASE");
  process.exit(0);
}

const PSQL_TAG = /^(BEGIN|COMMIT|ROLLBACK|SET|DO|INSERT \d+ \d+|UPDATE \d+|DELETE \d+|SELECT \d+)$/;
function answer(out) {
  const lines = out.split("\n").map((l) => l.trim()).filter((l) => l !== "" && !PSQL_TAG.test(l));
  return lines.length === 0 ? "" : lines[lines.length - 1];
}
const dbArgs = () => (process.env.DATABASE_URL ? ["-d", process.env.DATABASE_URL] : ["-d", process.env.PGDATABASE]);
const sql = (query) =>
  answer(execFileSync("psql", [...dbArgs(), "-v", "ON_ERROR_STOP=1", "-tAc", query], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }));
// As Supabase Auth: the role it connects as.
const asAuth = (query) => sql(`begin; set local role supabase_auth_admin; ${query}; commit;`);

console.log("entitlement-metadata");

const U = "eeeeeeee-0000-0000-0000-000000000401";
const NEW = "eeeeeeee-0000-0000-0000-000000000402";
// In production supabase_auth_admin OWNS the auth schema; the throwaway
// database built from scripts/db/bootstrap-supabase.sql gives it nothing,
// so the rights it really has are granted here — and TAKEN BACK at the
// end, in `finally`: the database is shared with the suites that run
// after this one, and role-grants.dbtest.mjs holds every holding to a
// named list.
const GRANT = `grant usage on schema auth to supabase_auth_admin; grant select, insert, update on auth.users to supabase_auth_admin`;
const REVOKE = `revoke select, insert, update on auth.users from supabase_auth_admin; revoke usage on schema auth from supabase_auth_admin`;
sql(GRANT);
try {
  sql(`delete from auth.users where id in ('${U}', '${NEW}')`);
  sql(`insert into auth.users (id, email, raw_user_meta_data) values
    ('${U}', 'guard-one@test.local', '{"subscription_tier":"free","seat_count":0,"display_name":"A"}'::jsonb)`);
  const meta = (id, key) => sql(`select coalesce(raw_user_meta_data ->> '${key}', '(absent)') from auth.users where id = '${id}'`);

  console.log("\n== 1. the plan fields keep their value under the auth role ==");
  asAuth(`update auth.users set raw_user_meta_data = raw_user_meta_data || '{"subscription_tier":"ultimate","billing_interval":"year","seat_count":50,"stripe_customer_id":"cus_X","stripe_subscription_id":"sub_X","team_granted_tier":"ultimate","team_owner_id":"x","is_beta_tester":true,"display_name":"B"}'::jsonb where id = '${U}'`);
  eq("the plan keeps its value", meta(U, "subscription_tier"), "free");
  eq("the seats keep theirs", meta(U, "seat_count"), "0");
  for (const k of ["billing_interval", "stripe_customer_id", "stripe_subscription_id", "team_granted_tier", "team_owner_id", "is_beta_tester"]) {
    eq(`${k} cannot be added`, meta(U, k), "(absent)");
  }
  eq("...and the rest of the profile does change", meta(U, "display_name"), "B");

  console.log("\n== 2. and are not removed by it ==");
  asAuth(`update auth.users set raw_user_meta_data = '{"display_name":"C"}'::jsonb where id = '${U}'`);
  eq("replacing the whole object keeps the plan", meta(U, "subscription_tier"), "free");
  eq("...and the new name lands", meta(U, "display_name"), "C");

  console.log("\n== 3. a new account starts without them ==");
  asAuth(`insert into auth.users (id, email, raw_user_meta_data) values ('${NEW}', 'guard-new@test.local', '{"subscription_tier":"ultimate","is_beta_tester":true,"country":"GR"}'::jsonb)`);
  eq("a new account carries no plan it set itself", meta(NEW, "subscription_tier"), "(absent)");
  eq("...nor the beta flag", meta(NEW, "is_beta_tester"), "(absent)");
  eq("...but keeps what it may set", meta(NEW, "country"), "GR");

  console.log("\n== 4. the server still can ==");
  sql(`select public.merge_user_metadata('${U}', '{"subscription_tier":"growth","stripe_customer_id":"cus_REAL"}'::jsonb)`);
  eq("merge_user_metadata sets the plan", meta(U, "subscription_tier"), "growth");
  eq("...and the Stripe customer", meta(U, "stripe_customer_id"), "cus_REAL");
  sql(`select public.merge_user_metadata('${NEW}', '{"subscription_tier":"free","seat_count":0}'::jsonb)`);
  eq("the signup's starting plan is written by the server", meta(NEW, "subscription_tier"), "free");

  console.log("\n== 5. the fence is a trigger on auth.users ==");
  eq(
    "it is attached",
    sql(`select count(*) from pg_trigger t join pg_class c on c.oid = t.tgrelid join pg_namespace n on n.oid = c.relnamespace
         where n.nspname = 'auth' and c.relname = 'users' and t.tgname = 'guard_entitlement_metadata'`),
    "1",
  );

  sql(`delete from auth.users where id in ('${U}', '${NEW}')`);
} finally {
  sql(REVOKE);
}

console.log(failures.length === 0 ? `\nALL PASS: ${pass} passed, 0 failed` : `\nFAILED: ${pass} passed, ${failures.length} failed`);
process.exit(failures.length === 0 ? 0 : 1);
