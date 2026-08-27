// The idea verdict badge: does its colour match what the user wrote?
//
// WHAT WENT WRONG. components/ideas/idea-row.tsx classified the free-text
// verdict with three `includes` calls, positives first:
//
//     if (v.includes("pursue") || v.includes("go") || v.includes("build")) -> green
//     if (v.includes("kill")   || v.includes("no"))                        -> red
//
// "no-go" contains "go" and the green branch runs first, so the app painted
// a kill in the colour of a build. And none of the eighteen non-English
// words the field's OWN placeholder suggests appears in those calls, so in
// nine languages out of ten every verdict fell through to the neutral
// colour.
//
// This checks both, and checks the second one against messages/*.json
// rather than against a list somebody typed here — the placeholder is the
// app's own instruction to the user, so it is the right source of truth for
// what the classifier has to understand. All 10 locales, every suggested
// word: a cross product, not a sample.
//
// Run: node scripts/tests/idea-verdict.test.mjs
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { loadTs } from "./load-ts.mjs";

const ROOT = process.cwd();
let pass = 0;
let fail = 0;
function check(name, actual, expected) {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a === e) {
    pass++;
    console.log(`  PASS  ${name}`);
  } else {
    fail++;
    console.log(`  FAIL  ${name}\n        expected ${e}\n        actual   ${a}`);
  }
}

const { classifyVerdict, verdictBadgeClasses } = await loadTs("src/lib/ideas/verdict.ts");

console.log("idea-verdict");

// ---------------------------------------------------------------------
console.log("\n== 1. the bug: a kill is never painted as a build ==");
// ---------------------------------------------------------------------
// Every one of these was GREEN before. The first is the exact string a
// product person writes.
for (const text of [
  "no-go",
  "no go",
  "No-Go",
  "NO-GO",
  "not going ahead",
  "no, don't build",
  "no. build later maybe",
]) {
  check(`"${text}" is a kill`, classifyVerdict(text), "no");
}
// And the reverse still works.
for (const text of ["pursue", "go", "build it", "ship", "Pursue this one"]) {
  check(`"${text}" is a go`, classifyVerdict(text), "go");
}

// ---------------------------------------------------------------------
console.log("\n== 2. substrings are not words ==");
// ---------------------------------------------------------------------
// `includes("go")` matched all of these. None of them is a verdict.
check('"ongoing discussion" is not a go', classifyVerdict("ongoing discussion") === "go", false);
check('"unknown" is not a kill', classifyVerdict("unknown") === "no", false);
check('"economics unclear" is not a kill', classifyVerdict("economics unclear") === "no", false);
check('"forgo" is not a go', classifyVerdict("forgo") === "go", false);

// ---------------------------------------------------------------------
console.log("\n== 3. every word the app itself suggests, in all 10 locales ==");
// ---------------------------------------------------------------------
// THE CROSS PRODUCT. The placeholder is "e.g. pursue / kill / watch" — three
// slash-separated options in every language, in the order go / no / watch.
// Reading it here means a translator who changes a suggested word breaks
// this gate rather than silently breaking the badge.
const localeFiles = readdirSync(path.join(ROOT, "messages")).filter((f) => f.endsWith(".json")).sort();
check(`all 10 locales present (${localeFiles.length})`, localeFiles.length, 10);

const EXPECTED_ORDER = ["go", "no", "watch"];
let checkedWords = 0;
for (const file of localeFiles) {
  const locale = file.replace(/\.json$/, "");
  const json = JSON.parse(readFileSync(path.join(ROOT, "messages", file), "utf8"));
  const placeholder = json?.dashboard?.ideas?.verdictPlaceholder ?? json?.ideas?.verdictPlaceholder;
  check(`${locale}: has a verdict placeholder`, typeof placeholder === "string" && placeholder.length > 0, true);
  if (typeof placeholder !== "string") continue;

  // "e.g. pursue / kill / watch" -> ["pursue", "kill", "watch"]. The lead-in
  // ("e.g.", "π.χ.", "z. B.", "مثال:", "例:") is stripped from the FIRST
  // option only, GREEDILY to the last "." or ":" followed by space — a
  // non-greedy strip stops at the dot inside "e.g." and leaves "g. pursue",
  // which still classified correctly and so would have hidden the mistake.
  //
  // zh writes "例如 推进" with no punctuation at all, so the lead-in survives
  // there. That is why the leadIn guard below exists: whatever this strip
  // leaves in front of the word must itself be no verdict at all, or a test
  // that looks like it is checking "推进" would really be checking "例如".
  const firstRaw = placeholder.split("/")[0] ?? "";
  const stripped = firstRaw.replace(/^.*[:.]\s+/u, "");
  const leadIn = firstRaw.slice(0, firstRaw.length - stripped.length).trim();
  // "not a verdict" is none OR unclear — "e.g." is text, so it classifies as
  // unclear, and only go/no/watch would mean the strip left a real verdict
  // word in front of the one being tested.
  check(
    `${locale}: the placeholder lead-in "${leadIn || "(none)"}" is not itself a verdict`,
    ["go", "no", "watch"].includes(classifyVerdict(leadIn)),
    false
  );
  const options = placeholder
    .split("/")
    .map((part, i) => (i === 0 ? stripped : part).trim())
    .filter(Boolean);
  check(`${locale}: the placeholder offers 3 options (${options.join(" | ")})`, options.length, 3);
  if (options.length !== 3) continue;

  for (let i = 0; i < 3; i++) {
    checkedWords++;
    check(
      `${locale}: "${options[i]}" classifies as ${EXPECTED_ORDER[i]}`,
      classifyVerdict(options[i]),
      EXPECTED_ORDER[i]
    );
    // zh writes "例如 推进" with no punctuation for the strip to find, so the
    // option still carries its lead-in. Prove the verdict came from the
    // LAST segment and not from what precedes it — otherwise a line that
    // reads as a test of "推进" is really a test of "例如".
    const segments = options[i].split(/\s+/u).filter(Boolean);
    if (segments.length > 1) {
      const prefix = segments.slice(0, -1).join(" ");
      check(
        `${locale}: ...and it is the word "${segments[segments.length - 1]}" doing it, not "${prefix}"`,
        ["go", "no", "watch"].includes(classifyVerdict(prefix)),
        false
      );
      check(
        `${locale}: ...the last segment alone classifies as ${EXPECTED_ORDER[i]}`,
        classifyVerdict(segments[segments.length - 1]),
        EXPECTED_ORDER[i]
      );
    }
  }
}
// A floor, because a JSON shape change would make `options` empty and every
// loop above would run zero times while reporting nothing.
check(`the cross product actually ran (${checkedWords} words)`, checkedWords >= 30, true);

// ---------------------------------------------------------------------
console.log("\n== 4. accents and case are not the difference ==");
// ---------------------------------------------------------------------
for (const [text, tone] of [
  ["SÍ", "go"],
  ["si", "go"],
  ["Não", "no"],
  ["nao", "no"],
  ["ΌΧΙ", "no"],
  ["οχι", "no"],
  ["ΠΡΟΧΩΡΆΜΕ", "go"],
  ["Ακύρωση", "no"],
]) {
  check(`"${text}" -> ${tone}`, classifyVerdict(text), tone);
}

// ---------------------------------------------------------------------
console.log("\n== 5. empty and unrecognised stay distinguishable ==");
// ---------------------------------------------------------------------
check("null is none", classifyVerdict(null), "none");
check("empty string is none", classifyVerdict("   "), "none");
check("free text with no verdict word is unclear", classifyVerdict("needs more research"), "unclear");
check("none gets the neutral badge", verdictBadgeClasses(null).includes("text-muted"), true);
check("a kill gets the red badge", verdictBadgeClasses("no-go").includes("text-red-400"), true);
check("a go gets the green badge", verdictBadgeClasses("pursue").includes("text-emerald-400"), true);
check("watch and unclear share the amber badge",
  verdictBadgeClasses("watch") === verdictBadgeClasses("needs more research"), true);

console.log(`\n  ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
