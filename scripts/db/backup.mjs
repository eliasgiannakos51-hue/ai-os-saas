#!/usr/bin/env node
// A FULL COPY OF THE DATA, OUTSIDE SUPABASE (docs/SECURITY-AUDIT.md ΑΣ-8.4).
//
//   npm run db:backup                      # with DATABASE_URL: a copy, in backups/
//   npm run db:backup -- --verify <file>   # read a copy back: is every table's data in it?
//
// WHY THIS EXISTS. Whether Supabase keeps backups of this project, how
// many days, and whether a point in time can be restored, depends on the
// project's plan — NEEDS 23 in docs/NEEDS-FROM-ELIAS.md, which nobody can
// answer from the code. Until it is answered, this is the copy that does
// not depend on the plan: pg_dump's own archive of the three schemas that
// hold data — public (everything the product writes), auth (the accounts)
// and storage (which file is whose; the files themselves live in Supabase
// Storage and are NOT in this copy).
//
// NEXT TO THE ARCHIVE, THE COUNTS. Every table's row count is taken
// inside the very snapshot pg_dump copies (pg_export_snapshot, then
// pg_dump --snapshot), so the two describe the same instant even while
// the site is in use. They go into <file>.counts.json, and --verify reads
// every row back out of the archive and requires each table's count to
// match. A copy that was never read back is a hope, not a backup —
// scripts/tests/backup-restore.dbtest.mjs also restores one into an empty
// database and requires every count to come back equal.
//
// WHAT IS NOT KNOWN, said here: this has run against the throwaway
// database of `npm run test:db`, not against the production project,
// which this repository's sessions cannot reach (measured 2026-10-08). The
// first real run is the owner's (docs/OWNER.md, the section on backups).
//
// THE FILES ARE PERSONAL DATA. backups/ is in .gitignore, and both files
// are written readable by their owner only.
//
// Run: node scripts/db/backup.mjs
import { execFileSync, spawn, spawnSync } from "node:child_process";
import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

const SCHEMAS = ["public", "auth", "storage"];
const args = process.argv.slice(2);
const flag = (name) => {
  const at = args.indexOf(name);
  return at >= 0 ? args[at + 1] : undefined;
};

function fail(lines) {
  console.error(lines.join("\n"));
  process.exit(1);
}
function have(cmd) {
  return spawnSync(cmd, ["--version"], { encoding: "utf8" }).status === 0;
}
function major(versionText) {
  const m = String(versionText).match(/(\d+)(?:\.\d+)?/);
  return m ? Number(m[1]) : NaN;
}

// ---------------------------------------------------------------------
// --verify <file>: every row read back out of the archive, per table,
// against the counts taken with it. No database is needed.
// ---------------------------------------------------------------------
async function rowsInArchive(file) {
  const got = {};
  let current = null;
  let rest = "";
  const child = spawn("pg_restore", ["--data-only", "--file=-", file], { stdio: ["ignore", "pipe", "pipe"] });
  let stderr = "";
  child.stderr.on("data", (d) => (stderr += d));
  child.stdout.setEncoding("utf8");
  child.stdout.on("data", (chunk) => {
    const lines = (rest + chunk).split("\n");
    rest = lines.pop();
    for (const line of lines) {
      if (current !== null) {
        if (line === "\\.") current = null;
        else got[current] += 1;
        continue;
      }
      // COPY public.projects (id, user_id, ...) FROM stdin;
      const m = line.match(/^COPY (\S+?)\.(\S+?) (?:\(|FROM)/);
      if (m) {
        current = `${m[1].replace(/"/g, "")}.${m[2].replace(/"/g, "")}`;
        got[current] = 0;
      }
    }
  });
  const code = await new Promise((resolve) => child.on("close", resolve));
  if (code !== 0) fail(["pg_restore could not read the copy:", stderr.trim().slice(0, 2000)]);
  return got;
}

const verifyFile = flag("--verify");
if (verifyFile !== undefined) {
  if (!existsSync(verifyFile)) fail([`No such file: ${verifyFile}`]);
  if (!have("pg_restore")) fail(["pg_restore is not installed. It comes with the PostgreSQL client tools."]);
  const countsFile = `${verifyFile}.counts.json`;
  if (!existsSync(countsFile)) fail([`The counts taken with this copy are missing: ${countsFile}`]);
  const counts = JSON.parse(readFileSync(countsFile, "utf8"));
  const got = await rowsInArchive(verifyFile);
  const differ = Object.entries(counts.tables)
    .filter(([table, rows]) => got[table] !== rows)
    .map(([table, rows]) => `${table}: ${rows} counted, ${got[table] ?? "none"} in the copy`);
  const total = Object.values(counts.tables).reduce((a, b) => a + b, 0);
  console.log(`copy taken ${counts.takenAt}: ${Object.keys(counts.tables).length} tables, ${total} rows`);
  if (differ.length > 0) fail([`DIFFERS from the counts taken with it:`, ...differ.map((d) => `  ${d}`)]);
  console.log(`VERIFIED: all ${total} rows of the ${Object.keys(counts.tables).length} tables are in ${path.basename(verifyFile)}`);
  process.exit(0);
}

// ---------------------------------------------------------------------
// The copy.
// ---------------------------------------------------------------------
const url = process.env.DATABASE_URL;
if (!url) {
  fail([
    "DATABASE_URL is not set, so there is nothing to copy.",
    "In Supabase: the project → Connect → the connection string marked “Session pooler”,",
    "with the database password in it. Then, in the same terminal:",
    "  DATABASE_URL='<that string>' npm run db:backup",
  ]);
}
if (!have("pg_dump") || !have("psql")) fail(["pg_dump and psql are not installed. They come with the PostgreSQL client tools."]);

const psql = (sql) =>
  execFileSync("psql", [url, "-v", "ON_ERROR_STOP=1", "-tAc", sql], { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 }).trim();

// pg_dump refuses a server newer than itself, with a sentence that does
// not say what to install. Asked first, and said plainly.
const clientMajor = major(execFileSync("pg_dump", ["--version"], { encoding: "utf8" }).replace(/^\D+/, ""));
const serverMajor = Math.floor(Number(psql("show server_version_num")) / 10000);
if (!(clientMajor >= serverMajor)) {
  fail([`pg_dump is version ${clientMajor} and the database is version ${serverMajor}.`, `Install the PostgreSQL ${serverMajor} client tools, then run this again.`]);
}

// ONE INSTANT. A read-only transaction holds a snapshot open; the counts
// are taken in it and pg_dump copies from it (--snapshot), so a row
// written meanwhile is in neither or in both. Needs a session connection:
// Supabase's "Session pooler" string, not the transaction pooler.
const schemaList = SCHEMAS.map((s) => `'${s}'`).join(", ");
const COUNTS = `
  select n.nspname || '.' || c.relname || '|' ||
         (xpath('/row/c/text()', query_to_xml(format('select count(*) as c from %I.%I', n.nspname, c.relname), false, true, '')))[1]::text
  from pg_class c join pg_namespace n on n.oid = c.relnamespace
  where c.relkind in ('r', 'p') and n.nspname in (${schemaList})
  order by 1`;
const session = spawn("psql", [url, "-X", "-q", "-tA", "-v", "ON_ERROR_STOP=1"], { stdio: ["pipe", "pipe", "pipe"] });
let said = "";
let sessionErr = "";
session.stdout.setEncoding("utf8");
session.stdout.on("data", (d) => (said += d));
session.stderr.on("data", (d) => (sessionErr += d));
const ended = new Promise((resolve) => session.on("close", resolve));
async function waitFor(re) {
  for (;;) {
    const m = said.match(re);
    if (m) return m;
    const done = await Promise.race([ended.then(() => true), new Promise((r) => setTimeout(() => r(false), 50))]);
    if (done && !said.match(re)) fail(["The database session stopped:", sessionErr.trim().slice(0, 2000)]);
  }
}
session.stdin.write("begin isolation level repeatable read read only;\nselect 'SNAPSHOT|' || pg_export_snapshot();\n");
const snapshot = (await waitFor(/SNAPSHOT\|(\S+)/))[1];
session.stdin.write(`${COUNTS};\nselect 'COUNTED|';\n`);
await waitFor(/COUNTED\|/);
const tables = Object.fromEntries(
  said
    .split("\n")
    .filter((line) => line.includes("|") && !/^(SNAPSHOT|COUNTED)\|/.test(line))
    .map((line) => {
      const at = line.lastIndexOf("|");
      return [line.slice(0, at), Number(line.slice(at + 1))];
    })
);

const outDir = flag("--out") ?? "backups";
mkdirSync(outDir, { recursive: true });
const stamp = new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d+Z$/, "Z");
const file = path.join(outDir, `ionexa-${stamp}.dump`);
const dump = spawnSync(
  "pg_dump",
  [url, "--format=custom", "--no-owner", "--no-privileges", `--snapshot=${snapshot}`, ...SCHEMAS.flatMap((s) => ["--schema", s]), "--file", file],
  { encoding: "utf8" }
);
session.stdin.end("commit;\n");
await ended;
if (dump.status !== 0) fail(["pg_dump stopped:", String(dump.stderr).trim().slice(0, 2000)]);
chmodSync(file, 0o600);
writeFileSync(`${file}.counts.json`, JSON.stringify({ takenAt: new Date().toISOString(), serverMajor, tables }, null, 2) + "\n", { mode: 0o600 });

const total = Object.values(tables).reduce((a, b) => a + b, 0);
console.log(`COPY: ${file}`);
console.log(`      ${Object.keys(tables).length} tables, ${total} rows, counted in the snapshot it copies (${file}.counts.json)`);
console.log(`Next: npm run db:backup -- --verify ${file}`);
