#!/usr/bin/env node
/*
 * WHICH GATES ARE ANCHORED ON ENGLISH THE USER CAN SEE?
 *
 * THE QUESTION THIS EXISTS FOR. A gate asserted that a plan row reads
 * "Unlimited" — an English word, in a product that ships in ten
 * languages. It passes because the machine running it happens to render
 * English. Turn the UI to Greek and the same correct product fails the
 * same correct check; turn it to Arabic and the check cannot even find
 * the string it is looking for.
 *
 * IT IS THE SAME SHAPE AS TWO DEFECTS ALREADY IN docs/shapes.md: the `\b`
 * word boundary, which is an ASCII rule applied to Greek, and the final
 * sigma, where ς and σ are the same letter to a reader and two different
 * characters to a regex. An instrument that works in one script is not an
 * instrument, it is a coincidence that has not been travelled yet.
 *
 * ------------------------------------------------------------------
 * WHAT COUNTS, AND WHY THE TEST IS "IS IT IN en.json"
 * ------------------------------------------------------------------
 *
 * The hard part is separating English the USER sees from English that is
 * merely in the source: a table name, a CSS class, an HTTP header, a
 * route, a JSON key, an error code. All of those are English and none of
 * them changes when the locale does.
 *
 * So the test is not "does this literal look like a word". It is:
 *
 *     does this literal appear as a VALUE in messages/en.json?
 *
 * A value in en.json is by definition a string this product renders to a
 * user, and by definition one that has nine other spellings. If a gate
 * asserts on it, that gate is asserting in one language. This is a
 * PROVABLE property rather than a guess, which is what keeps the
 * precision worth reading.
 *
 * TWO SEVERITIES, because they fail differently:
 *
 *   BREAKS — the file reads text rendered by a browser (page.innerText,
 *   textContent, page.evaluate returning body text) and compares it to an
 *   English literal. Point it at a Greek UI and it goes red on a product
 *   that is working. These are the real ones.
 *
 *   SOURCE-ONLY — the literal is in en.json but the gate reads a source
 *   file or en.json itself. Asserting that the ENGLISH file says an
 *   English thing is legitimate; it is listed so the two are not
 *   confused, and because a gate that grows a rendered-text read later
 *   starts from here.
 *
 * ------------------------------------------------------------------
 * IT REPORTS; IT DOES NOT GATE
 * ------------------------------------------------------------------
 *
 * Same posture as scan-unjudged-numbers.mjs and
 * scan-declared-never-read.mjs. A prodtest that signs in to a real
 * English account and asserts English is not wrong — it is narrow, and
 * narrow has a cost only when somebody changes the locale. Which of
 * those to widen is a judgement about where the product is going, and a
 * build that fails over it would get an ALLOWED list within a week.
 *
 * Run: scripts/scan-english-anchored-gates.mjs
 */
import { readFileSync, readdirSync } from "node:fs";
import { stripComments } from "./check-mutation-markers.mjs";

const MESSAGES = "messages/en.json";

/** Every leaf string en.json renders, lowercased for comparison. */
function userVisibleStrings() {
  const out = new Map();
  const walk = (node, path) => {
    if (typeof node === "string") {
      out.set(node.toLowerCase(), path);
    } else if (node && typeof node === "object") {
      for (const [k, v] of Object.entries(node)) walk(v, path ? `${path}.${k}` : k);
    }
  };
  walk(JSON.parse(readFileSync(MESSAGES, "utf8")), "");
  return out;
}

/**
 * ICU and placeholders are stripped before comparing: a gate asserts on
 * what the user READS ("1 of 5 agents"), never on the template that
 * produced it ("{used} of {limit} agents"), so the two only meet if the
 * variable parts are removed from both sides.
 */
function stripIcu(s) {
  return s
    .replace(/\{[^{}]*\}/g, " ")
    .replace(/<[^<>]*>/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

/**
 * A literal worth testing: one the gate COMPARES AGAINST TEXT, not one it
 * merely mentions.
 *
 * THE FIRST VERSION OF THIS SCAN TOOK EVERY STRING IN THE FILE, and its
 * precision was 2 in 7. Every false positive was the same thing: a
 * literal in a COMMENT explaining the check, in a `console.log` heading,
 * or in the third argument of `check(...)` — the message shown when the
 * assertion FAILS. All three are English about English, and none of them
 * is read from a screen.
 *
 *     // Credit history is the panel that read "No credit activity yet"
 *     console.log("== 4. instead, a 'new message' affordance appears ==")
 *     checkTrue(..., `${hub.chips} — expected All types + 4 groups`)
 *
 * This repo has already paid for that lesson once: scripts/tests/
 * plan-enforcement.test.mjs failed a file it had just fixed because the
 * explanatory paragraph contained the symbol it was scanning for. The fix
 * was stripComments FIRST, and it is the fix here.
 *
 * So: comments go, and a literal only counts in PREDICATE POSITION —
 * immediately inside something that tests text. That is what makes the
 * claim "this gate would fail against a Greek UI" true rather than
 * plausible.
 */
const PREDICATE = [
  "\\.includes\\(\\s*",
  "\\.test\\(\\s*",
  "\\.toContain\\(\\s*",
  "getByText\\(\\s*",
  "has-text\\(\\s*",
  "\\.indexOf\\(\\s*",
  "\\.startsWith\\(\\s*",
  "\\.endsWith\\(\\s*",
].join("|");

function candidateLiterals(rawSource) {
  const src = stripComments(rawSource);
  candidateLiterals.lastStripped = src;
  const out = [];
  // A STRING in predicate position: body.includes("Upgrade Required")
  const strRe = new RegExp(`(?:${PREDICATE})"((?:[^"\\\\\\n]|\\\\.){6,120})"`, "g");
  for (const m of src.matchAll(strRe)) out.push({ text: m[1], kind: "string", at: m.index });
  // A REGEX tested against something: /Remove the sample/i.test(el.textContent)
  const reRe = /\/((?:[^/\\\n[]|\\.|\[[^\]]*\]){6,120})\/[gimsuy]*\s*\.test\(/g;
  for (const m of src.matchAll(reRe)) out.push({ text: m[1], kind: "regex", at: m.index });
  // A regex handed to a text matcher: getByText(/Run now/)
  const reArg = new RegExp(`(?:${PREDICATE})\\/((?:[^/\\\\\\n[]|\\\\.|\\[[^\\]]*\\]){6,120})\\/[gimsuy]*`, "g");
  for (const m of src.matchAll(reArg)) out.push({ text: m[1], kind: "regex", at: m.index });
  return out.filter((l) => /[A-Za-z]/.test(l.text));
}

/**
 * Does this file compare against text a BROWSER rendered?
 *
 * `\bbody\b\s*\.includes` was in this list and it cost a false positive
 * immediately: cross-module-context-chat-coding.test.mjs builds a PROMPT
 * in a variable called `body` and asserts the English field label is in
 * it — correctly, because a prompt is written to a model, not shown to a
 * person. A variable name is not evidence of a browser. Only a real
 * rendering API counts.
 */
const RENDERS = /page\.(evaluate|innerText|textContent|getByText|locator|\$\$?eval)|\.innerText\b|\.textContent\b|document\.body|has-text\(/;

const messages = userVisibleStrings();
const stripped = new Map();
for (const [value, path] of messages) {
  const s = stripIcu(value);
  if (s.length >= 6) stripped.set(s, path);
}

const files = readdirSync("scripts/tests")
  .filter((f) => /\.(test|prodtest|itest)\.mjs$/.test(f))
  .map((f) => `scripts/tests/${f}`);

const breaks = [];
const sourceOnly = [];
let weakTotal = 0;

for (const file of files) {
  const src = readFileSync(file, "utf8");
  const rendersText = RENDERS.test(stripComments(src));
  const hits = [];
  const literals = candidateLiterals(src);
  const strippedSrc = candidateLiterals.lastStripped;
  for (const lit of literals) {
    const norm = stripIcu(lit.text);
    if (norm.length < 6) continue;
    let key = stripped.has(norm) ? norm : null;
    if (!key) {
      // A literal that is a PHRASE INSIDE a longer rendered string — the
      // commonest real shape, because a gate asserts on the stable part
      // of a sentence rather than the whole of it.
      for (const [value] of stripped) {
        if (value.length > norm.length && value.includes(norm) && norm.includes(" ")) { key = value; break; }
      }
    }
    if (!key) continue;
    // STRONG vs WEAK, and this split is the whole precision story.
    //
    // A single lowercase English word collides with everything a codebase
    // is already full of: "delete" is an HTTP method, "billing" a URL
    // segment, "queued"/"running"/"failed" are database status values,
    // "select" is a DOM call, "description" a column name. Every one of
    // those matched a value in en.json on the first run and not one was a
    // gate reading a rendered label.
    //
    // What does NOT collide is a PHRASE ("Upgrade Required", "No credit
    // activity yet") or a capitalised multi-character label that a schema
    // would not spell that way ("Succeeded"). So a hit is STRONG when it
    // has a space, or is >= 8 characters and carries an interior capital
    // or leading capital that a slug/enum/verb would not.
    // LOUD or VACUOUS, and the second is the dangerous one.
    //
    // A POSITIVE assertion — body.includes("Upgrade Required") — fails in
    // Greek. That is bad, and it is visible: somebody sees red and fixes
    // it.
    //
    // A NEGATIVE one — !/0 credits/.test(text), !/not available/.test(h)
    // — PASSES in Greek, because the English string it forbids is never
    // there. The gate goes green having measured nothing at all, which is
    // the same failure as an empty scraper in db-migrations: the shape of
    // a check with none of the effect.
    const before = strippedSrc.slice(Math.max(0, (lit.at ?? 0) - 40), lit.at ?? 0);
    const negated = /[!]\s*$|[!]\s*\/?[\w.$]*$/.test(before.replace(/\s+$/, "")) || /\btrue\s*!==|!==\s*true/.test(before);
    const words = lit.text.trim().split(/\s+/).length;
    const capitalised = /^[A-Z]/.test(lit.text.trim()) && lit.text.trim().length >= 8;
    const strong = words >= 2 || capitalised;
    hits.push({ literal: lit.text, kind: lit.kind, messageKey: stripped.get(key), strong, negated });
  }
  if (!hits.length) continue;
  const seen = new Set();
  const unique = hits.filter((h) => !seen.has(h.literal) && seen.add(h.literal));
  const strongHits = unique.filter((h) => h.strong);
  weakTotal += unique.length - strongHits.length;
  if (!strongHits.length) continue;
  (rendersText ? breaks : sourceOnly).push({ file, hits: strongHits });
}

console.log("GATES ANCHORED ON ENGLISH THE USER SEES\n");
console.log(`scanned ${files.length} gate files against ${stripped.size} rendered strings in ${MESSAGES}\n`);

console.log(`== BREAKS IF THE UI IS NOT ENGLISH (${breaks.length} file(s)) ==`);
console.log("   these read text a browser rendered and compare it to an English literal\n");
for (const b of breaks) {
  console.log(`  ${b.file}`);
  for (const h of b.hits.slice(0, 6)) {
    const fate = h.negated ? "PASSES, measuring nothing" : "FAILS on a working product";
    console.log(`      ${h.kind === "regex" ? "/" + h.literal + "/" : JSON.stringify(h.literal)}  <- ${h.messageKey}`);
    console.log(`          in Greek/Arabic/Chinese: ${fate}`);
  }
  if (b.hits.length > 6) console.log(`      ... and ${b.hits.length - 6} more`);
}

console.log(`\n== SOURCE-ONLY (${sourceOnly.length} file(s)) ==`);
console.log("   assert English against a source file or en.json itself — legitimate,");
console.log("   listed so a later rendered-text read is visible as a change\n");
for (const s of sourceOnly.slice(0, 12)) {
  console.log(`  ${s.file}  (${s.hits.length} literal(s))  e.g. ${JSON.stringify(s.hits[0].literal)}`);
}
if (sourceOnly.length > 12) console.log(`  ... and ${sourceOnly.length - 12} more`);

console.log(
  `\n${breaks.length} file(s) would fail against a Greek, Arabic or Chinese UI; ` +
    `${sourceOnly.length} assert English against source only.`
);
console.log(
  "Each hit is a literal that is PROVABLY user-visible: it matches a value in\n" +
    "messages/en.json, which has nine other spellings. Reports; does not gate."
);
console.log(
  `\n${weakTotal} single-word match(es) were DISCARDED as collisions — "delete" the\n` +
    "HTTP method, \"billing\" the URL segment, \"queued\" the database status. They are\n" +
    "not counted above and not findings; see the STRONG/WEAK note in the source."
);
