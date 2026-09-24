#!/usr/bin/env node
/*
 * A GATE THAT ASSERTS A SENTENCE THE PRODUCT ONLY PRINTS IN ENGLISH.
 *
 * THE DEFECT, twice, in two directions:
 *
 *   agents-ui.prodtest asserted `!body.includes("Upgrade Required")`.
 *   Point the same working product at a Greek UI and that does not go
 *   red — it goes GREEN, because the English string it forbids was never
 *   going to be there. The check has the shape of an assertion and none
 *   of the effect.
 *
 *   published-site-seo asserted `!/not available/i.test(heading)` about
 *   a page whose heading is "This site isn't available". No locale
 *   involved at all: "isn't" is not "not", the needle never matched, and
 *   the check passed on every run including the broken ones.
 *
 * Ten files were converted on 2026-09-20 to needles resolved out of the
 * locale the page says it is in — scripts/tests/lib/ui-text.mjs reads
 * <html lang> and then that locale's own messages file, the same file the
 * renderer read. This gate is what stops the eleventh.
 *
 * WHAT MAKES IT MORE THAN A BASELINE. Three of the five sections below
 * would still pass if scan-english-anchored-gates.mjs returned nothing at
 * all, which is the scraper failure db-migrations had three of. So §1 is
 * the count, and §2 requires the scan to still be FINDING the two excused
 * literals — an empty scan fails §2, and a stale exception fails §3.
 *
 * §4 is the half a count cannot see: every key the converted files name
 * must resolve, in all ten locales, to something long enough to assert
 * on. A key that resolves to "" makes includes() always true and its
 * negation always false — the vacuity this whole round is about,
 * reintroduced one level down.
 *
 * Run: node scripts/tests/english-anchored-gates.test.mjs
 */
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { DELIBERATE, scanEnglishAnchored } from "../scan-english-anchored-gates.mjs";
// The real floor, fed the real messages files. The RULE comes from the
// helper and the DATA does not, which is what stops this being the shape
// in docs/shapes.md §34 — a gate reading the same source as the code and
// confirming the file equals itself. A floor that rejects a string the
// product ships goes red here, in nine languages nobody runs a prodtest
// in, which is how the ASCII "length < 3" was found an hour after it was
// written.
import { minNeedleLength } from "./lib/ui-text.mjs";

let pass = 0;
const failures = [];
const check = (name, cond, detail) => {
  if (cond) {
    pass++;
    console.log(`  PASS  ${name}`);
  } else {
    failures.push(name);
    console.log(`  FAIL  ${name}${detail !== undefined ? "\n        " + detail : ""}`);
  }
};

const LOCALES = readdirSync("messages")
  .filter((f) => f.endsWith(".json"))
  .map((f) => f.replace(/\.json$/, ""))
  .sort();

const messages = new Map(
  LOCALES.map((l) => [l, JSON.parse(readFileSync(`messages/${l}.json`, "utf8"))])
);
const leaf = (obj, key) => {
  let node = obj;
  for (const part of key.split(".")) {
    if (!node || typeof node !== "object") return null;
    node = node[part];
  }
  return typeof node === "string" ? node : null;
};

const scan = scanEnglishAnchored();

// ---------------------------------------------------------------------
console.log("\n== 1. no gate reads rendered text and compares it to English ==");
// ---------------------------------------------------------------------
check(
  `the BREAKS list is empty (${scan.breaks.length} file(s))`,
  scan.breaks.length === 0,
  scan.breaks
    .map((b) => `${b.file}: ${b.hits.map((h) => JSON.stringify(h.literal)).join(", ")}`)
    .join("\n        ")
);
check(
  `ten locales are shipped, so an English needle is one of ten (${LOCALES.length})`,
  LOCALES.length >= 10,
  LOCALES.join(" ")
);

// ---------------------------------------------------------------------
console.log("\n== 2. the exceptions are still the scan's own findings ==");
// ---------------------------------------------------------------------
// THE ANTI-VACUITY CHECK. §1 passes trivially if the scan breaks and
// returns nothing, which is exactly how db-migrations' three empty
// scrapers printed ALL PASS. This section fails in that case, because an
// empty scan excuses nothing.
check(
  `the scan is still finding literals at all (${scan.sourceOnly.length} source-only file(s))`,
  scan.sourceOnly.length > 20,
  "an empty scan makes section 1 pass by measuring nothing"
);
for (const d of DELIBERATE) {
  check(
    `still found: ${JSON.stringify(d.literal)} in ${d.file.replace("scripts/tests/", "")}`,
    scan.excused.some((e) => e.file === d.file && e.literal === d.literal),
    "the exception covers nothing the scan reports — remove it"
  );
}
check(
  `no exception is unused (${scan.excused.length} excused, ${DELIBERATE.length} listed)`,
  scan.excused.length === DELIBERATE.length,
  `${scan.excused.length} vs ${DELIBERATE.length}`
);

// ---------------------------------------------------------------------
console.log("\n== 3. each exception is checked the OTHER way round ==");
// ---------------------------------------------------------------------
for (const d of DELIBERATE) {
  check(
    `${d.file.replace("scripts/tests/", "")} still contains ${JSON.stringify(d.literal)}`,
    existsSync(d.file) && readFileSync(d.file, "utf8").includes(d.literal),
    "the file no longer has this literal — the exception is stale"
  );
  check(
    `...and says why in more than a phrase (${d.reason.length} chars)`,
    d.reason.length >= 120,
    d.reason
  );
}

// ---------------------------------------------------------------------
console.log("\n== 4. every key the converted files name resolves, in all ten ==");
// ---------------------------------------------------------------------
// A needle of "" makes includes() always true and its negation always
// false. uiTextStrict throws on one at run time; this finds it at build
// time, in nine languages nobody runs the prodtests in.
const KEY_CALL = /\b(?:uiText|uiTextStrict|uiRe|uiFormat|label|labelPattern)\(\s*(?:page|pageEl|pageM|page2|pageA|pageQ|bp|phone|pageEn)?\s*,?\s*"([\w.$-]+\.[\w.$-]+)"/g;
const gateFiles = readdirSync("scripts/tests")
  .filter((f) => /\.(test|prodtest|itest)\.mjs$/.test(f))
  .map((f) => `scripts/tests/${f}`);

const referenced = new Map();
for (const file of gateFiles) {
  const src = readFileSync(file, "utf8");
  for (const m of src.matchAll(KEY_CALL)) {
    if (!referenced.has(m[1])) referenced.set(m[1], new Set());
    referenced.get(m[1]).add(file.replace("scripts/tests/", ""));
  }
}

check(
  `the converted files name message keys at all (${referenced.size})`,
  referenced.size >= 30,
  "an empty key list makes every check below pass by ranging over nothing"
);

const missing = [];
const tooShort = [];
for (const [key, users] of referenced) {
  for (const locale of LOCALES) {
    const value = leaf(messages.get(locale), key);
    if (value === null) {
      missing.push(`${key} (${locale}) <- ${[...users].join(", ")}`);
      continue;
    }
    // The same ICU strip uiText does, and the same floor uiTextStrict
    // refuses below: a key whose whole value is a placeholder yields ""
    // and cannot be a needle in ANY language. `uiFormat` callers are
    // exempt because they format the placeholders rather than dropping
    // them — so the floor is applied to the stripped form only when the
    // stripped form is what a caller would get.
    const strippedValue = value.replace(/\{[^{}]*\}/g, " ").replace(/\s+/g, " ").trim();
    if (strippedValue.length < minNeedleLength(strippedValue) && !/uiFormat/.test([...users].join(""))) {
      tooShort.push(`${key} (${locale}) = ${JSON.stringify(value)} -> ${JSON.stringify(strippedValue)}`);
    }
  }
}
check(
  `every key resolves in every locale (${missing.length} missing)`,
  missing.length === 0,
  missing.slice(0, 8).join("\n        ")
);
check(
  `no key strips to a needle shorter than a word in its own script (${tooShort.length})`,
  tooShort.length === 0,
  tooShort.slice(0, 8).join("\n        ")
);

// ---------------------------------------------------------------------
console.log("\n== 5. the helper refuses the vacuity rather than returning it ==");
// ---------------------------------------------------------------------
const helper = readFileSync("scripts/tests/lib/ui-text.mjs", "utf8");
// Read the code, not the prose above it: the comment in this file already
// says an empty needle is always true, and a check anchored on that
// sentence would survive deleting the throw underneath it.
const helperCode = helper.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
check(
  "uiTextStrict throws rather than returning a needle under the floor",
  /export async function uiTextStrict[\s\S]{0,400}?minNeedleLength\(text\)[\s\S]{0,200}?throw new Error/.test(helperCode),
  helperCode.slice(helperCode.indexOf("uiTextStrict"), helperCode.indexOf("uiTextStrict") + 300)
);
// The floor itself, exercised rather than read. Two han characters are a
// word; "ok" is not. A floor that went back to a constant fails one of
// these whichever constant it picked.
check(
  "the floor lets a two-character Japanese word through",
  minNeedleLength("成功") <= "成功".length,
  `minNeedleLength("成功") = ${minNeedleLength("成功")}`
);
check(
  "...and still refuses a two-letter Latin one",
  minNeedleLength("ok") > "ok".length,
  `minNeedleLength("ok") = ${minNeedleLength("ok")}`
);
// THE OTHER END OF THE SCRIPT RANGE, and the answer is deliberately the
// same as Latin's. An Arabic letter is a letter, not a morpheme: «لا» is
// two of them and is as weak a needle as "ok", where 成功 is a whole
// word. So the floor is not "non-European gets 1" — it is "one han
// character, kana or hangul syllable is a word", and Arabic, Greek,
// Cyrillic and Latin all sit on the three-letter side of it. Of the 47
// keys the converted files name, none resolves under the floor in
// Arabic; this pins the rule rather than the current data.
check(
  "an Arabic two-letter needle is refused, like the Latin one",
  minNeedleLength("لا") === 3,
  `minNeedleLength("لا") = ${minNeedleLength("لا")}`
);
check(
  "...and a real Arabic label is not",
  minNeedleLength("نجحت") <= "نجحت".length,
  "نجحت"
);
check(
  "uiFormat throws rather than returning a message it could not resolve",
  /export async function uiFormat[\s\S]{0,700}?throw new Error/.test(helperCode)
);
check(
  "pageLocale reads <html lang> rather than being told the locale",
  /documentElement\.lang/.test(helperCode)
);
check(
  "intl-messageformat is a declared dependency, not a transitive one",
  Boolean(
    JSON.parse(readFileSync("package.json", "utf8")).devDependencies?.["intl-messageformat"] ??
      JSON.parse(readFileSync("package.json", "utf8")).dependencies?.["intl-messageformat"]
  ),
  "uiFormat imports it directly; under next-intl alone it is one upgrade from vanishing"
);
check(
  "quoteForSelector escapes both quote styles",
  /quoteForSelector[\s\S]{0,300}?\\\\\\\\[\s\S]{0,120}?\\\\"/.test(helperCode),
  helperCode.slice(helperCode.indexOf("quoteForSelector"), helperCode.indexOf("quoteForSelector") + 240)
);

console.log(
  `\n${failures.length === 0 ? "ALL PASS" : "FAILURES"}: ${pass} passed, ${failures.length} failed`
);
if (failures.length) {
  for (const f of failures) console.log(`  - ${f}`);
  process.exit(1);
}
