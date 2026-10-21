// STORAGE.OBJECTS' TEN POLICIES, DERIVED TWO WAYS (security audit,
// 2026-10-21). scripts/db/storage-objects-rls.mjs answers "what query do
// I run, and what should it show" for the one table this project's own
// migrations do not create but still protect every uploaded file with.
//
// Run: node scripts/tests/storage-rls.test.mjs
import { readdirSync, readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { expectedStorageObjectsPolicies } from "../db/storage-objects-rls.mjs";

let pass = 0;
const failures = [];
function check(name, cond, detail) {
  if (cond) {
    pass++;
    console.log(`  PASS  ${name}`);
  } else {
    failures.push(name);
    console.log(`  FAIL  ${name}${detail !== undefined ? "\n        " + detail : ""}`);
  }
}

const expected = expectedStorageObjectsPolicies();

console.log("== 1. the derivation found what SECURITY-AUDIT.md has said since 2026-10-05 ==");
check(`exactly 10 policies on storage.objects (found ${expected.length})`, expected.length === 10, expected.map((p) => p.name).join(", "));
check("every one is a known command", expected.every((p) => ["SELECT", "INSERT", "UPDATE", "DELETE"].includes(p.cmd)));
check("every name is unique", new Set(expected.map((p) => p.name)).size === expected.length);
const EXPECTED_NAMES = [
  "delete_own_create_attachments",
  "delete_own_user_files_objects",
  "delete_own_website_references",
  "insert_own_create_attachments",
  "insert_own_user_files_objects",
  "insert_own_website_references",
  "select_own_create_attachments",
  "select_own_user_files_objects",
  "select_own_website_references",
  "update_own_user_files_objects",
];
check(
  "the exact names match the three buckets this app writes to",
  JSON.stringify(expected.map((p) => p.name)) === JSON.stringify(EXPECTED_NAMES),
  expected.map((p) => p.name).join(", ")
);

console.log("\n== 2. measured a second way, independently of the script's own regex ==");
// A DIFFERENT PATTERN, not a copy of the one in storage-objects-rls.mjs —
// counts every distinct (verb, name) pair however `create policy` phrases
// it, so a bug specific to one regex cannot pass by agreeing with itself.
const DIR = "supabase/migrations";
const files = readdirSync(DIR).filter((f) => f.endsWith(".sql")).sort();
const seen = new Map();
for (const f of files) {
  const text = readFileSync(`${DIR}/${f}`, "utf8").replace(/--[^\n]*/g, "");
  for (const m of text.matchAll(/create\s+policy\s+"?(\w+)"?\s+on\s+storage\.objects/gi)) {
    seen.set(m[1], f);
  }
}
check(`the independent scan agrees on the count (${seen.size})`, seen.size === expected.length, [...seen.keys()].join(", "));
check("...and on every name", expected.every((p) => seen.has(p.name)), expected.map((p) => p.name).filter((n) => !seen.has(n)).join(", "));

console.log("\n== 3. the script itself runs clean ==");
const printed = execFileSync(process.execPath, ["scripts/db/storage-objects-rls.mjs"], { encoding: "utf8" });
check("every expected name is printed", EXPECTED_NAMES.every((n) => printed.includes(n)));
const sql = execFileSync(process.execPath, ["scripts/db/storage-objects-rls.mjs", "--sql"], { encoding: "utf8" });
check("the --sql query asks pg_policies, scoped to storage.objects", /from\s+pg_policies/i.test(sql) && /schemaname\s*=\s*'storage'/.test(sql) && /tablename\s*=\s*'objects'/.test(sql));
check("...and names no project-specific policy by name (it is read-only and generic)", !EXPECTED_NAMES.some((n) => sql.includes(n)));

console.log(`\n${failures.length === 0 ? "ALL PASS" : "FAILURES"}: ${pass} passed, ${failures.length} failed`);
process.exit(failures.length === 0 ? 0 : 1);
