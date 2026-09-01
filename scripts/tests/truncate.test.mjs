// SEVEN TRUNCATORS, THREE ANSWERS, AND SIX BROKE THEIR OWN CONTRACT.
//
// Found by scanning for the BEHAVIOUR — a slice with an ellipsis — not
// for a name: they were called clamp, clampOneLine, truncate, excerpt,
// cleanText, clip and autoTitleFromMessage. The same shape as the eleven
// HTML escapers, and with an actual defect rather than a latent one.
//
//   max=10  ->  "hello wor…"  (five of them)   "hello worl…"  (two)
//   max=0   ->  "hello world this is lon…"     ""             "…"
//
// `slice(0, max - 1)` with max = 0 is `slice(0, -1)`, and a negative end
// index counts FROM THE END. Four implementations returned a
// twenty-four character string when asked for zero.
//
// Run: node scripts/tests/truncate.test.mjs
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

let pass = 0;
const failures = [];
function check(name, cond, detail) {
  if (cond) { pass++; console.log(`  PASS  ${name}`); }
  else { failures.push(name); console.log(`  FAIL  ${name}${detail !== undefined ? "\n        " + detail : ""}`); }
}
const { loadTs } = await import("./load-ts.mjs");
const { stripComments } = await import("../check-mutation-markers.mjs");
const { truncate, ELLIPSIS } = await loadTs("src/lib/text/truncate.ts");

// ---------------------------------------------------------------------
console.log("== 1. the contract, across the whole range and not at two convenient points ==");
// EVERY max FROM 0 TO 40, against inputs of every shape. The old copies
// were correct at 10 and wrong at 0 and 1; a test that checked 10 would
// have passed on all seven.
const INPUTS = [
  "hello world this is long",
  "  padded  ",
  "a b   c",
  "exactly-ten",
  "",
  "Γιάννης — ένα ελληνικό κείμενο",
  "北京市朝阳区的一个地址",
  "مرحبا بالعالم هذا نص عربي",
];
const over = [];
for (const input of INPUTS) {
  for (let max = 0; max <= 40; max++) {
    const out = truncate(input, max);
    if (out.length > max) over.push(`${JSON.stringify(input)} max=${max} -> ${JSON.stringify(out)} (${out.length})`);
  }
}
check(`never longer than max (${INPUTS.length} inputs × 41 lengths)`, over.length === 0, over.slice(0, 4).join("\n        "));

check("max=0 is empty, not the string minus its last character",
  truncate("hello world this is long", 0) === "");
check("max=1 is the ellipsis alone", truncate("hello", 1) === ELLIPSIS);
check("a string that fits is returned whole", truncate("short", 20) === "short");
check("...and trimmed", truncate("  short  ", 20) === "short");
check("exactly max is not cut", truncate("abcde", 5) === "abcde");
check("one over max is cut to max", truncate("abcdef", 5) === "abcd…" && truncate("abcdef", 5).length === 5);
check("a cut never lands on a space", !/\s…$/.test(truncate("hello world", 7)), truncate("hello world", 7));
check("collapseWhitespace is a CHOICE, and off by default",
  truncate("a b   c", 20) === "a b   c" && truncate("a b   c", 20, { collapseWhitespace: true }) === "a b c");
check("a non-string is empty, not a crash", truncate(null, 10) === "" && truncate(42, 10) === "");
check("a nonsense max is empty, not a slice from the end",
  truncate("hello", NaN) === "" && truncate("hello", -5) === "");
check("the ellipsis is ONE code point, not three dots", ELLIPSIS.length === 1);

// ---------------------------------------------------------------------
console.log("\n== 2. and nothing keeps its own ==");
const files = [];
(function walk(d) {
  for (const e of readdirSync(d)) {
    const p = join(d, e);
    if (statSync(p).isDirectory()) walk(p);
    else if (/\.tsx?$/.test(e)) files.push(p);
  }
})("src");
check(`the scan read the source (${files.length})`, files.length >= 500, String(files.length));

// THE BEHAVIOUR, NOT THE NAME. This is the check that would have found
// the original seven: a slice whose end is `max - 1` beside an ellipsis.
const rivals = [];
for (const f of files) {
  if (f === "src/lib/text/truncate.ts") continue;
  const src = stripComments(readFileSync(f, "utf8"));
  for (const m of src.matchAll(/\.slice\(\s*0\s*,\s*([A-Za-z_$][\w$.]*)\s*-\s*1\s*\)/g)) {
    const around = src.slice(Math.max(0, m.index - 120), m.index + 160);
    if (/…|\.\.\./.test(around)) rivals.push(`${f}: ${m[0]} beside an ellipsis`);
  }
}
check("no file cuts with slice(0, n - 1) and an ellipsis of its own", rivals.length === 0, rivals.join("\n        "));

const users = files.filter((f) => f !== "src/lib/text/truncate.ts" && /from "@\/lib\/text\/truncate"/.test(readFileSync(f, "utf8")));
check(`files that import the shared truncator (${users.length})`, users.length >= 4, users.join(", "));

console.log("");
if (failures.length > 0) {
  console.log(`${pass} passed, ${failures.length} FAILED:`);
  for (const f of failures) console.log(`  - ${f}`);
  process.exit(1);
}
console.log(`${pass} checks passed. One truncator, and it never exceeds max.`);
