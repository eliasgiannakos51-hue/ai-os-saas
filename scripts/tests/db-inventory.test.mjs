// The database inventory, and the two things it must never do.
//
// scripts/db-inventory.mjs derives what the database should contain from
// this repository — the tables src/ queries, the RPCs it calls, the columns
// and policies the migrations define — and emits a read-only diagnostic
// query plus idempotent repair DDL.
//
// Two failures matter more than the rest:
//
//   1. AN ORPHAN. `.from("x")` for a table no SQL file creates, or
//      `.rpc("y")` for a function nothing defines, is a runtime 404 nobody
//      finds until a user hits that path. The inventory can see it from
//      here, so the build should.
//   2. A DESTRUCTIVE STATEMENT. supabase_schema.sql, the complete schema
//      and the full backup carry 42, 43 and 42 DROP TABLE statements
//      respectively. Nothing this tool emits may contain one — the whole
//      point of it is to be the thing you can safely run against a live
//      database.
//
// Run: node scripts/tests/db-inventory.test.mjs
import { execFileSync } from "node:child_process";
import { readFileSync, readdirSync, statSync, existsSync } from "node:fs";
import path from "node:path";

let pass = 0;
const failures = [];
function check(name, cond, detail = "") {
  // TYPED ON PURPOSE. `check(name, someArray, [])` reads perfectly and is
  // always green: EVERY array is truthy in JavaScript, including the empty
  // one. That is how the regression check for the deleted `user_files`
  // table came to print its own failure message and still report PASS —
  // it was copied from i18n-coverage.test.mjs, whose check() takes
  // (actual, expected) and compares them. Two conventions, one name.
  if (typeof cond !== "boolean") {
    failures.push(name);
    console.log(`  FAIL  ${name}\n        check() takes a BOOLEAN; got ${Array.isArray(cond) ? "an array" : typeof cond}`);
    return;
  }
  if (cond) {
    pass++;
    console.log(`  PASS  ${name}`);
  } else {
    failures.push(name);
    console.log(`  FAIL  ${name}${detail ? "\n        " + detail : ""}`);
  }
}

const run = (...args) =>
  execFileSync("node", ["scripts/db-inventory.mjs", ...args], {
    encoding: "utf8",
    maxBuffer: 32 * 1024 * 1024,
  });

console.log("== 1. the inventory has no orphans ==");
const inv = JSON.parse(run("--json"));
console.log(
  `        ${inv.tables.length} tables · ${inv.columns} columns · ` +
    `${inv.functions.length} functions · ${inv.policies} policies`
);
check(
  "every table src/ queries is created by some SQL file",
  inv.orphanTables.length === 0,
  inv.orphanTables.join(", ")
);
check(
  "every .rpc() the code calls is defined by some SQL file",
  inv.orphanFunctions.length === 0,
  inv.orphanFunctions.join(", ")
);
check("the inventory is not empty", inv.tables.length > 40 && inv.functions.length > 10);

// NO FILTER MAY DELETE A TABLE THE CODE ACTUALLY QUERIES.
//
// The regression this pins: a dedup step mapped every storage BUCKET name
// to a table name by swapping hyphens for underscores, so the `user-files`
// bucket removed the `user_files` table — twelve `.from("user_files")`
// call sites and a row in the GDPR registry — and the diagnostic then
// reported it as an UNEXPECTED table nothing queries. That is the most
// dangerous sentence a schema diagnostic can produce: it invites somebody
// to drop a table full of user data.
//
// Counted from the source independently of the generator, so a filter that
// eats a table cannot also hide the evidence.
{
  const queried = new Set();
  const walkSrc = (dir) => {
    for (const entry of readdirSync(dir)) {
      if (entry === "node_modules" || entry.startsWith(".")) continue;
      const full = path.join(dir, entry);
      if (statSync(full).isDirectory()) walkSrc(full);
      else if (/\.tsx?$/.test(full)) {
        const text = readFileSync(full, "utf8")
          .replace(/\/\*[\s\S]*?\*\//g, "")
          .replace(/^\s*\/\/.*$/gm, "");
        for (const m of text.matchAll(/(?<!storage\s{0,4}\.\s{0,4})\.from\(\s*"([a-z0-9_]+)"\s*\)/g)) {
          queried.add(m[1]);
        }
      }
    }
  };
  walkSrc("src");
  const dropped = [...queried].filter((t) => !inv.tables.includes(t)).sort();
  check(
    `every table with a .from("…") call site survives the filters (${queried.size} found)`,
    dropped.length === 0,
    dropped.join(", ")
  );
  if (dropped.length) {
    console.log("        A filter in scripts/db-inventory.mjs removed a table the code queries.");
    console.log("        The diagnostic would report it as UNEXPECTED — do NOT drop it.");
  }
  // The specific tables that made this necessary, named so the regression
  // cannot come back quietly under a different filter.
  for (const t of ["user_files", "website_form_submissions", "user_credits"]) {
    check(`${t} is in the expected inventory`, inv.tables.includes(t), "missing");
  }
}

console.log("\n== 1b. the output says which code it was measured against ==");
// "Which branch did this run on?" was a real question about a real report,
// and the artefact could not answer it.
{
  const diag = run();
  check("the diagnostic stamps its branch and commit", /GENERATED FROM:\s+branch \S+\s+@\s+commit \S+/.test(diag));
  check(
    "…and says whether the tree was clean",
    /\(clean tree\)|\(\+\d+ uncommitted file\(s\)\)/.test(diag)
  );
  check("the repair DDL stamps it too", /From branch \S+ @ commit \S+/.test(run("--repair", "user_credits")));
  check(
    "the header warns that UNEXPECTED is relative to this tree",
    /nothing in THIS tree queries it/.test(diag)
  );
}

console.log("\n== 2. the diagnostic query is READ-ONLY ==");
// COMMENTS AND STRING LITERALS ARE REMOVED BEFORE ANY SCAN BELOW.
//
// This is the third scanner in this session to flag its own documentation:
// the emitted SQL's header says "No DROP TABLE. No TRUNCATE." and a naive
// grep reads that promise as the violation. It is the same failure the
// repo already documents for check-i18n and billing-coverage — a scanner
// that fails on its own subject's rationale teaches people to delete the
// rationale.
const forScanning = (sql) =>
  sql
    .replace(/^\s*--.*$/gm, "")
    .replace(/'(?:[^']|'')*'/g, "''");
const diagnostic = run();
const WRITES =
  /\b(drop\s+table|drop\s+schema|drop\s+constraint|drop\s+policy|truncate|delete\s+from|insert\s+into|update\s+\w+\s+set|alter\s+table)\b/i;
const offending = diagnostic.match(WRITES);
// `alter table ...` appears inside the fix ADVICE column as a quoted
// string. That is text, not a statement.
const withoutLiterals = forScanning(diagnostic);
check(
  "the diagnostic contains no statement that writes",
  !WRITES.test(withoutLiterals),
  withoutLiterals.match(WRITES)?.[0] ?? ""
);
check("…and it does mention the fixes as text", offending !== null);
check(
  "it is a single statement",
  withoutLiterals.replace(/;\s*$/, "").split(";").filter((p) => p.trim()).length === 1,
  `${withoutLiterals.split(";").length - 1} semicolons outside literals`
);
check("it selects from the catalog", /from\s+pg_policies/.test(diagnostic) && /information_schema\.columns/.test(diagnostic));
check(
  "it checks all four object kinds",
  ["MISSING TABLE", "MISSING COLUMN", "MISSING FUNCTION", "MISSING POLICY"].every((k) =>
    diagnostic.includes(k)
  )
);
check("…and reports RLS that is switched off", diagnostic.includes("RLS DISABLED"));

console.log("\n== 3. the repair DDL destroys nothing and is idempotent ==");
const repair = run("--repair");

// A PIPE MUST GET THE SAME BYTES A FILE DOES.
//
// console.log() to a pipe is asynchronous in Node; to a file it is not. A
// process.exit() straight after it discarded whatever had not flushed, so
// `... --repair > fix.sql` wrote 5,324 lines and `... --repair | psql`
// wrote 3,352 — and reported success. Redirecting to a file looked
// perfect, which is what makes this worth a test: the failure only
// appears in the one usage that applies the SQL directly.
{
  const viaPipe = execFileSync("sh", ["-c", "node scripts/db-inventory.mjs --repair | cat"], {
    encoding: "utf8",
    maxBuffer: 32 * 1024 * 1024,
  });
  check(
    `piped output is not truncated (${viaPipe.length} bytes vs ${repair.length} captured)`,
    viaPipe.length === repair.length,
    `pipe lost ${repair.length - viaPipe.length} bytes`
  );
  const diagPipe = execFileSync("sh", ["-c", "node scripts/db-inventory.mjs | cat"], {
    encoding: "utf8",
    maxBuffer: 32 * 1024 * 1024,
  });
  check(
    "the diagnostic survives a pipe too",
    diagPipe.trimEnd().endsWith(";"),
    `ends with: ${JSON.stringify(diagPipe.slice(-40))}`
  );
}
const DESTRUCTIVE = /\b(drop\s+table|drop\s+schema|drop\s+constraint|drop\s+policy|drop\s+column|truncate|delete\s+from)\b/i;
// FUNCTION BODIES ARE EXCLUDED, and the distinction is the whole point.
//
// This checks what the repair script EXECUTES against the schema. It does
// not check what a function does when the application later calls it —
// public.delete_user_file_objects() contains `delete from storage.objects`
// because deleting a user's files is its entire purpose (GDPR erasure).
// Flagging that would mean the only way to pass is to stop shipping the
// erasure function, which is the opposite of safe.
const withoutFunctionBodies = repair.replace(/\$([a-z_]*)\$[\s\S]*?\$\1\$/gi, "$$BODY$$");
const repairNoLiterals = forScanning(withoutFunctionBodies);
check(
  "no destructive statement anywhere in the repair output",
  !DESTRUCTIVE.test(repairNoLiterals),
  repairNoLiterals.match(DESTRUCTIVE)?.[0] ?? ""
);
const createTables = [...repair.matchAll(/create\s+table\s+(if\s+not\s+exists\s+)?/gi)];
check(
  `every create table is guarded (${createTables.length} found)`,
  createTables.length > 0 && createTables.every((m) => m[1]),
  `${createTables.filter((m) => !m[1]).length} unguarded`
);
const addColumns = [...repair.matchAll(/add\s+column\s+(if\s+not\s+exists\s+)?/gi)];
check(
  `every add column is guarded (${addColumns.length} found)`,
  addColumns.length > 0 && addColumns.every((m) => m[1]),
  `${addColumns.filter((m) => !m[1]).length} unguarded`
);
const createFns = [...repair.matchAll(/create\s+(or\s+replace\s+)?function/gi)];
check(
  `every function is CREATE OR REPLACE (${createFns.length} found)`,
  createFns.length > 0 && createFns.every((m) => m[1]),
  `${createFns.filter((m) => !m[1]).length} bare`
);
// Counted on the raw output: the policy guards ARE dollar-quoted blocks,
// so stripping bodies would erase exactly what is being counted.
const policyBlocks = (repair.match(/do \$repair\$/g) ?? []).length;
const createPolicies = (repair.match(/create\s+policy/gi) ?? []).length;
check(
  `every policy is inside an existence guard (${policyBlocks} guards / ${createPolicies} policies)`,
  policyBlocks === createPolicies && policyBlocks > 0
);
// A truncated type is the bug that shipped once: `numeric(12,8)` cut at the
// comma inside its own precision, emitting `numeric(12`.
// Paren-AWARE, because `[^\n,;]*` stops at the comma inside `numeric(12, 8)`
// and reports the very truncation it is looking for. That is precisely the
// bug it exists to catch, so getting it wrong here would have hidden it.
const unbalanced = [...repair.matchAll(/add column if not exists [^\n;]*/g)]
  .map((m) => m[0])
  .filter((d) => (d.match(/\(/g) ?? []).length !== (d.match(/\)/g) ?? []).length);
check("no column type is truncated mid-parenthesis", unbalanced.length === 0, unbalanced.join(" | "));

console.log("\n== 4. --repair with names emits ONLY those objects ==");
const one = run("--repair", "user_credits");
check("the named table is present", /create table if not exists public\.user_credits/.test(one));
check("an unnamed table is absent", !/create table if not exists public\.chat_messages/.test(one));
check(
  "the grandfathering columns come through",
  ["legacy_plan_tier", "legacy_free_chat_messages", "legacy_entitlements_until"].every((c) =>
    one.includes(`add column if not exists ${c}`)
  )
);

console.log("\n== 5. the snapshot files are still the dangerous ones ==");
// Stated as a fact the build re-checks, so "just run supabase_schema.sql"
// can never look like reasonable advice again.
for (const f of ["supabase_schema.sql", "supabase_complete_schema.sql", "supabase_full_project_backup.sql"]) {
  if (!existsSync(f)) continue;
  const drops = (readFileSync(f, "utf8").match(/drop\s+table/gi) ?? []).length;
  check(`${f} still carries DROP TABLE (${drops}) and is excluded from repair`, drops > 0);
}
const sqlFiles = readdirSync(".").filter((f) => f.endsWith(".sql"));
check(`${sqlFiles.length} SQL files scanned at the repo root`, sqlFiles.length > 5);

console.log(`\n${failures.length === 0 ? "ALL PASS" : "FAILURES"}: ${pass} passed, ${failures.length} failed`);
if (failures.length) for (const f of failures) console.log("  - " + f);
process.exit(failures.length === 0 ? 0 : 1);
