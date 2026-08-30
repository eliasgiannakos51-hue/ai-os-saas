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

console.log("\n== a claim about language coverage names how many ==");
// THE NINTH SHAPE: a comment technically true that reads as complete.
//
// lib/agents/injection-patterns.ts said its patterns "now cover the
// obvious cases in more than one language". True. It covered two of ten,
// and an override written in Spanish went through untouched. Nobody
// re-read it because there was nothing in it to check.
//
// The broad version of this — every "covers"/"handles"/"supports" in the
// tree — is a finding aid with too many false positives to be a gate:
// "the anchor covers the content" and "the balance could not cover the
// action" are ordinary English. So this pins the narrow case that
// actually burned us and IS mechanically checkable: a comment that claims
// coverage OF LANGUAGES must say how many, in digits or in words.
// THE CLAIM SHAPE, not "a verb near the word language". Four sentences
// tripped the loose version and none was a coverage claim: "a boundary
// that works for its script", "Whisper detects the language itself".
// What makes it a claim is a QUANTIFIER — every, all, more than one,
// multiple — between the verb and the noun.
const LANG_CLAIM =
  /\b(?:cover|covers|covering|handle|handles|handling|support|supports|supporting|catch|catches|neutralise|neutralises|match|matches)\b[^\n]{0,50}\b(?:all|every|each|multiple|several|many|more than one|any)\b[^\n]{0,30}\b(?:languages?|locales?|scripts?|alphabets?)\b/i;
// "MORE THAN ONE" CONTAINS A NUMBER WORD AND COUNTS NOTHING. The probe
// below caught that: the original offending comment says "in more than
// one language", and a naive number check reads the "one" and passes it.
// That phrasing is the thing being forbidden, so it cannot be what
// exempts it.
const HEDGED = /\b(?:more than|at least|over|upwards of|no fewer than)\s+(?:one|two|\d+)\b/i;
const COUNTED = (line) =>
  !HEDGED.test(line) &&
  /\b\d+\b|\b(one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|both)\b/i.test(line);
// The gate files this suite already walks, plus the source tree, because
// the comment that burned us was in src/.
const srcFiles = [];
(function walkSrc(dir) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walkSrc(full);
    else if (/\.tsx?$/.test(entry.name)) srcFiles.push(full);
  }
})("src");
const claimTargets = files.map((f) => path.join(DIR, f)).concat(srcFiles);
// A FLOOR ON THE SCAN, not on its result. "No vague claims" is trivially
// true of a walk that found no files to read.
ok(`the claim scan has files to read (${claimTargets.length})`, claimTargets.length >= 500, String(claimTargets.length));

// DERIVED FROM THE WALK, not accumulated into a bare array — so the
// floor on claimTargets above is on the same chain as the assertion
// below, and gate-vacuity.test.mjs can see that this scan looked at
// something. It flagged the first version for exactly that.
const QUOTING_IT = new Set([
  // QUOTING A BAD COMMENT IS NOT MAKING ONE. Two files have to contain
  // the sentence verbatim — the gate that tests for it, and the one that
  // records why its own wording changed — and a rule that cannot tell a
  // quotation from a claim would forbid documenting the fix. Named rather
  // than pattern-matched, so a third file cannot quietly acquire the
  // licence by adding a quotation mark.
  "scripts/tests/injection-patterns.test.mjs",
  "scripts/tests/language-extremes.test.mjs",
]);
const vagueClaims = claimTargets.flatMap((file) => {
  if (QUOTING_IT.has(file.split(path.sep).join("/"))) return [];
  return readFileSync(file, "utf8")
    .split("\n")
    .map((line, i) => ({ line, i }))
    .filter(({ line }) => {
      const t = line.trim();
      if (!t.startsWith("//") && !t.startsWith("*") && !t.startsWith("--")) return false;
      return LANG_CLAIM.test(line) && !COUNTED(line);
    })
    .map(({ line, i }) => `${file}:${i + 1}  ${line.trim().slice(0, 88)}`);
});
ok(
  "no comment claims language coverage without saying how many",
  vagueClaims.length === 0,
  vagueClaims.join("\n        ") +
    "\n        Say the number. \"more than one language\" was true of two out of ten."
);
// AND THE CHECK CAN GO RED, shown on strings rather than on the tree.
// THE EXACT SENTENCE THAT BURNED US, as the probe.
const OFFENDER = "// cases, and they now cover the obvious cases in more than one language.";
ok("the claim matcher recognises the sentence that burned us", LANG_CLAIM.test(OFFENDER), OFFENDER);
ok("...and does not accept its hedged 'one' as a count", !COUNTED(OFFENDER));
ok("...while a real count is accepted", COUNTED("// covers all ten languages the app ships"));
ok("...and a digit too", COUNTED("// handles all 10 locales"));
ok(
  "...and does not fire on prose that merely mentions a language",
  !LANG_CLAIM.test("// the Greek page renders right-to-left text correctly")
);

console.log(
  failures.length === 0
    ? `\nALL ${pass} CHECKS PASSED`
    : `\nFAILURES: ${pass} passed, ${failures.length} failed\n  - ${failures.join("\n  - ")}`,
);
process.exit(failures.length === 0 ? 0 : 1);
