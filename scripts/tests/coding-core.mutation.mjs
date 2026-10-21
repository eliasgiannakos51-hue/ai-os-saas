#!/usr/bin/env node
/*
 * CAN THE TWO MODULES UNDER THE CONVERSATION GO RED?
 *
 * lib/coding/diff.ts and lib/coding/file-blocks.ts carry no mutation
 * coverage of their own yet — coding-diff.test.mjs and
 * coding-file-blocks.test.mjs are thorough (24 and 31 checks), but
 * thoroughness is a claim about what was thought of, and this file is
 * the other kind of evidence: a real defect, reintroduced, that the
 * gate actually notices.
 *
 *   A DIFF THAT CANNOT TELL "SAME" FROM "CHANGED". The whole point of
 *   diffLines is the line a person does NOT have to read again; losing
 *   that renders every file as a wall of red and green with nothing
 *   left unchanged, which is worse than no diff at all.
 *
 *   A MARKER THAT LEAKS INTO THE FILE. The model is prompted to wrap
 *   each file in <<<IONEXA_FILE:path>>> ... <<<IONEXA_END>>>, and the
 *   one newline on each side of those markers is the marker's own —
 *   lose that stripping and every file the model writes starts with a
 *   blank line nobody typed.
 *
 *   A PATCH THAT FORGETS WHICH WRITE IS NEWEST. reduceFiles exists
 *   because an assistant turn's `files` is a PATCH, not a snapshot —
 *   keep the first write instead of the last and a conversation's
 *   current code quietly reverts to its first draft.
 *
 * Run: node scripts/tests/coding-core.mutation.mjs
 */
import { readFileSync } from "node:fs";
import { writeFileSync } from "./lib/sidecar-write.mjs";
import { execFileSync } from "node:child_process";

const DIFF_GATE = "scripts/tests/coding-diff.test.mjs";
const BLOCKS_GATE = "scripts/tests/coding-file-blocks.test.mjs";

const DIFF = "src/lib/coding/diff.ts";
const BLOCKS = "src/lib/coding/file-blocks.ts";

const MUTANTS = [
  // ------------------------------------------------------------------
  // THE DIFF.
  // ------------------------------------------------------------------
  {
    gate: DIFF_GATE,
    name: "a matching line is never marked 'same'",
    file: DIFF,
    from: 'if (a[i] === b[j]) {\n      out.push({ kind: "same", text: a[i] });',
    to: 'if (false) {\n      out.push({ kind: "same", text: a[i] });',
  },
  {
    gate: DIFF_GATE,
    name: "every diff takes the blunt fallback, even a three-line one",
    file: DIFF,
    from: "if (a.length > MAX_DIFF_LINES || b.length > MAX_DIFF_LINES) {",
    to: "if (true) {",
  },
  {
    gate: DIFF_GATE,
    name: "new content at the end of a file is marked 'same' instead of 'add'",
    file: DIFF,
    from: 'while (j < b.length) out.push({ kind: "add", text: b[j++] });',
    to: 'while (j < b.length) out.push({ kind: "same", text: b[j++] });',
  },
  {
    gate: DIFF_GATE,
    name: "diffHasChanges stops noticing a real change",
    file: DIFF,
    from: 'return lines.some((l) => l.kind !== "same");',
    to: "return false;",
  },
  {
    gate: DIFF_GATE,
    // Forces every non-matching position onto the "add" branch, which
    // walks `after` to its end before any "remove" can be written —
    // the opposite order from a person reading top to bottom.
    name: "a changed line in the middle is added before the old one is removed, not the other way",
    file: DIFF,
    from: '} else if (table[i + 1][j] >= table[i][j + 1]) {\n      out.push({ kind: "remove", text: a[i] });\n      i++;\n    } else {',
    to: "} else if (false) {\n      out.push({ kind: \"remove\", text: a[i] });\n      i++;\n    } else {",
  },

  // ------------------------------------------------------------------
  // THE FILE BLOCKS.
  // ------------------------------------------------------------------
  {
    gate: BLOCKS_GATE,
    name: "a .. path segment is accepted",
    file: BLOCKS,
    from: 'return segments.every((s) => s.length > 0 && s !== "." && s !== "..");',
    to: 'return segments.every((s) => s.length > 0 && s !== ".");',
  },
  {
    gate: BLOCKS_GATE,
    name: "a path over 300 characters is accepted",
    file: BLOCKS,
    from: "if (!trimmed || trimmed.length > 300) return false;",
    to: "if (!trimmed) return false;",
  },
  {
    gate: BLOCKS_GATE,
    name: "a repeated path keeps the LAST block instead of the first",
    file: BLOCKS,
    from: '    if (isValidFilePath(rawPath) && !seen.has(rawPath)) {\n      seen.add(rawPath);\n      files.push({ path: rawPath, content });\n    }',
    to: "    if (isValidFilePath(rawPath)) {\n      files.push({ path: rawPath, content });\n    }",
  },
  {
    gate: BLOCKS_GATE,
    name: "the marker's own newline stops being stripped, so every file starts with a blank line",
    file: BLOCKS,
    from: 'let contentStart = headerEnd + OPEN_END.length;\n    if (text[contentStart] === "\\n") contentStart++;',
    to: "let contentStart = headerEnd + OPEN_END.length;",
  },
  {
    gate: BLOCKS_GATE,
    name: "an unterminated block is parsed as a file instead of falling back to prose",
    file: BLOCKS,
    from: "const closeAt = text.indexOf(CLOSE, headerEnd + OPEN_END.length);\n    if (closeAt === -1) {",
    to: "const closeAt = text.indexOf(CLOSE, headerEnd + OPEN_END.length);\n    if (false) {",
  },
  {
    gate: BLOCKS_GATE,
    name: "reduceFiles keeps the FIRST write to a path instead of the last",
    file: BLOCKS,
    from: "if (!byPath.has(file.path)) order.push(file.path);\n      byPath.set(file.path, file.content);",
    to: "if (!byPath.has(file.path)) {\n        order.push(file.path);\n        byPath.set(file.path, file.content);\n      }",
  },
];

let caught = 0;
const missed = [];
for (const m of MUTANTS) {
  const original = readFileSync(m.file, "utf8");
  if (!original.includes(m.from)) {
    missed.push({ ...m, why: `the mutation target no longer exists in ${m.file}` });
    console.log(`  STALE   ${m.name}\n          anchor not found in ${m.file}`);
    continue;
  }
  const mutated = original.replace(m.from, m.to);
  if (mutated === original) {
    missed.push({ ...m, why: "the mutation left the file byte-identical — it is not a defect" });
    console.log(`  NO-OP   ${m.name}`);
    continue;
  }
  writeFileSync(m.file, mutated);
  let failed = false;
  let detail = "";
  try {
    execFileSync("node", [m.gate], { encoding: "utf8", stdio: "pipe" });
  } catch (e) {
    failed = true;
    const out = String(e.stdout || "") + String(e.stderr || "");
    detail = (out.split("\n").find((l) => l.includes("FAIL")) || out.split("\n")[0] || "").trim();
  } finally {
    writeFileSync(m.file, original);
  }
  if (failed) {
    caught++;
    console.log(`  CAUGHT  ${m.name}\n          ${detail.slice(0, 130)}`);
  } else {
    missed.push({ ...m, why: "the gate stayed green with the defect re-introduced" });
    console.log(`  MISSED  ${m.name}`);
  }
}

for (const gate of [DIFF_GATE, BLOCKS_GATE]) {
  try {
    execFileSync("node", [gate], { stdio: "pipe" });
  } catch {
    console.log(`\nBASELINE IS RED (${gate}) — a mutation was not restored. Check \`git diff\`.`);
    process.exit(1);
  }
}
console.log("\nbaseline: both gates are green on the unmutated tree");
console.log(`\n${caught} of ${MUTANTS.length} mutations caught.`);
if (missed.length) {
  console.log("\nHOLES:");
  for (const m of missed) console.log(`  - ${m.name}\n    ${m.why}`);
  process.exit(1);
}
console.log("Every re-introduced defect turned a gate red.");
