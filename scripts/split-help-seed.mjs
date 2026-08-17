// Split the Help Centre seed into paste-sized parts.
//
// WHY THIS EXISTS. The seed is 166 UPSERTs and ~127 KB. Pasting that into
// a browser SQL console is not something to do by hand, and a console that
// silently truncates a large paste fails in the worst possible way: the
// statements it did receive succeed, so the run reports success and the
// table is short a few articles nobody counts.
//
// SPLIT ON STATEMENT BOUNDARIES, NEVER INSIDE ONE. A part that ends
// mid-INSERT is a syntax error at best; the point of splitting is to make
// each part independently correct. Every statement is an UPSERT on
// (slug, locale), so the parts may be run in any order, more than once,
// and a part run twice changes nothing.
//
// BYTES, NOT CHARACTERS, and that distinction is the whole reason this is
// a script rather than a one-liner. The first version budgeted in
// JavaScript string length; the articles are in Greek, Japanese, Chinese
// and Arabic, which cost 2-3 bytes per character in UTF-8, so parts sized
// at "7,000 characters" measured 9,400 bytes on disk — 34% over a budget
// that exists precisely because something downstream counts bytes.
//
// Run: node scripts/split-help-seed.mjs
import { readFileSync, writeFileSync, readdirSync, mkdirSync, rmSync, existsSync } from "node:fs";

const SRC = "supabase/migrations/20260816_help_articles_seed.sql";
const OUT = "supabase/seed-chunks";
/** Bytes. Chosen to sit well under any console's paste limit. */
export const CHUNK_LIMIT_BYTES = 7000;

const bytes = (s) => Buffer.byteLength(s, "utf8");

/** The seed's statements, in file order, each ending in a semicolon. */
export function statementsOf(sql) {
  const body = sql.slice(sql.indexOf("insert into"));
  return body
    .split(/;\s*\n\s*\n/)
    .map((s) => s.trim())
    .filter(Boolean)
    .map((s) => (s.endsWith(";") ? s : s + ";"));
}

function header(part, total, count) {
  return (
    `-- Help Centre seed, part ${part} of ${total} — ${count} statements.\n` +
    `--\n` +
    `-- GENERATED from ${SRC}\n` +
    `-- by scripts/split-help-seed.mjs. Do not edit either by hand.\n` +
    `--\n` +
    `-- SPLIT ON STATEMENT BOUNDARIES, never inside one. Each part is a\n` +
    `-- complete, runnable script on its own: every statement is an UPSERT\n` +
    `-- on (slug, locale), so the parts may be run in any order, more than\n` +
    `-- once, and a part run twice changes nothing.\n` +
    `--\n` +
    `-- Run 20260816_help_articles.sql first — it creates the table and the\n` +
    `-- unique index these UPSERTs conflict on.\n\n`
  );
}

export function packIntoChunks(stmts, limit = CHUNK_LIMIT_BYTES) {
  // The header is budgeted at its worst case rather than its actual size,
  // because the actual size depends on the part number and the statement
  // count — both of which are only known after the packing is decided.
  const reserve = bytes(header(99, 99, 99));
  const chunks = [];
  let cur = [];
  let size = reserve;
  for (const st of stmts) {
    const cost = bytes(st) + 2; // the "\n\n" that joins it to the previous
    if (cur.length > 0 && size + cost > limit) {
      chunks.push(cur);
      cur = [];
      size = reserve;
    }
    cur.push(st);
    size += cost;
  }
  if (cur.length > 0) chunks.push(cur);
  return chunks;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const sql = readFileSync(SRC, "utf8");
  const stmts = statementsOf(sql);
  const chunks = packIntoChunks(stmts);

  if (existsSync(OUT)) rmSync(OUT, { recursive: true });
  mkdirSync(OUT, { recursive: true });

  const pad = (n) => String(n).padStart(2, "0");
  for (const [i, c] of chunks.entries()) {
    const name = `${OUT}/help-articles-${pad(i + 1)}-of-${pad(chunks.length)}.sql`;
    writeFileSync(name, header(i + 1, chunks.length, c.length) + c.join("\n\n") + "\n");
  }

  const sizes = readdirSync(OUT).map((f) => bytes(readFileSync(`${OUT}/${f}`, "utf8")));
  const over = sizes.filter((b) => b > CHUNK_LIMIT_BYTES).length;
  console.log(
    `${chunks.length} parts, ${stmts.length} statements, ` +
      `largest ${Math.max(...sizes)} B, over budget: ${over}`
  );
  if (over > 0) process.exitCode = 1;
}
