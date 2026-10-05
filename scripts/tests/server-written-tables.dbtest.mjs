// TEAM INVITES, FILE ROWS AND PUBLISHED PAGES ARE WRITTEN BY THE SERVER
// ONLY, AGAINST A REAL POSTGRES.
//
// supabase/migrations/20261014000000_server_written_tables.sql. As the
// signed-in role, on the account's OWN rows: reading works, inserting,
// updating and deleting do not. As the service role, all of it does.
//
// Run: node scripts/tests/server-written-tables.dbtest.mjs   (needs a
// database; run through `npm run test:db`, which provisions one)
import { execFileSync } from "node:child_process";

let pass = 0;
const failures = [];
const ok = (name, cond, detail) => {
  if (cond) { pass++; console.log(`  PASS  ${name}`); }
  else { failures.push(name); console.log(`  FAIL  ${name}${detail !== undefined ? "\n        " + detail : ""}`); }
};

if (!process.env.DATABASE_URL && !process.env.PGDATABASE) {
  console.log("server-written-tables: SKIPPED — no DATABASE_URL or PGDATABASE");
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

console.log("server-written-tables");

const U = "eeeeeeee-0000-0000-0000-000000000801";
const W = "eeeeeeee-0000-0000-0000-0000000008a1";
sql(`delete from auth.users where id = '${U}'`);
sql(`insert into auth.users (id, email) values ('${U}', 'server-written@test.local')`);
sql(`insert into public.user_websites (id, user_id, name, html_content) values ('${W}', '${U}', 'site', '<p>x</p>')`);
sql(`insert into public.team_members (owner_id, member_email, role) values ('${U}', 'member@test.local', 'Ops')`);
sql(`insert into public.user_files (user_id, filename, file_type, size_bytes, storage_path) values ('${U}', 'a.txt', 'txt', 10, '${U}/a')`);
sql(`insert into public.published_sites (website_id, user_id, subdomain, html_content) values ('${W}', '${U}', 'server-written-test', '<p>x</p>')`);

const CASES = [
  {
    table: "team_members",
    read: `select count(*) from public.team_members where owner_id = '${U}'`,
    insert: `insert into public.team_members (owner_id, member_email, role) values ('${U}', 'another@test.local', 'Ops')`,
    update: `update public.team_members set member_email = 'x@test.local' where owner_id = '${U}'`,
    del: `delete from public.team_members where owner_id = '${U}'`,
  },
  {
    table: "user_files",
    read: `select count(*) from public.user_files where user_id = '${U}'`,
    insert: `insert into public.user_files (user_id, filename, file_type, size_bytes, storage_path) values ('${U}', 'b.txt', 'txt', 10, '${U}/b')`,
    update: `update public.user_files set size_bytes = 0 where user_id = '${U}'`,
    del: `delete from public.user_files where user_id = '${U}'`,
  },
  {
    table: "published_sites",
    read: `select count(*) from public.published_sites where user_id = '${U}'`,
    insert: `insert into public.published_sites (website_id, user_id, subdomain, html_content) values ('${W}', '${U}', 'server-written-two', '<p>y</p>')`,
    update: `update public.published_sites set html_content = '<p>z</p>' where user_id = '${U}'`,
    del: `delete from public.published_sites where user_id = '${U}'`,
  },
];

for (const c of CASES) {
  console.log(`\n== ${c.table} ==`);
  const r = asUser(U, c.read);
  ok(`${c.table}: the account reads its own rows`, r.ok && r.out === "1", r.out);
  ok(`${c.table}: ...but cannot insert`, denied(asUser(U, c.insert)));
  ok(`${c.table}: ...nor update`, denied(asUser(U, c.update)));
  ok(`${c.table}: ...nor delete`, denied(asUser(U, c.del)));
  ok(`${c.table}: the row is as the server left it`, sql(c.read) === "1");
  const s = asServer(c.update);
  ok(`${c.table}: the server still writes`, s.ok, s.out);
}

sql(`delete from auth.users where id = '${U}'`);

console.log(failures.length === 0 ? `\nALL PASS: ${pass} passed, 0 failed` : `\nFAILED: ${pass} passed, ${failures.length} failed`);
process.exit(failures.length === 0 ? 0 : 1);
