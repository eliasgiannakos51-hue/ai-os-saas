// A SCRIPT TEST THAT STOPS SHORT OF THE TWO EXTREMES IS A SCRIPT TEST THAT
// PASSES BY LUCK.
//
// WHERE THIS RULE COMES FROM. @react-pdf breaks lines at spaces. Chinese has
// none, so a 106-character paragraph came out as ONE line running off the
// page and most of the text was simply gone. Japanese SURVIVED the same
// code, because its kana gave the breaker something to work with — so a
// suite that tested `ja` and called CJK covered would have passed, green,
// over a defect that loses a Chinese user half their document.
//
// The same asymmetry runs the other way. Greek and Cyrillic exercise
// case-folding and accents; they say nothing about a script written right to
// left, where the bidi algorithm, the mirrored alignment and a line box
// nearly twice as tall all meet. Arabic is where that goes wrong.
//
// So the rule, in one line: ANY gate that has already decided to test a
// non-European script must cover BOTH ends of the range it is claiming —
// CJK (no word boundaries) and Arabic (right to left). Greek is not enough.
// Japanese is not enough.
//
// WHAT IS NOT IN SCOPE. A gate carrying only Latin, Greek or Cyrillic text
// is not making a claim about scripts and is left alone — the rule applies
// to files that reached for Han, kana, Arabic, Hebrew, Devanagari, Hangul or
// Thai, because those are the ones whose author was thinking about writing
// systems. And a gate that reads messages/*.json covers all ten locales by
// construction; nothing is hard-coded there to be incomplete.
//
// Run: node scripts/tests/language-extremes.test.mjs
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";

const DIR = "scripts/tests";

let pass = 0;
const failures = [];
function ok(name, cond, detail = "") {
  if (cond) {
    pass++;
    console.log(`  PASS  ${name}`);
  } else {
    failures.push(name);
    console.log(`  FAIL  ${name}${detail ? `\n        ${detail}` : ""}`);
  }
}

// The scripts whose presence means "this file is about writing systems".
// European scripts are deliberately absent: Greek and Cyrillic are ordinary
// content in this repository, not a statement of intent.
const NON_EUROPEAN = {
  han: /[㐀-䶿一-鿿]/u,
  kana: /[぀-ヿ]/u,
  fullwidth: /[！-｠]/u,
  arabic: /[؀-ۿݐ-ݿ]/u,
  hebrew: /[֐-׿]/u,
  devanagari: /[ऀ-ॿ]/u,
  hangul: /[가-힯]/u,
  thai: /[฀-๿]/u,
};

/** The two ends every script test has to reach. */
const CJK = ["han", "kana", "fullwidth"];
const RTL = ["arabic", "hebrew"];

// ---------------------------------------------------------------------
// Files where one end genuinely does not apply, with the reason. An entry
// here is a claim about the file, and the claim is checked below.
// ---------------------------------------------------------------------
const ALLOWED = new Map([
  // This file names both extremes in order to describe them.
  [
    "language-extremes.test.mjs",
    "the rule itself, which has to spell out what it requires",
  ],
]);

const files = readdirSync(DIR)
  // MUTATION SUITES ARE NOT SCRIPT TESTS. A *.mutation.mjs file exists to
  // damage its gate and watch it go red; the sample text in it belongs to
  // the gate it targets, and demanding both extremes here would mean pasting
  // Arabic into a file with no use for it. The gates themselves are in
  // scope, which is where the coverage has to be.
  .filter((f) => /\.(test|itest|prodtest|dbtest)\.mjs$/.test(f))
  .sort();

console.log("language-extremes");
ok(
  `the gates were found (${files.length})`,
  files.length >= 200,
  `found ${files.length}`,
);

const scriptTests = [];
for (const file of files) {
  let raw;
  try {
    raw = readFileSync(path.join(DIR, file), "utf8");
  } catch {
    continue;
  }
  // THE ESCAPE, NOT THE BYTE. Written with the literal NUL this file became
  // binary to grep and to git, and its own guard skipped it — the third time
  // that has happened in this directory, which is why
  // gate-vacuity.test.mjs now fails the build over it.
  if (raw.indexOf("\u0000") !== -1) continue; // file-extraction embeds one on purpose
  const present = Object.entries(NON_EUROPEAN)
    .filter(([, re]) => re.test(raw))
    .map(([name]) => name);
  if (present.length === 0) continue;
  scriptTests.push({ file, present });
}

// ---------------------------------------------------------------------
console.log("\n== the scan found script tests to check ==");
// ---------------------------------------------------------------------
// A FLOOR, because "none is incomplete" is trivially true of an empty list
// and this whole file is one character range away from finding nothing.
ok(
  `gates carrying non-European sample text (${scriptTests.length})`,
  scriptTests.length >= 10,
  `found ${scriptTests.length} — a green verdict over this few is a fact about the ranges above`,
);
{
  const counts = new Map();
  for (const { present } of scriptTests)
    for (const s of present) counts.set(s, (counts.get(s) ?? 0) + 1);
  console.log(`        ${[...counts].map(([k, v]) => `${k}:${v}`).join("  ")}`);
}

// ---------------------------------------------------------------------
console.log("\n== every script test reaches both extremes ==");
// ---------------------------------------------------------------------
{
  const short = [];
  for (const { file, present } of scriptTests) {
    if (ALLOWED.has(file)) continue;
    const hasCjk = present.some((s) => CJK.includes(s));
    const hasRtl = present.some((s) => RTL.includes(s));
    if (hasCjk && hasRtl) continue;
    const missing = [
      !hasCjk && "CJK (no word boundaries)",
      !hasRtl && "right-to-left",
    ].filter(Boolean);
    short.push(
      `${file}: has ${present.join(", ")} — missing ${missing.join(" and ")}`,
    );
  }
  ok(
    `no script test stops at one end (${short.length})`,
    short.length === 0,
    short.join("\n        ") +
      "\n        Japanese alone is not CJK coverage: kana give a space-based line breaker" +
      "\n        something to work with, and Han does not. Greek alone is not script coverage.",
  );

  // AND THE EXEMPTIONS EARN THEMSELVES. A name here that no longer describes
  // a file is a rule protecting nothing.
  const stale = [...ALLOWED.keys()].filter(
    (f) => !scriptTests.some((t) => t.file === f),
  );
  ok(
    `every exemption still describes a script test (${stale.length} do not)`,
    stale.length === 0,
    stale.join(", "),
  );
}

// ---------------------------------------------------------------------
console.log("\n== the check can go red ==");
// ---------------------------------------------------------------------
// Everything above is "nothing is wrong", which is the shape a gate lies in.
{
  const jaOnly = "こんにちは世界";
  const arOnly = "مرحبا";
  const both = `${jaOnly} ${arOnly} 中文`;
  const reach = (text) => ({
    cjk: CJK.some((s) => NON_EUROPEAN[s].test(text)),
    rtl: RTL.some((s) => NON_EUROPEAN[s].test(text)),
  });
  const ja = reach(jaOnly);
  ok("a sample with only Japanese is not complete", ja.cjk && !ja.rtl);
  const ar = reach(arOnly);
  ok("...nor is one with only Arabic", !ar.cjk && ar.rtl);
  const greek = reach("Καλημέρα κόσμε");
  ok("...and Greek reaches neither end", !greek.cjk && !greek.rtl);
  const all = reach(both);
  ok("...while a sample with both is", all.cjk && all.rtl);
}

console.log(
  failures.length === 0
    ? `\nALL ${pass} CHECKS PASSED`
    : `\nFAILURES: ${pass} passed, ${failures.length} failed\n  - ${failures.join("\n  - ")}`,
);
process.exit(failures.length === 0 ? 0 : 1);
