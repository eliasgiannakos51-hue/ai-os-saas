// A GRANT WITHOUT A POLICY IS AN OPEN DOOR ONTO AN EMPTY ROOM.
//
// The rule this codebase already knew is the other direction: A POLICY
// WITHOUT A GRANT IS A LOCKED DOOR — Postgres checks table privileges
// before row policies, so a perfect policy over a table with no GRANT
// refuses everybody. Every migration here is written with that in mind.
//
// THIS FILE IS THE INVERSE, and it is worse, because it is SILENT. With
// row level security on, a verb that is GRANTED but has no matching
// policy is not refused: it matches no rows and reports success. A DELETE
// returns "DELETE 0". An UPDATE returns "UPDATE 0". Nothing raises, no
// log line appears, and the feature simply never works — which is how
// `usage_overage_settings` shipped with `grant delete` and a select-only
// policy, so a customer cancelling their overage would have been told it
// worked, every time, while it stayed on. Found by
// revenue-engine.dbtest.mjs deleting the row as the customer and then
// going and looking; generalised here so the next one cannot happen.
//
// MEASURED FROM THE CATALOG, NOT PARSED FROM THE SQL. What matters is
// what the database ended up with after all 39 migrations, not what any
// one file appears to say.
//
// CROSS-PRODUCT, NOT SAMPLING: every RLS table x every verb granted to
// `authenticated`.
//
// Run: node scripts/tests/grants-vs-policies.dbtest.mjs   (needs a
// database; run through `npm run test:db`, which provisions one)
import { execFileSync } from "node:child_process";

let pass = 0;
const failures = [];
const ok = (name, cond, detail) => {
  if (cond) { pass++; console.log(`  PASS  ${name}`); }
  else { failures.push(name); console.log(`  FAIL  ${name}${detail !== undefined ? "\n        " + detail : ""}`); }
};

const dbArgs = () => (process.env.DATABASE_URL ? ["-d", process.env.DATABASE_URL] : ["-d", process.env.PGDATABASE]);

// One row per (table, verb) granted to `authenticated` on a table with
// RLS on, alongside every policy command that could satisfy it. A policy
// is only counted when it applies to `authenticated` or to PUBLIC — a
// policy scoped to some other role does not unlock this grant.
const QUERY = `
select p.table_name, p.privilege_type,
  coalesce((select string_agg(distinct pol.cmd, ',') from pg_policies pol
            where pol.schemaname = 'public'
              and pol.tablename = p.table_name
              and (pol.roles @> array['authenticated']::name[]
                   or pol.roles @> array['public']::name[])), 'NONE')
from information_schema.table_privileges p
join pg_class c on c.relname = p.table_name
join pg_namespace n on n.oid = c.relnamespace and n.nspname = 'public'
where p.table_schema = 'public'
  and p.grantee = 'authenticated'
  and c.relrowsecurity
  and p.privilege_type in ('SELECT', 'INSERT', 'UPDATE', 'DELETE')
order by 1, 2;`;

const out = execFileSync("psql", [...dbArgs(), "-v", "ON_ERROR_STOP=1", "-tAF|", "-c", QUERY], {
  encoding: "utf8",
  stdio: ["ignore", "pipe", "pipe"],
});

const rows = out
  .trim()
  .split("\n")
  .filter((line) => line.trim() !== "")
  .map((line) => {
    const [table, privilege, cmds] = line.split("|");
    return { table, privilege, cmds: cmds ?? "" };
  });

console.log("== every verb granted to a signed-in client has a policy that can satisfy it ==");

// THE INSTRUMENT ITSELF, CHECKED FIRST. A query that returned nothing
// would pass every assertion below while proving nothing at all — the
// exact failure mode of a grep-shaped test.
ok(`the catalog query found grants to check (${rows.length} table/verb pairs)`, rows.length >= 40, out.slice(0, 200));
ok(
  "…across many tables",
  new Set(rows.map((r) => r.table)).size >= 15,
  String(new Set(rows.map((r) => r.table)).size)
);

const silent = rows.filter((row) => {
  const commands = new Set(row.cmds.split(",").map((c) => c.trim().toUpperCase()));
  // FOR ALL covers every verb; otherwise the command must match exactly.
  if (commands.has("ALL")) return false;
  return !commands.has(row.privilege);
});

ok(
  "no table grants a verb that silently affects zero rows",
  silent.length === 0,
  silent.map((r) => `${r.table}: granted ${r.privilege}, policies=[${r.cmds}]`).join("\n        ")
);

// AND THE CHECK CAN GO RED. A gate that cannot detect the thing it exists
// for is decoration, so the same comparison is run against a fabricated
// row — the shape of the bug that was actually shipped.
const wouldCatch = [{ table: "usage_overage_settings", privilege: "DELETE", cmds: "SELECT" }].filter((row) => {
  const commands = new Set(row.cmds.split(",").map((c) => c.trim().toUpperCase()));
  return !commands.has("ALL") && !commands.has(row.privilege);
});
ok("…and the comparison catches the bug this file was written for", wouldCatch.length === 1);

console.log(`\n${failures.length === 0 ? "ALL PASS" : "FAILURES"}: ${pass} passed, ${failures.length} failed`);
if (failures.length) { console.log(failures.map((f) => "  - " + f).join("\n")); process.exit(1); }
