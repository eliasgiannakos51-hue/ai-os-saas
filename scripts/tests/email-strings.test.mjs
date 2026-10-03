// THE EMAIL REVIEW PACK IS COMPLETE, TIERED, AND NOT STALE.
//
// docs/first-run/emails.<locale>.md is what a native speaker is sent to
// read the emails (V6 1.10d). Three ways it could lie: a new email group
// that the pack never lists, a tier 1 that has grown into something nobody
// reads in an hour, and a pack that has drifted from messages/*.json so the
// reader reviews last week's wording. Each is checked against the source,
// and the pack is regenerated and compared byte for byte, the way
// first-run-strings.test.mjs holds the interface pack.
//
// Run: node scripts/tests/email-strings.test.mjs
import { readFileSync, existsSync } from "node:fs";
import {
  EMAIL_GROUPS,
  SENTENCE_WORDS,
  collectEmails,
  leaves,
  renderPack,
  tierOf,
} from "../email-strings.mjs";
import { LOCALES } from "../first-run-strings.mjs";

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

const messages = Object.fromEntries(LOCALES.map((l) => [l, JSON.parse(readFileSync(`messages/${l}.json`, "utf8"))]));
const { rows, unlisted, missingGroups } = collectEmails(messages.en);

console.log("== 1. the population is the namespace ==");
const allLeaves = leaves(messages.en.email, "email");
check(`the namespace has emails in it (${allLeaves.length} lines)`, allLeaves.length >= 50, String(allLeaves.length));
check("every email group is in the pack", unlisted.length === 0, `not listed: ${unlisted.join(", ")}`);
check("every listed group still exists", missingGroups.length === 0, `gone: ${missingGroups.join(", ")}`);
check(`every line is in the pack exactly once (${rows.length} of ${allLeaves.length})`,
  rows.length === allLeaves.length && new Set(rows.map((r) => r.key)).size === rows.length);
check("a group that is one string (the footer) is one line, not one per character",
  typeof messages.en.email.footer !== "string" || rows.filter((r) => r.group === "footer").length === 1);

console.log("\n== 2. the tiers mean what they say ==");
const t1 = rows.filter((r) => r.tier === 1);
check(`tier 1 is about an hour: between 25 and 60 sentences (${t1.length})`, t1.length >= 25 && t1.length <= 60, String(t1.length));
check("tier 1 is only from the likely emails", t1.every((r) => EMAIL_GROUPS.find((g) => g.group === r.group).likely));
check("the welcome email is in tier 1", t1.some((r) => r.group === "welcome"));
check("a sign-in warning is in tier 1", t1.some((r) => r.group === "newDevice"));
check(`a sentence is ${SENTENCE_WORDS} words or more, placeholders not counted`,
  tierOf({ likely: true }, "Hello {name}, welcome to Ionexa") === 1 &&
    tierOf({ likely: true }, "{a} {b} {c} {d} {e} word") === 3);

console.log("\n== 3. every language, and the files are current ==");
for (const locale of LOCALES) {
  const file = `docs/first-run/emails.${locale}.md`;
  const expected = renderPack(locale, rows, messages);
  check(`${file} is up to date`, existsSync(file) && readFileSync(file, "utf8") === expected,
    existsSync(file) ? "regenerate: npm run i18n:emails" : "missing — npm run i18n:emails");
  if (locale !== "en") {
    const missing = (expected.match(/\*\*MISSING IN THIS LANGUAGE\*\*/g) ?? []).length;
    check(`${locale}: no email line is missing`, missing === 0, `${missing} missing`);
  }
}

console.log(
  failures.length === 0
    ? `\nALL PASS: ${pass} passed, 0 failed`
    : `\nFAILURES: ${pass} passed, ${failures.length} failed`,
);
process.exit(failures.length === 0 ? 0 : 1);
