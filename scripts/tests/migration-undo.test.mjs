// EVERY MIGRATION SAYS HOW TO UNDO IT, OR SAYS PLAINLY THAT IT CANNOT
// (MASTER Μέρος 13 Β, 2026-10-05: «Κάθε migration έχει αναίρεση, ή
// γράφεις καθαρά ότι δεν έχει και γιατί»).
//
// The population is every file in supabase/migrations/ from the rule's
// date on — 20261016000000 is the first written under it. Each must carry,
// in its header, either `How to undo:` followed by the steps, or
// `No undo:` followed by the reason. Older files are a record of what ran
// and are not rewritten (CLAUDE.md, «Migrations are applied by hand»).
//
// Run: node scripts/tests/migration-undo.test.mjs
import { readFileSync, readdirSync } from "node:fs";

let pass = 0;
const failures = [];
function check(name, cond, detail) {
  if (cond) {
    pass++;
    console.log(`  PASS  ${name}`);
  } else {
    failures.push(name);
    console.log(`  FAIL  ${name}${detail ? "\n        " + detail : ""}`);
  }
}

const FIRST_UNDER_THE_RULE = "20261016000000";
const DIR = "supabase/migrations";
const all = readdirSync(DIR).filter((f) => f.endsWith(".sql")).sort();
const covered = all.filter((f) => f.slice(0, 14) >= FIRST_UNDER_THE_RULE);

console.log("== the population ==");
check(`the migrations were read (${all.length}), and the rule covers ${covered.length}`, all.length >= 80 && covered.length >= 1);

/** The undo note, if any: the comment text after the marker, up to the next blank comment line. */
function undoNote(sql) {
  const lines = sql.split("\n").filter((l) => l.startsWith("--")).map((l) => l.replace(/^--\s?/, ""));
  const at = lines.findIndex((l) => /^(How to undo:|No undo:)/.test(l.trim()));
  if (at < 0) return null;
  const parts = [lines[at].trim().replace(/^(How to undo:|No undo:)\s*/, "")];
  for (let i = at + 1; i < lines.length && lines[i].trim() !== "" && !/^-{3,}$/.test(lines[i].trim()); i++) parts.push(lines[i].trim());
  return parts.join(" ").trim();
}

console.log("\n== each says how to undo it, or why it cannot ==");
for (const f of covered) {
  const note = undoNote(readFileSync(`${DIR}/${f}`, "utf8"));
  check(`${f}: ${note === null ? "no undo note" : "says how, or why not"}`, note !== null && note.length >= 20, note === null ? "add `-- How to undo: …` or `-- No undo: …` to the header" : `too short: "${note}"`);
}

console.log("\n== the reader can tell a note from its absence ==");
check("a header with a note is read", undoNote("-- How to undo: drop table public.x; nothing else used it.\n") === "drop table public.x; nothing else used it.");
check("a header with none is not", undoNote("-- creates a table\nselect 1;") === null);
check("the marker in SQL rather than a comment does not count", undoNote("select 'How to undo: nothing';") === null);

console.log(failures.length === 0 ? `\nALL PASS: ${pass} passed, 0 failed` : `\n${failures.length} FAILED, ${pass} passed`);
process.exit(failures.length === 0 ? 0 : 1);
