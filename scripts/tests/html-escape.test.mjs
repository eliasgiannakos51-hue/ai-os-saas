// ELEVEN ESCAPERS, SEVEN OF THEM WEAKER, NONE OF THEM WRONG YET.
//
// Measured across src/ during the V4.6 audit. The count started at EIGHT
// — that is what a grep for `function escapeHtml` found — and the first
// run of this gate found three more, named escapeAttr and escapeText,
// two of them writing into a published customer page's attributes. The
// gate correcting the number that justified writing it is the reason to
// scan by BEHAVIOUR rather than by the name somebody chose.
//
//   4 escaped  & < > " '     the complete set
//   3 escaped  & < > "       missing the apostrophe
//   3 escaped  & " < >       the seo/ pair, missing the apostrophe
//   1 escaped  & < >         missing both quotes
//
// Not one was exploitable, and that is exactly why it is worth a gate.
// They were safe because every call site happens to interpolate into text
// content or a DOUBLE-quoted attribute — a property of eight files that
// nothing stated and nothing checked. Copy the four-character version
// into a template using href='...' and it is an injection, with no diff
// anywhere that looks wrong.
//
// Same shape, and the same failure mode, as the fourteen copies of the
// Resend sender address: it fails OPEN. A weaker escaper does not throw
// and does not warn; it produces correct-looking output until the one
// input that matters.
//
// Run: node scripts/tests/html-escape.test.mjs
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

let pass = 0;
const failures = [];
function check(name, cond, detail) {
  if (cond) {
    pass++;
    console.log(`  PASS  ${name}`);
  } else {
    failures.push(name);
    console.log(`  FAIL  ${name}${detail !== undefined ? "\n        " + detail : ""}`);
  }
}
const { loadTs } = await import("./load-ts.mjs");
const { stripComments } = await import("../check-mutation-markers.mjs");
const esc = await loadTs("src/lib/html-escape.ts");

// ---------------------------------------------------------------------
console.log("== 1. it escapes all five, RUN not read ==");
for (const [raw, want, why] of [
  ["&", "&amp;", "ampersand first, or every other entity is double-escaped"],
  ["<", "&lt;", "opens a tag"],
  [">", "&gt;", "closes one"],
  ['"', "&quot;", "breaks out of a double-quoted attribute"],
  ["'", "&#39;", "breaks out of a single-quoted attribute — the one three copies missed"],
]) {
  check(`${JSON.stringify(raw)} -> ${want}  (${why})`, esc.escapeHtml(raw) === want, esc.escapeHtml(raw));
}
// THE ORDER MATTERS AND IS EASY TO GET WRONG: escaping & last turns
// "&lt;" into "&amp;lt;".
check("the ampersand is escaped FIRST", esc.escapeHtml("<") === "&lt;" && esc.escapeHtml("&lt;") === "&amp;lt;");

// The real payloads, in both attribute quote styles.
check(
  "a script tag cannot survive as text",
  esc.escapeHtml('<script>alert(1)</script>') === "&lt;script&gt;alert(1)&lt;/script&gt;"
);
check(
  "a double-quoted attribute cannot be broken out of",
  !esc.escapeHtml('" onerror="alert(1)').includes('"')
);
check(
  "nor a single-quoted one",
  !esc.escapeHtml("' onerror='alert(1)").includes("'")
);
check("ordinary text is untouched", esc.escapeHtml("Γιάννης — 北京 — مرحبا") === "Γιάννης — 北京 — مرحبا");
check("a non-string does not throw", esc.escapeHtml(42) === "42");

// ---------------------------------------------------------------------
console.log("\n== 2. the narrow one is an exception with a name, not a shorter copy ==");
check("Telegram's escaper handles the three its API names",
  esc.escapeTelegramHtml("<b>&</b>") === "&lt;b&gt;&amp;&lt;/b&gt;");
// NOT A BUG. Telegram's HTML parse mode is not HTML: sending &quot; risks
// the entity reaching the reader as literal text in a chat message.
check("...and deliberately leaves quotes alone", esc.escapeTelegramHtml(`"'`) === `"'`);

// ---------------------------------------------------------------------
console.log("\n== 3. and nothing keeps its own ==");
const files = [];
(function walk(d) {
  for (const e of readdirSync(d)) {
    const p = join(d, e);
    if (statSync(p).isDirectory()) walk(p);
    else if (/\.tsx?$/.test(e)) files.push(p);
  }
})("src");
check(`the scan read the source (${files.length} files)`, files.length >= 500, String(files.length));

const local = [];
const narrowUsers = [];
for (const f of files) {
  if (f === "src/lib/html-escape.ts") continue;
  const src = stripComments(readFileSync(f, "utf8"));
  if (/\b(?:function|const)\s+(?:escapeHtml|htmlEscape|escapeAttr)\b/.test(src)) local.push(f);
  if (/\bescapeTelegramHtml\s*\(/.test(src)) narrowUsers.push(f);
}
check("no file defines its own HTML escaper", local.length === 0, local.join(", "));
check(
  "the narrow escaper is used only where its exception was argued",
  narrowUsers.every((f) => f === "src/lib/notify/channels/telegram.ts"),
  narrowUsers.join(", ")
);
check("...and it IS used there", narrowUsers.includes("src/lib/notify/channels/telegram.ts"));

// A FLOOR on the users of the real one, so "nobody defines their own" is
// not trivially true of a codebase that escapes nothing.
const users = files.filter(
  (f) => f !== "src/lib/html-escape.ts" && /from "@\/lib\/html-escape"/.test(readFileSync(f, "utf8"))
);
check(`files that import the shared escaper (${users.length})`, users.length >= 7, users.join(", "));

// ---------------------------------------------------------------------
console.log("\n== 4. the third-party text that reaches a published page ==");
// The photographer's display name comes from Unsplash and lands in the
// HTML of a customer's public website. It is the one escaped string in
// this product that a stranger writes.
const ph = await loadTs("src/lib/website-image-placeholders.ts");
const credit = ph.buildUnsplashCreditHtml({
  url: "https://images.unsplash.com/x",
  photographerName: '<script>alert(1)</script>',
  photographerUrl: 'https://unsplash.com/@x"onmouseover="alert(1)',
  downloadLocation: "https://api.unsplash.com/x",
  alt: "x",
});
check("a photographer named <script> does not become one", !credit.includes("<script>"), credit.slice(0, 120));
check("...and a quote in their profile URL cannot open an attribute",
  !/href="[^"]*"[a-z]/i.test(credit), credit.slice(0, 200));
check("the credit is still rendered", /Photo by/.test(credit) && /unsplash-credit/.test(credit));

console.log("");
if (failures.length > 0) {
  console.log(`${pass} passed, ${failures.length} FAILED:`);
  for (const f of failures) console.log(`  - ${f}`);
  process.exit(1);
}
console.log(`${pass} checks passed. One escaper, one argued exception.`);
