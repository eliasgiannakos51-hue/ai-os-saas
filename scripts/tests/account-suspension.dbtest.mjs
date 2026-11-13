// A SUSPENSION THE ACCOUNT CANNOT LIFT, AND THE LIST THE CRONS READ,
// AGAINST A REAL POSTGRES (2026-11-05 review, A1).
//
// supabase/migrations/20261115000000_account_suspension.sql:
//   1. the four suspension keys an older suspension wrote into
//      user_metadata keep their value when Supabase Auth's own role
//      (which is how an account edits its own metadata) changes the object
//   2. the server still removes them, through merge_user_metadata
//   3. suspended_user_ids() returns exactly the suspended accounts —
//      app_metadata flag, older user_metadata flag, ban in force — and
//      no other, and only the service role may call it
//
// Run: node scripts/tests/account-suspension.dbtest.mjs   (needs a database;
// run through `npm run test:db`, which provisions one)
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
  console.log("account-suspension: SKIPPED — no DATABASE_URL or PGDATABASE");
  process.exit(0);
}

const PSQL_TAG = /^(BEGIN|COMMIT|ROLLBACK|SET|DO|INSERT \d+ \d+|UPDATE \d+|DELETE \d+|SELECT \d+)$/;
const dbArgs = () => (process.env.DATABASE_URL ? ["-d", process.env.DATABASE_URL] : ["-d", process.env.PGDATABASE]);
function run(query) {
  try {
    const out = execFileSync("psql", [...dbArgs(), "-v", "ON_ERROR_STOP=1", "-tAc", query], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
    const lines = out.split("\n").map((l) => l.trim()).filter((l) => l !== "" && !PSQL_TAG.test(l));
    return { ok: true, out: lines.join("\n") };
  } catch (err) {
    return { ok: false, out: String(err.stderr ?? err.message) };
  }
}
const sql = (q) => {
  const r = run(q);
  if (!r.ok) throw new Error(r.out);
  return r.out;
};
const asAuth = (q) => sql(`begin; set local role supabase_auth_admin; ${q}; commit;`);
const as = (role, q) => run(`begin; set local role ${role}; ${q}; commit;`);

console.log("account-suspension");

const OLD = "eeeeeeee-0000-0000-0000-000000000c01"; // suspended the old way
const APP = "eeeeeeee-0000-0000-0000-000000000c02"; // suspended through app_metadata
const BAN = "eeeeeeee-0000-0000-0000-000000000c03"; // banned, nothing else
const PAST = "eeeeeeee-0000-0000-0000-000000000c04"; // a ban that ran out
const FINE = "eeeeeeee-0000-0000-0000-000000000c05"; // nobody
const ALL = [OLD, APP, BAN, PAST, FINE];
const GRANT = `grant usage on schema auth to supabase_auth_admin; grant select, insert, update on auth.users to supabase_auth_admin`;
const REVOKE = `revoke select, insert, update on auth.users from supabase_auth_admin; revoke usage on schema auth from supabase_auth_admin`;
const list = ALL.map((u) => `'${u}'`).join(", ");

sql(GRANT);
try {
  sql(`delete from auth.users where id in (${list})`);
  sql(`insert into auth.users (id, email, raw_user_meta_data, raw_app_meta_data, banned_until) values
    ('${OLD}', 'susp-old@test.local', '{"suspended":true,"suspended_reason":"r","suspended_at":"t","suspended_by":"a","display_name":"A"}'::jsonb, '{}'::jsonb, null),
    ('${APP}', 'susp-app@test.local', '{}'::jsonb, '{"suspended":true,"provider":"email"}'::jsonb, null),
    ('${BAN}', 'susp-ban@test.local', '{}'::jsonb, '{}'::jsonb, now() + interval '100 years'),
    ('${PAST}', 'susp-past@test.local', '{}'::jsonb, '{}'::jsonb, now() - interval '1 day'),
    ('${FINE}', 'susp-fine@test.local', '{"suspended":false}'::jsonb, '{"suspended":false}'::jsonb, null)`);
  const meta = (id, key) => sql(`select coalesce(raw_user_meta_data ->> '${key}', '(absent)') from auth.users where id = '${id}'`);

  console.log("\n== 1. the account cannot clear an older suspension ==");
  asAuth(`update auth.users set raw_user_meta_data = raw_user_meta_data || '{"suspended":false,"suspended_reason":"","display_name":"B"}'::jsonb where id = '${OLD}'`);
  eq("suspended keeps its value", meta(OLD, "suspended"), "true");
  eq("...and so does the reason", meta(OLD, "suspended_reason"), "r");
  eq("...while the rest of the profile changes", meta(OLD, "display_name"), "B");
  asAuth(`update auth.users set raw_user_meta_data = '{"display_name":"C"}'::jsonb where id = '${OLD}'`);
  for (const k of ["suspended", "suspended_at", "suspended_by"]) {
    ok(`replacing the whole object keeps ${k}`, meta(OLD, k) !== "(absent)");
  }
  asAuth(`update auth.users set raw_user_meta_data = raw_user_meta_data || '{"suspended":true}'::jsonb where id = '${FINE}'`);
  eq("...nor set one on itself", meta(FINE, "suspended"), "false");

  console.log("\n== 2. the server still removes them ==");
  sql(`select public.merge_user_metadata('${FINE}', '{}'::jsonb, array['suspended','suspended_reason','suspended_at','suspended_by'])`);
  eq("merge_user_metadata removes the flag", meta(FINE, "suspended"), "(absent)");

  console.log("\n== 3. the crons' list ==");
  const r = as("service_role", `select user_id from public.suspended_user_ids() where user_id in (${list}) order by user_id`);
  ok("the service role reads it", r.ok, r.out);
  eq("...and it is exactly the three suspended accounts", r.out, [OLD, APP, BAN].sort().join("\n"));
  for (const role of ["authenticated", "anon"]) {
    const denied = as(role, `select count(*) from public.suspended_user_ids()`);
    ok(`${role} may not call it`, !denied.ok && /permission denied/.test(denied.out), denied.out);
  }
} finally {
  try { sql(`delete from auth.users where id in (${list})`); } catch { /* best effort */ }
  sql(REVOKE);
}

console.log(failures.length === 0 ? `\nALL PASS: ${pass} passed, 0 failed` : `\nFAILED: ${pass} passed, ${failures.length} failed`);
process.exit(failures.length === 0 ? 0 : 1);
