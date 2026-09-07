#!/usr/bin/env node
/*
 * COMMENTS THAT DESCRIBE A LIMITATION AS THOUGH IT WERE A DECISION.
 *
 * THE SHAPE, and it is the worst one in docs/shapes.md because the comment
 * PROTECTS the bug. lib/sidebar-label-keys.ts said, for months:
 *
 *   "The underlying strings stay English (state keys, search matching) —
 *    only the rendered label goes through messages/*.json."
 *
 * Every word true. Also a complete description of a defect: the command
 * palette matched an English string it never showed anybody, and 168 of
 * 490 (item x locale) pairs were reachable by the name on the screen —
 * Arabic 0 of 49.
 *
 * A reviewer who sees NO comment asks what happens in Greek. A reviewer
 * who sees that comment reads a considered decision and moves on. An
 * undocumented bug is found by the next person who looks; a documented one
 * is not looked at.
 *
 * THE TEST A PERSON APPLIES: read the sentence as a QUESTION instead of a
 * statement. "The strings stay English for search matching" becomes
 * "SHOULD they?" — and the answer is obviously no. Any comment whose
 * declarative form is comfortable and whose interrogative form is alarming
 * is describing something to fix rather than explaining something.
 *
 * WHAT THIS FILE CAN AND CANNOT DO. It cannot decide whether a sentence is
 * a bug — no scan can, and one that claimed to would be the fourth
 * instrument in this repository to lie about its own precision. What it
 * CAN do is find every comment carrying a limitation phrase, split them by
 * whether a REASON is given nearby, and hold the count of reasonless ones
 * at a ratchet. A limitation with a reason can be re-argued. A limitation
 * with no reason is a sentence nobody can check, and those are the ones
 * that quietly become permanent.
 *
 * PRECISION IS REPORTED, NOT CLAIMED, and it is poor. Section 3 records
 * what a hand read of five entries found and gates nothing on the split
 * because of it. The census size IS gated: keeping the list short enough
 * for a person to read is the only reliable way to find this shape, and it
 * is a thing a scan can genuinely do.
 *
 * Run: node scripts/tests/comment-claims.test.mjs
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";

let pass = 0;
const failures = [];
function ok(name, cond, detail) {
  if (cond) {
    pass++;
    console.log(`  PASS  ${name}`);
  } else {
    failures.push(name);
    console.log(`  FAIL  ${name}${detail !== undefined ? "\n        " + detail : ""}`);
  }
}

// The phrases the owner named, plus the two neighbours that behave the
// same way. Each is a place where somebody wrote down a limitation; none
// of them is wrong to write.
const PHRASES = [
  "stays english", "stay english",
  "for now", "for the moment",
  "by design",
  "intentionally",
  "known limitation",
  "good enough",
  "acceptable for now",
  "not supported yet", "does not support yet",
];

// "deliberately" WAS ON THIS LIST AND CAME OFF IT, and the measurement is
// the reason rather than a preference.
//
// It matched 403 of 467 blocks — 86% of the whole census — because it is
// this repository's house word for EXPLAINING a choice ("Deliberately
// biased toward NOT asking: the prompts below are explicit that..."), not
// for flagging a limitation. A phrase whose hits are overwhelmingly the
// thing you are NOT looking for does not narrow anything; it buries the
// twelve entries that matter under four hundred that do not, and a list
// nobody can read is a list nobody reads.
//
// Precision against the shape this file exists for was near zero. Said
// here rather than left as a number nobody questions.
const DROPPED_FOR_LOW_PRECISION = ["deliberately"];

// A REASON, in the shapes English actually uses to give one. Looked for in
// the SAME comment block, not the same line: the reason usually follows in
// the next sentence.
const REASON = /\b(because|since|otherwise|so that|the reason|which is why|or else|rather than|instead of|would (?:have|be|mean|cost)|it is what|and that is)\b/i;

const files = [];
(function walk(dir) {
  for (const e of readdirSync(dir)) {
    if (e === "node_modules" || e === ".next" || e === ".git") continue;
    const p = path.join(dir, e);
    if (statSync(p).isDirectory()) walk(p);
    else if (/\.(ts|tsx|mjs|js)$/.test(p)) files.push(p);
  }
})("src");
(function walk(dir) {
  for (const e of readdirSync(dir)) {
    if (e === "node_modules") continue;
    const p = path.join(dir, e);
    if (statSync(p).isDirectory()) walk(p);
    else if (/\.(ts|mjs|js)$/.test(p)) files.push(p);
  }
})("scripts");

/**
 * Every comment BLOCK in a file: runs of consecutive `//` lines, and each
 * block comment. A block rather than a line, because the phrase and its
 * reason are usually on different lines and a line-at-a-time scan reports
 * every well-explained comment as unexplained.
 */
function commentBlocks(src) {
  const blocks = [];
  const lines = src.split("\n");
  let current = null;
  lines.forEach((line, i) => {
    const m = line.match(/^\s*\/\/(.*)$/);
    if (m) {
      if (!current) current = { line: i + 1, text: "" };
      current.text += m[1] + "\n";
    } else if (current) {
      blocks.push(current);
      current = null;
    }
  });
  if (current) blocks.push(current);
  for (const m of src.matchAll(/\/\*[\s\S]*?\*\//g)) {
    blocks.push({ line: src.slice(0, m.index).split("\n").length, text: m[0] });
  }
  return blocks;
}

const withReason = [];
const withoutReason = [];
for (const file of files) {
  const src = readFileSync(file, "utf8");
  for (const block of commentBlocks(src)) {
    const lower = block.text.toLowerCase();
    const hit = PHRASES.find((p) => lower.includes(p));
    if (!hit) continue;
    const entry = { file, line: block.line, phrase: hit, text: block.text.trim().slice(0, 120) };
    if (REASON.test(block.text)) withReason.push(entry);
    else withoutReason.push(entry);
  }
}

console.log("== 1. the census ==");
console.log(`\n  ${withReason.length + withoutReason.length} comment blocks carry a limitation phrase`);
console.log(`  ${withReason.length} give a reason in the same block`);
console.log(`  ${withoutReason.length} do not\n`);

const byPhrase = new Map();
for (const e of [...withReason, ...withoutReason]) {
  byPhrase.set(e.phrase, (byPhrase.get(e.phrase) ?? 0) + 1);
}
console.log("  phrase                  total");
for (const [p, n] of [...byPhrase].sort((a, b) => b[1] - a[1])) {
  console.log(`  ${p.padEnd(22)} ${String(n).padStart(5)}`);
}

if (withoutReason.length) {
  console.log("\n  NO REASON GIVEN:");
  for (const e of withoutReason.slice(0, 40)) {
    console.log(`    ${e.file}:${e.line}  [${e.phrase}]`);
  }
}

// ---------------------------------------------------------------------
console.log("\n== 2. the scan can still find things ==");
{
  ok("comment blocks were parsed at all", files.length > 500, `${files.length} files`);
  ok("...and the phrase list finds some", withReason.length + withoutReason.length > 20);
  // A SCAN THAT FINDS ONLY EXPLAINED ONES IS BROKEN, not clean. If the
  // reason regex ever matches everything, this check says so rather than
  // reporting a triumphant zero.
  ok("the reason test is not matching everything",
    withReason.length < withReason.length + withoutReason.length,
    "every single limitation comment 'has a reason' — the regex is too generous to mean anything");
}

// ---------------------------------------------------------------------
console.log("\n== 3. the ratchet, and what it is honestly on ==");
{
  // THE RATCHET IS ON THE CENSUS, NOT ON THE "no reason" SPLIT, and that
  // is a correction rather than a preference.
  //
  // The split is produced by a regex looking for `because`, `since`,
  // `so that` and friends. Five of the 34 it reported as reasonless were
  // read by hand on 2026-09-07 and FOUR of them give a perfectly good
  // reason in words the regex does not know:
  //
  //   lib/languages.ts            "...which read as broken/non-functional
  //                                options" — a reason, phrased as a
  //                                consequence.
  //   social-auth-buttons.tsx     "the browser is already navigating away,
  //                                so the loading state is intentionally
  //                                never cleared" — the reason precedes
  //                                the phrase instead of following it.
  //   settings/page.tsx           "a simple sum, not a running ledger
  //                                balance, good enough for a usage
  //                                summary" — the reason is the clause
  //                                the phrase sits inside.
  //   beta.ts                     explains itself over the next four lines.
  //
  // So precision on "gives no reason" is roughly 1 in 5 against a hand
  // read. That number is printed above and gated on NOTHING, because a
  // check whose baseline is a bad measurement is worse than no check —
  // this repository has shipped that twice and both are in docs/shapes.md.
  //
  // What IS worth holding is the SIZE OF THE CENSUS. 65 comment blocks in
  // the tree carry a limitation phrase. That list is short enough for a
  // person to read in one sitting, which is the only reliable way to find
  // the shape this file is named for; if it grows to two hundred, nobody
  // will, and the next "stays English" will sit in it undisturbed.
  const CENSUS_CEILING = 65;
  const census = withReason.length + withoutReason.length;
  ok(`at most ${CENSUS_CEILING} comment blocks carry a limitation phrase`,
    census <= CENSUS_CEILING,
    `${census}. Read the new ones: is each explaining a decision, or describing a defect?`);

  console.log(`        census ${census}; the reason-split is printed, not gated (precision ~1 in 5 by hand)`);
}

console.log("\n== 4. the one that started this is gone ==");
{
  // NAMED, because it is the instance the shape was written from. The
  // palette now matches every name an item answers to; the comment that
  // said otherwise had to go with it, and a fix that leaves the sentence
  // standing is the same bug with a fresh coat of paint.
  const labelKeys = readFileSync("src/lib/sidebar-label-keys.ts", "utf8");
  ok("sidebar-label-keys no longer claims search matches on English",
    !/stay\s+English\s*\(state keys, search matching\)/i.test(labelKeys),
    "the comment that protected the palette defect is back");
  ok("...and says what those strings actually are",
    /STATE KEYS, AND THAT IS ALL THEY ARE/.test(labelKeys));
}

console.log(`\n${failures.length === 0 ? "PASSED" : "FAILED"}: ${pass} passed, ${failures.length} failed`);
if (failures.length) {
  for (const f of failures) console.log(`  - ${f}`);
  process.exit(1);
}
