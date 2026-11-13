// THE BUSINESS'S OWN NETWORK, ASKED OF A REAL POSTGRES.
//
// supabase/migrations/20261121000000_business_contacts.sql makes claims
// a reading of its text cannot settle: that business_contact_record()
// actually inserts a row, that saying the same name again bumps
// mention_count instead of creating a second row, that the newest role
// wins while a missing detail keeps the old one, that two different
// people really are two rows, that the signed-in role cannot read
// someone else's contacts or write a row directly (no insert/update
// policy), and that calling the function with no session is refused.
//
// This is also the suite scripts/tests/derived-data-health.test.mjs
// requires for business_contacts: it is written only from inside a
// database function (business_contact_record), so the census needs a
// suite that ADDRESSES the table (`from("business_contacts")`) and ASKS
// how many rows it holds (count(*)) — this file does both, for real,
// against a real database, rather than a stub.
//
// Run: DATABASE_URL=... node scripts/tests/business-contacts.dbtest.mjs
//  or: npm run test:db -- business-contacts
import { execFileSync } from "node:child_process";

let pass = 0;
const failures = [];
const ok = (name, cond, detail) => {
  if (cond) { pass++; console.log(`  PASS  ${name}`); }
  else { failures.push(name); console.log(`  FAIL  ${name}${detail !== undefined ? "\n        " + detail : ""}`); }
};

if (!process.env.DATABASE_URL && !process.env.PGDATABASE) {
  console.log("business-contacts: SKIPPED — no DATABASE_URL or PGDATABASE");
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
const denied = (r) => !r.ok && /permission denied/.test(r.out);

console.log("business-contacts");

const U = "cccccccc-0000-0000-0000-000000000001";
const V = "cccccccc-0000-0000-0000-000000000002";
sql(`delete from public.business_contacts where user_id in ('${U}', '${V}')`);
sql(`delete from auth.users where id in ('${U}', '${V}')`);
sql(`insert into auth.users (id, email) values ('${U}', 'bc-u@test.local'), ('${V}', 'bc-v@test.local')`);

console.log("\n== 1. no session, no row ==");
{
  const r = run(`select public.business_contact_record('Γιώργος', 'γιωργος', 'supplier', null, null)`);
  ok("calling the function with no authenticated user is refused", !r.ok && /no authenticated user/.test(r.out), r.out);
}

console.log("\n== 2. a name becomes a row, said again it is the same row ==");
{
  asUser(U, `select public.business_contact_record('Γιώργος Παπά', 'γιωργος παπα', 'supplier', '6971234567', null)`);
  const count1 = sql(`select count(*) from public.business_contacts where user_id = '${U}'`);
  ok("one row after the first mention", count1 === "1", count1);
  const row1 = sql(`select role || '|' || coalesce(detail,'<null>') || '|' || mention_count from public.business_contacts where user_id = '${U}' and name_fold = 'γιωργος παπα'`);
  ok("role, detail and a mention count of 1", row1 === "supplier|6971234567|1", row1);

  asUser(U, `select public.business_contact_record('Γιώργος Παπά', 'γιωργος παπα', 'customer', null, null)`);
  const count2 = sql(`select count(*) from public.business_contacts where user_id = '${U}'`);
  ok("saying the same name again does not create a second row", count2 === "1", count2);
  const row2 = sql(`select role || '|' || coalesce(detail,'<null>') || '|' || mention_count from public.business_contacts where user_id = '${U}' and name_fold = 'γιωργος παπα'`);
  ok("the newest role wins, and a mention with no detail keeps the old one, and the count grew", row2 === "customer|6971234567|2", row2);
}

console.log("\n== 3. two different people are two rows ==");
{
  asUser(U, `select public.business_contact_record('Μαρία', 'μαρια', 'customer', null, null)`);
  const count = sql(`select count(*) from public.business_contacts where user_id = '${U}'`);
  ok("a second person is a second row", count === "2", count);
}

console.log("\n== 4. an unrecognised role is filed as 'other', not refused ==");
{
  const r = asUser(U, `select public.business_contact_record('Νίκος', 'νικος', 'rival', null, null)`);
  ok("the call succeeds", r.ok, r.out);
  const role = sql(`select role from public.business_contacts where user_id = '${U}' and name_fold = 'νικος'`);
  ok("...filed as 'other'", role === "other", role);
}

console.log("\n== 5. RLS: the signed-in role sees only its own rows, and cannot write directly ==");
{
  asUser(V, `select public.business_contact_record('Ξένος', 'ξενος', 'customer', null, null)`);
  const vCount = asUser(V, `select count(*) from public.business_contacts`);
  ok("V sees only V's own row", vCount.ok && vCount.out === "1", vCount.out);
  const uReadsV = asUser(U, `select count(*) from public.business_contacts where name_fold = 'ξενος'`);
  ok("U does not see V's contact", uReadsV.ok && uReadsV.out === "0", uReadsV.out);
  const directInsert = asUser(U, `insert into public.business_contacts (user_id, name, name_fold) values ('${U}', 'x', 'x')`);
  ok("a direct insert from the signed-in role is refused — only the function can write", denied(directInsert), directInsert.out);
  const directUpdate = asUser(U, `update public.business_contacts set mention_count = 99 where user_id = '${U}'`);
  ok("...and so is a direct update", denied(directUpdate), directUpdate.out);
  const uDeletesOwn = asUser(U, `delete from public.business_contacts where user_id = '${U}' and name_fold = 'μαρια'`);
  ok("...but the account can delete its own row", uDeletesOwn.ok, uDeletesOwn.out);
}

sql(`delete from public.business_contacts where user_id in ('${U}', '${V}')`);
sql(`delete from auth.users where id in ('${U}', '${V}')`);

console.log(`\n${failures.length === 0 ? "ALL PASS" : "FAILED"}: ${pass} passed, ${failures.length} failed`);
if (failures.length > 0) process.exit(1);
