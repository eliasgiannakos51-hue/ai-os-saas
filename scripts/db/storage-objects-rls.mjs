#!/usr/bin/env node
/*
 * STORAGE.OBJECTS' OWN TEN POLICIES — WHAT SHOULD BE THERE, AND THE
 * QUERY TO ASK THE DATABASE (security audit, 2026-10-21).
 *
 * storage.objects is where every uploaded file actually lives — the
 * public-schema row (user_files, website_reference_images, ...) is only
 * ABOUT the file — so its RLS policies are the only thing between one
 * account's PDF and another's. It is a Supabase-managed table in the
 * `storage` schema, not one this project's own migrations create, so
 * scripts/db/pending-migrations.mjs's object-derived check never looks
 * at it (that tool only reads `public`).
 *
 * WHERE THE EXPECTED LIST COMES FROM. Derived from the migrations the
 * same way pending-migrations.mjs derives its own expectations: read
 * every `create policy ... on storage.objects` statement, keep the
 * LATEST definition of each name (20260819000000_files_storage_repair.sql
 * drops and re-creates four of these), in file order. Nothing here is
 * hand-typed from memory.
 *
 * Run: node scripts/db/storage-objects-rls.mjs          prints what is
 *      expected, derived from the migrations
 *      node scripts/db/storage-objects-rls.mjs --sql     prints the one
 *      query to paste into the Supabase SQL editor
 *
 * Tested by scripts/tests/storage-rls.test.mjs, which holds this file's
 * derivation to the same count db-inventory.mjs independently reports
 * for storage.objects, so the two cannot quietly disagree.
 */
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { stripSqlComments } from "../lib/sql-text.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const MIG_DIR = path.join(ROOT, "supabase", "migrations");

/** Every `create policy "<name>" on storage.objects` across the
 *  migrations, latest definition per name wins (file order). */
export function expectedStorageObjectsPolicies(dir = MIG_DIR) {
  const files = readdirSync(dir).filter((f) => f.endsWith(".sql")).sort();
  const byName = new Map();
  for (const file of files) {
    const sql = stripSqlComments(readFileSync(path.join(dir, file), "utf8"));
    const re = /create\s+policy\s+"?([a-zA-Z0-9_]+)"?\s+on\s+storage\.objects\s+for\s+(select|insert|update|delete)/gi;
    for (const m of sql.matchAll(re)) {
      byName.set(m[1], { name: m[1], cmd: m[2].toUpperCase(), file });
    }
  }
  return [...byName.values()].sort((a, b) => a.name.localeCompare(b.name));
}

const QUERY = `select policyname, cmd, roles, qual, with_check
from pg_policies
where schemaname = 'storage' and tablename = 'objects'
order by policyname;`;

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const expected = expectedStorageObjectsPolicies();
  if (process.argv.includes("--sql")) {
    console.log(QUERY);
    process.exit(0);
  }
  console.log(`storage.objects: ${expected.length} policies expected, derived from the migrations.\n`);
  for (const p of expected) console.log(`  ${p.cmd.padEnd(6)} ${p.name}  (${p.file})`);
  console.log(`\nRun with --sql for the query to paste into the Supabase SQL editor.`);
  console.log(`Each row it returns should be one of the ${expected.length} names above — rowcount`);
  console.log(`that LOWER than ${expected.length} means a policy a migration created is missing live;`);
  console.log(`a name NOT on the list above means a policy nothing in this repository declared.`);
}
