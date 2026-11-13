// BOTH ENDS OF A LINK BELONG TO THE ACCOUNT THAT MADE IT, AGAINST A REAL
// POSTGRES (2026-11-05 review, A3).
//
// supabase/migrations/20261115000002_entity_links_same_owner.sql. As the
// signed-in role and as the service role: a link between two of the
// account's own rows is written; a link with either end in another
// account's row, in a row that does not exist, or in a table that cannot
// be linked, is refused. And every table the app offers to link
// (src/lib/knowledge-graph.ts's three registries, plus projects) is one
// the trigger accepts — otherwise a real link would be refused.
//
// Run: node scripts/tests/entity-links-owner.dbtest.mjs   (needs a
// database; run through `npm run test:db`, which provisions one)
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

let pass = 0;
const failures = [];
const ok = (name, cond, detail) => {
  if (cond) { pass++; console.log(`  PASS  ${name}`); }
  else { failures.push(name); console.log(`  FAIL  ${name}${detail !== undefined ? "\n        " + detail : ""}`); }
};

if (!process.env.DATABASE_URL && !process.env.PGDATABASE) {
  console.log("entity-links-owner: SKIPPED — no DATABASE_URL or PGDATABASE");
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
const refused = (r) => !r.ok && /entity_links:/.test(r.out);

console.log("entity-links-owner");

const A = "eeeeeeee-0000-0000-0000-000000000e01";
const B = "eeeeeeee-0000-0000-0000-000000000e02";
const PA = "eeeeeeee-0000-0000-0000-000000000ea1"; // A's project
const PB = "eeeeeeee-0000-0000-0000-000000000eb1"; // B's project
const IA = "eeeeeeee-0000-0000-0000-000000000ea2"; // A's idea
const IB = "eeeeeeee-0000-0000-0000-000000000eb2"; // B's idea
const NOPE = "eeeeeeee-0000-0000-0000-000000000e99";
sql(`delete from auth.users where id in ('${A}', '${B}')`);
sql(`insert into auth.users (id, email) values ('${A}', 'links-a@test.local'), ('${B}', 'links-b@test.local')`);
sql(`insert into public.projects (id, user_id, name) values ('${PA}', '${A}', 'A project'), ('${PB}', '${B}', 'B project')`);
sql(`insert into public.ideas (id, user_id, name) values ('${IA}', '${A}', 'A idea'), ('${IB}', '${B}', 'B idea')`);

const link = (owner, srcTable, srcId, tgtTable, tgtId) =>
  `insert into public.entity_links (user_id, source_table, source_id, target_table, target_id, relationship_type) values ('${owner}', '${srcTable}', '${srcId}', '${tgtTable}', '${tgtId}', 'in_project')`;

try {
  console.log("\n== 1. the account's own two rows link ==");
  const own = asUser(A, link(A, "ideas", IA, "projects", PA));
  ok("an idea into the account's own project", own.ok, own.out);

  console.log("\n== 2. an end in another account's row is refused ==");
  ok("another account's idea into my project", refused(asUser(A, link(A, "ideas", IB, "projects", PA))));
  ok("my idea into another account's project", refused(asUser(A, link(A, "ideas", IA, "projects", PB))));
  ok("…by the service role as well", refused(asServer(link(A, "ideas", IB, "projects", PA))));
  const shared = sql(`select count(*) from public.entity_links where user_id = '${A}' and (source_id = '${IB}' or target_id = '${PB}')`);
  ok("…and none of them was written", shared === "0", shared);

  console.log("\n== 3. an end that is not a linkable row is refused ==");
  ok("a row that does not exist", refused(asUser(A, link(A, "ideas", NOPE, "projects", PA))));
  ok("a table that does not exist", refused(asUser(A, link(A, "no_such_table", IA, "projects", PA))));
  ok("a table with no owner column", refused(asServer(link(A, "help_articles", IA, "projects", PA))));
  ok("a name that is not an identifier", refused(asUser(A, link(A, "ideas; drop table ideas", IA, "projects", PA))));
  ok("…and the table is still there", sql(`select count(*) from public.ideas where id = '${IA}'`) === "1");

  console.log("\n== 4. moving a link onto another account's row is refused too ==");
  const moved = asServer(`update public.entity_links set source_id = '${IB}' where user_id = '${A}' and source_id = '${IA}'`);
  ok("an update that points an end elsewhere", refused(moved), moved.out);

  console.log("\n== 5. every table the app offers to link is one the trigger accepts ==");
  const registries = ["src/lib/classifier-modules.ts", "src/lib/build-modules.ts", "src/lib/projects/linkable-extras.ts", "src/lib/modules.ts"];
  const tables = new Set(["projects"]);
  for (const f of registries) for (const m of readFileSync(f, "utf8").matchAll(/table: "([a-z_0-9]+)"/g)) tables.add(m[1]);
  ok(`the linkable tables were read (${tables.size})`, tables.size >= 20, [...tables].join(", "));
  const missing = [];
  for (const t of tables) {
    const n = sql(
      `select count(*) from information_schema.columns where table_schema = 'public' and table_name = '${t}' and column_name in ('id', 'user_id')`
    );
    if (n !== "2") missing.push(t);
  }
  ok("every one has an id and a user_id", missing.length === 0, missing.join(", "));
} finally {
  sql(`delete from auth.users where id in ('${A}', '${B}')`);
}

console.log(failures.length === 0 ? `\nALL PASS: ${pass} passed, 0 failed` : `\nFAILED: ${pass} passed, ${failures.length} failed`);
process.exit(failures.length === 0 ? 0 : 1);
