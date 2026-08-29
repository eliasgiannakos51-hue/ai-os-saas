// ONE NAME FOR EACH THING — enforced from docs/glossary.md itself.
//
// V4.6 #8. entry / record / log / activity are one concept with four
// names, and counting English words finds almost none of it: `successfully`
// appeared 0 times, `simply` 0, `easy` 0, `seamless` 0. English read clean.
//
// THE COLLISION IS IN THE OTHER NINE LANGUAGES. Three sentences that say
// the same thing in English — dashboard.overview.entry,
// dashboard.overview.statRow.fromEntries and dashboard.insights.basedOn —
// said it with THREE different nouns in Japanese (エントリー · 記録 ·
// レコード) and Arabic (إدخال · مدخل · سجل), and two in Greek, Spanish,
// French, Italian and Portuguese. Nobody reviewing the English could have
// seen it, and nobody reviewing one language sees the other nine.
//
// THIS FILE READS THE GLOSSARY rather than holding its own copy of the
// rules. A gate with its own private list of approved words is a second
// glossary that drifts from the first; here, editing the table in
// docs/glossary.md is what changes the enforcement.
//
// Run: node scripts/tests/glossary.test.mjs
import { readFileSync } from "node:fs";

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
const listOf = (name, items, limit = 8) =>
  items.slice(0, limit).join("\n        ") + (items.length > limit ? `\n        ...and ${items.length - limit} more` : "");

const LOCALES = ["en", "el", "es", "fr", "de", "it", "pt", "zh", "ja", "ar"];
const messages = Object.fromEntries(
  LOCALES.map((l) => [l, JSON.parse(readFileSync(`messages/${l}.json`, "utf8"))])
);
function* walk(obj, path = "") {
  if (obj && typeof obj === "object")
    for (const [k, v] of Object.entries(obj)) yield* walk(v, path ? `${path}.${k}` : k);
  else if (typeof obj === "string") yield [path, obj];
}
const strings = Object.fromEntries(LOCALES.map((l) => [l, [...walk(messages[l])]]));

// ---------------------------------------------------------------------
console.log("== 1. the glossary parses, and says something ==");
const md = readFileSync("docs/glossary.md", "utf8");
function table(name) {
  const start = md.indexOf(`<!-- ${name}:START -->`);
  const end = md.indexOf(`<!-- ${name}:END -->`);
  if (start < 0 || end < 0 || end < start) return null;
  return md
    .slice(start, end)
    .split("\n")
    .filter((l) => l.trim().startsWith("|") && !/^\s*\|\s*-+/.test(l))
    .slice(1)
    .map((l) => l.split("|").slice(1, -1).map((c) => c.trim()));
}
const approved = table("APPROVED");
const forbidden = table("FORBIDDEN");
const exceptions = table("EXCEPTIONS");
const uservoice = table("USERVOICE");
// A MISSING MARKER MUST NOT READ AS "NOTHING FORBIDDEN". Every check below
// loops over these rows; an empty table passes every one of them while
// enforcing nothing, which is the failure shape this section exists for.
for (const [name, rows, min] of [
  ["APPROVED", approved, 4],
  ["FORBIDDEN", forbidden, 10],
  ["EXCEPTIONS", exceptions, 1],
  ["USERVOICE", uservoice, 10],
]) {
  check(
    `the ${name} table is present and populated (>= ${min} rows)`,
    rows !== null && rows.length >= min,
    rows === null ? "the START/END markers are gone" : `${rows.length} rows`
  );
}
if (failures.length > 0) {
  console.log("\nThe glossary could not be read — every rule below would pass vacuously.");
  process.exit(1);
}
check(
  "every approved row names a term in all 10 languages",
  approved.every((r) => r.length === 11 && r.slice(1).every((c) => c.length > 0)),
  approved.filter((r) => r.length !== 11 || r.slice(1).some((c) => !c)).map((r) => r[0]).join(", ")
);

// ---------------------------------------------------------------------
console.log("\n== 2. no forbidden synonym as a counted noun, in any language ==");
const EXCEPT = new Set(exceptions.map((r) => r[0]));
const esc = (w) => w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
// A NUMBER IN FRONT OF IT IS WHAT MAKES IT THE CONCEPT. "record" the verb
// and "a record, not advice" are different words wearing the same letters;
// counting is what only the unit does.
//
// CJK HAS NO SPACES. The first version of this matcher required them and
// scored Japanese and Chinese at zero — which reads as "those languages
// are clean" while Japanese had three words for one concept. Space-
// separated languages get up to three intervening words; zh and ja get up
// to six intervening characters.
const counted = (w, lang) =>
  lang === "zh" || lang === "ja"
    ? new RegExp(`(\\{[^}]*\\bcount\\b[^}]*\\}|#|\\b\\d+)[^\\s]{0,6}?${esc(w)}`, "iu")
    : new RegExp(`(\\{[^}]*\\bcount\\b[^}]*\\}|#|\\b\\d+)\\s*(?:[\\p{L}’'ς]{1,12}\\s+){0,3}${esc(w)}`, "iu");

let scanned = 0;
for (const lang of LOCALES) {
  const words = forbidden.filter((r) => r[1] === lang).flatMap((r) => r[2].split(",").map((w) => w.trim()));
  check(`${lang}: the glossary forbids something here`, words.length > 0, "no FORBIDDEN row for this language");
  // A FLOOR ON THE SCAN, not on its result. "No violations" is trivially
  // true of a catalogue this file failed to read.
  check(`${lang}: the catalogue was read`, strings[lang].length >= 2000, `${strings[lang].length} strings`);
  const hits = [];
  for (const [key, value] of strings[lang]) {
    if (EXCEPT.has(key)) continue;
    for (const w of words)
      if (counted(w, lang).test(value)) {
        hits.push(`${key}  [${w}]  ${value.slice(0, 70)}`);
        scanned++;
        break;
      }
  }
  check(`${lang}: no counted noun uses a forbidden synonym`, hits.length === 0, listOf(lang, hits));
}
// THE SCAN MUST BE ABLE TO FIND ONE. A matcher that matches nothing agrees
// with everything, so it is pointed at a string built to be found.
//
// THE PLANTED STRING HAS TO LOOK LIKE THE REAL ONE. The first version
// planted "12条目" — number, then noun, nothing between — and the
// space-requiring regex matched it too, because `\s*` also matches no
// space at all. So the probe proved nothing and the CJK branch could be
// deleted with the gate still green. Real Japanese counts things as
// "50件の記録": a counter and a particle sit in between, and that is what
// only the CJK branch can cross.
const PROBE_GAP = { zh: "条", ja: "件の" };
check(`the probe covers every language (${LOCALES.length})`, LOCALES.length >= 10, String(LOCALES.length));
const probe = LOCALES.filter((lang) => {
  const w = forbidden.find((r) => r[1] === lang)?.[2].split(",")[0].trim();
  if (!w) return true;
  const planted = PROBE_GAP[lang] ? `50${PROBE_GAP[lang]}${w}` : `12 of your ${w}`;
  return !counted(w, lang).test(planted);
});
check("the matcher finds a planted violation in every language", probe.length === 0, probe.join(", "));

// ---------------------------------------------------------------------
console.log("\n== 3. the words that are banned outright ==");
// COMMENTS ARE NOT CODE, and neither is the glossary: docs/glossary.md
// contains every banned word by definition, so it is never scanned.
const BANNED = ["successfully", "simply", "easy", "seamless", "effortless", "unlock"];
for (const w of BANNED) {
  const hits = [];
  for (const lang of LOCALES)
    for (const [key, value] of strings[lang])
      if (new RegExp(`\\b${w}\\b`, "i").test(value)) hits.push(`${lang} ${key}: ${value.slice(0, 60)}`);
  check(`"${w}" appears nowhere`, hits.length === 0, listOf(w, hits));
}
// The minimising "just", not the contrastive one. "not just snippets" is
// fine; "just click here" tells the reader their difficulty is their fault.
const MINIMISING = /\bjust\s+(ask|click|tap|press|type|add|pick|choose|select|enter|open|go|hit|drag|drop)\b/i;
const minimising = strings.en.filter(([, v]) => MINIMISING.test(v)).map(([k, v]) => `${k}: ${v.slice(0, 60)}`);
check('no minimising "just X" in English', minimising.length === 0, listOf("just", minimising));

console.log("\n== 4. the product is not excited ==");
for (const lang of LOCALES) {
  // Half-width and full-width, since zh/ja use the wide form.
  const bang = strings[lang].filter(([, v]) => /[!！]/.test(v)).map(([k, v]) => `${k}: ${v.slice(0, 60)}`);
  check(`${lang}: no exclamation marks in system copy`, bang.length === 0, listOf(lang, bang));
}

// ---------------------------------------------------------------------
console.log("\n== 5. the product says \"your\", and does not say \"I\" ==");
// A LIST, NOT A COUNT. A ratchet on the number tells a reviewer that
// something new appeared; a ratchet on the set tells them which string, so
// they can judge who is speaking in it.
const ALLOWED = new Set(uservoice.map((r) => r[0]));
const FIRST_PERSON = /\b(my|mine|I'm|I've|I'll|I'd)\b/;
const found = strings.en
  .filter(([k, v]) => FIRST_PERSON.test(v) && !/^(chat|askAi|aiSteps)\./.test(k))
  .map(([k]) => k);
const undeclared = found.filter((k) => !ALLOWED.has(k));
check(
  "every first-person string is one the glossary declares as the user's own voice",
  undeclared.length === 0,
  listOf("first person", undeclared.map((k) => `${k}: ${strings.en.find(([kk]) => kk === k)[1].slice(0, 60)}`))
);
// A STALE ALLOWLIST IS A LIE ABOUT THE PRODUCT. An entry for a string that
// no longer says "my" reads as an approved exception and is not one.
const stale = [...ALLOWED].filter((k) => !found.includes(k));
check("the allowlist has no entries for strings that no longer speak first person", stale.length === 0, stale.join(", "));

console.log(`\n${failures.length === 0 ? "ALL PASS" : "FAILURES"}: ${pass} passed, ${failures.length} failed`);
process.exit(failures.length === 0 ? 0 : 1);
