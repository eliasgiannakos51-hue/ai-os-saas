// A COPY TAKEN BY `npm run db:backup` COMES BACK WHOLE, AGAINST A REAL
// POSTGRES (docs/SECURITY-AUDIT.md ΑΣ-8.4, 2026-10-08).
//
// docs/OWNER.md said there was no copy of the data outside Supabase and
// that no restore had ever been tried. scripts/db/backup.mjs is the copy;
// this is the restore. On the database `npm run test:db` builds from every
// migration: two accounts and their rows, the copy, its --verify, then a
// restore into a SECOND, EMPTY server, and every table's count must come
// back equal to the count taken with the copy. Then a real archive with
// one table's rows left out must fail --verify, so the verify is not a
// yes-sayer.
//
// NOTHING HERE DESTROYS ANYTHING ON THE DATABASE IT IS POINTED AT
// (db-migrations.test.mjs §2b holds every dbtest to that, because
// scripts/db/run-dbtests.mjs can be pointed at a real one). The source is
// only read, apart from this file's own fixture rows, removed by id at the
// end. The restore goes to a private server this file starts and stops
// (scripts/lib/ephemeral-postgres.mjs), and the short archive is made by
// leaving a table's data out of a second pg_dump, not by emptying a table.
//
// What this does NOT show: a restore into a Supabase project, whose own
// auth and storage schemas are already there. That needs the production
// project, which this repository's sessions cannot reach.
//
// Run: node scripts/tests/backup-restore.dbtest.mjs   (needs a database;
// run through `npm run test:db`, which provisions one)
import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { startEphemeralPostgres, psqlArgs } from "../lib/ephemeral-postgres.mjs";

let pass = 0;
const failures = [];
const ok = (name, cond, detail) => {
  if (cond) { pass++; console.log(`  PASS  ${name}`); }
  else { failures.push(name); console.log(`  FAIL  ${name}${detail !== undefined ? "\n        " + detail : ""}`); }
};

const SOURCE = process.env.DATABASE_URL;
if (!SOURCE) {
  console.log("backup-restore: SKIPPED — no DATABASE_URL");
  process.exit(0);
}
const sql = (args, q) => execFileSync("psql", [...args, "-v", "ON_ERROR_STOP=1", "-tAc", q], { encoding: "utf8" }).trim();
const out = mkdtempSync(path.join(tmpdir(), "ionexa-backup-"));

console.log("backup-restore");
const U1 = "bbbbbbbb-0000-4000-8000-000000000001";
const U2 = "bbbbbbbb-0000-4000-8000-000000000002";
let target = null;
try {
  sql([SOURCE], `delete from auth.users where id in ('${U1}', '${U2}')`);
  sql([SOURCE], `insert into auth.users (id, email) values ('${U1}', 'backup-one@test.local'), ('${U2}', 'backup-two@test.local')`);
  sql([SOURCE], `insert into public.projects (user_id, name) values ('${U1}', 'Αύρα Νάξος'), ('${U2}', 'camping')`);
  sql([SOURCE], `insert into public.user_websites (user_id, name, html_content) values ('${U1}', 'site', '<p>γεια</p>')`);

  console.log("\n== 1. the copy ==");
  const run = spawnSync("node", ["scripts/db/backup.mjs", "--out", out], { encoding: "utf8", env: { PATH: process.env.PATH, DATABASE_URL: SOURCE } });
  const file = run.stdout.match(/^COPY: (.+)$/m)?.[1];
  ok("db:backup writes a copy", run.status === 0 && Boolean(file), run.stderr || run.stdout);
  const counts = file ? JSON.parse(readFileSync(`${file}.counts.json`, "utf8")).tables : {};
  ok(`...with the counts taken in the snapshot it copies (${Object.keys(counts).length} tables)`, Object.keys(counts).length > 50 && counts["public.projects"] >= 2 && counts["auth.users"] >= 2);
  const verify = spawnSync("node", ["scripts/db/backup.mjs", "--verify", file ?? "none"], { encoding: "utf8", env: { PATH: process.env.PATH } });
  ok("--verify finds the data of every counted table in it", verify.status === 0 && /VERIFIED/.test(verify.stdout), verify.stderr || verify.stdout);

  console.log("\n== 2. the restore, into a second, empty server ==");
  // A private server of its own, whatever DATABASE_URL points at: the
  // helper would hand back that same server if it saw the variable.
  const saved = { DATABASE_URL: process.env.DATABASE_URL, TEST_DATABASE_URL: process.env.TEST_DATABASE_URL };
  delete process.env.DATABASE_URL;
  delete process.env.TEST_DATABASE_URL;
  const pg = startEphemeralPostgres();
  for (const [k, v] of Object.entries(saved)) if (v !== undefined) process.env[k] = v;
  if (!pg.available) {
    ok(`a second server for the restore (${pg.reason})`, false);
  } else {
    target = pg;
    const TARGET = psqlArgs(pg.conn);
    // What a new Supabase project has before anything is restored: the
    // extensions and the roles, which the copy names but does not carry
    // (pg_dump copies schemas, not roles). Taken from the same bootstrap
    // the test database is built with, up to where it starts making the
    // auth and storage schemas — those come from the copy.
    const bootstrap = readFileSync("scripts/db/bootstrap-supabase.sql", "utf8");
    const cut = bootstrap.indexOf("create schema if not exists auth;");
    execFileSync("psql", [...TARGET, "-v", "ON_ERROR_STOP=1", "-q"], { input: bootstrap.slice(0, cut), encoding: "utf8" });
    // pg_restore takes the same -h/-p/-U/-d as psql; a URL goes in --dbname.
    const into = pg.conn.url ? ["--dbname", pg.conn.url] : TARGET;
    const restore = spawnSync("pg_restore", ["--no-owner", "--no-privileges", ...into, file ?? "none"], { encoding: "utf8" });
    const errors = (restore.stderr.match(/^pg_restore: error:.*$/gm) ?? []).filter((l) => !/schema "public" already exists/.test(l));
    ok("pg_restore finishes with no error but the public schema already being there", errors.length === 0, errors.slice(0, 5).join("\n        "));
    const differ = [];
    for (const [table, n] of Object.entries(counts)) {
      const [schema, name] = table.split(".");
      let got;
      try { got = Number(sql(TARGET, `select count(*) from "${schema}"."${name}"`)); } catch { got = NaN; }
      if (got !== n) differ.push(`${table}: ${n} copied, ${got} restored`);
    }
    ok(`every table comes back with the same rows (${Object.keys(counts).length})`, Object.keys(counts).length > 0 && differ.length === 0, differ.slice(0, 8).join("\n        "));
    let restoredName = "";
    try { restoredName = sql(TARGET, `select name from public.projects where user_id = '${U1}'`); } catch (err) { restoredName = String(err.stderr ?? err).trim(); }
    ok("...the accounts' own rows among them, letters and all", restoredName === "Αύρα Νάξος", restoredName);
  }

  console.log("\n== 3. --verify says no when the copy holds fewer rows than were counted ==");
  // A real archive without the projects' rows — the source is only read —
  // checked against the counts taken with the first copy.
  const short = path.join(out, "short.dump");
  const redump = spawnSync("pg_dump", [SOURCE, "--format=custom", "--no-owner", "--no-privileges", "--schema", "public", "--schema", "auth", "--schema", "storage", "--exclude-table-data=public.projects", "--file", short], { encoding: "utf8" });
  if (file) writeFileSync(`${short}.counts.json`, readFileSync(`${file}.counts.json`, "utf8"));
  const refused = spawnSync("node", ["scripts/db/backup.mjs", "--verify", short], { encoding: "utf8", env: { PATH: process.env.PATH } });
  ok(
    "a copy missing the projects' rows is refused, and the table named",
    redump.status === 0 && refused.status !== 0 && /public\.projects: \d+ counted, none in the copy/.test(refused.stderr),
    redump.stderr || refused.stderr || refused.stdout
  );
} finally {
  try { target?.stop(); } catch {}
  try { sql([SOURCE], `delete from auth.users where id in ('${U1}', '${U2}')`); } catch {}
  rmSync(out, { recursive: true, force: true });
}

console.log(failures.length === 0 ? `\nALL PASS: ${pass} passed, 0 failed` : `\nFAILED: ${pass} passed, ${failures.length} failed`);
process.exit(failures.length === 0 ? 0 : 1);
