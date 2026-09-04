// \b IS ASCII, AND FOUR FEATURES HAVE ALREADY BROKEN ON IT.
//
// JavaScript's word boundary is defined against [A-Za-z0-9_]. Greek,
// Arabic, Chinese, Cyrillic and Hebrew letters are all NON-word
// characters to it, so `\bπροτείνω\b` never matches — and the `u` flag
// does not help, because it is the BOUNDARY that is ASCII, not the
// pattern. A regex written this way does not throw and does not warn: it
// simply matches nothing, in one language, silently.
//
// THE SCAN, AND ITS HONEST NUMBERS. 128 lines in src/ contain `\b`:
//
//   83  MARKUP        `<img\b`, `<\/?${tag}\b`, `\bhref\s*=` — a tag or
//                     attribute name, ASCII by the HTML and XML specs.
//                     Correct, and would be wrong WITHOUT the boundary.
//   26  ASCII DOMAIN  PDF object headers, xlsx cell refs, secret prefixes,
//                     ISO timestamps, source-code keyword detection. The
//                     text really is ASCII.
//   19  TEXT          the only ones where a human's words reach the
//                     pattern, and only 14 of those after five more turn
//                     out to be attribute matching too.
//
// WHAT THE FOURTEEN TURNED OUT TO BE:
//
//   · lib/trading/conduct.ts (8) — the advice filter. ALREADY CORRECT and
//     documented: its Greek patterns carry no boundaries and are written
//     folded, found by trading-journal.test.mjs in an earlier round. What
//     was NOT true is the paragraph above them claiming the filter runs on
//     model output — nothing in the trading feature calls a model at all,
//     which trading-journal.test.mjs now pins.
//   · lib/trading/rules.ts (1) — bilingual by hand: `/\bonly\b/` OR
//     `folded.includes("μονο")`. The fix existed in the one place somebody
//     had hit it.
//   · lib/website-image-placeholders.ts (1) — LOGO_QUERY, and the one this
//     scan actually found. See section 2.
//   · lib/website-negative-instructions.ts (1) — booking-widget words.
//     Section 3.
//   · components/settings/credit-history.tsx (2) — capitalising
//     `website_generate`. A machine string, ASCII by construction.
//   · lib/health/classify.ts (1) — matching a provider's own English
//     error text.
//
// Run: node scripts/tests/ascii-boundaries.test.mjs
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { loadTs } from "./load-ts.mjs";

let pass = 0;
const failures = [];
function check(name, cond, detail) {
  if (cond) {
    pass++;
    console.log(`  PASS  ${name}`);
  } else {
    failures.push(name);
    console.log(`  FAIL  ${name}${detail !== undefined ? `\n        ${detail}` : ""}`);
  }
}

// ---------------------------------------------------------------------
console.log("== 1. the property itself, so nothing below rests on a belief ==");
// If this ever stops being true, every conclusion in this file changes.
check("\\b does not see a Greek letter as a word character", !/\bπροτεινω\b/.test("σου προτεινω κατι"));
check("...not even with the u flag", !/\bπροτεινω\b/u.test("σου προτεινω κατι"));
check("...and the same for Arabic", !/\bمرحبا\b/u.test("قال مرحبا لهم"));
check("...and Chinese", !/\b总收入\b/u.test("这是 总收入 数字"));
check("a boundary-free pattern does match", /προτεινω/.test("σου προτεινω κατι"));
check("...and \\b is correct for ASCII, which is why it is not banned", /\bonly\b/.test("only london"));

// ---------------------------------------------------------------------
console.log("\n== 2. a logo placeholder written in Greek is not published as a brand ==");
// LOGO_QUERY is `/\b(logo|logotype|…)\b/i`. A generated Greek site whose
// model wrote `data-image-query="λογότυπο"` does not match it, so the
// placeholder is not recognised as a logo, goes to the stock-photo
// library, and whatever comes back is published as the business's own
// mark — "a wrong logo is a wrong identity", which is the reported bug
// that guard exists for.
//
// The fix is not more words in more languages: the prompt already REQUIRES
// the query to be English (rule 23 — an instruction the model can ignore),
// so the check is whether it obeyed.
const placeholders = await loadTs("src/lib/website-image-placeholders.ts");
const { isLogoLikeQuery, isNonLatinQuery } = placeholders;

check("an English logo query is caught, as before", isLogoLikeQuery("company logo"));
check("...and a photo query is not", !isLogoLikeQuery("bakery interior with bread"));
check(
  "a Greek logo query is NOT caught by the English pattern — the defect, stated",
  !isLogoLikeQuery("λογότυπο της εταιρείας")
);
check("...but it is unsearchable, which is what removes it", isNonLatinQuery("λογότυπο της εταιρείας"));

console.log("\n== 2b. and 'not English' is not 'not ASCII' ==");
// A query with an accent is still an English query. Getting this wrong
// would strip half the legitimate photos on a European site.
for (const q of ["café interior", "Zürich rooftop terrace", "jalapeño peppers close up", "naïve art gallery"]) {
  check(`"${q}" survives`, !isNonLatinQuery(q));
}
for (const q of ["καφετέρια εσωτερικό", "喫茶店の内装", "مقهى من الداخل", "кофейня внутри", "בית קפה"]) {
  check(`"${q}" is unsearchable`, isNonLatinQuery(q));
}
check("an empty query is not non-Latin", !isNonLatinQuery(""));
check("digits and punctuation alone are not non-Latin", !isNonLatinQuery("3 x 4 — 2026 (v2)"));
check("one non-Latin letter in an otherwise English phrase is enough", isNonLatinQuery("bakery λ interior"));

const resolver = readFileSync("src/lib/website-image-resolver.ts", "utf8");
check(
  "the resolver strips an unsearchable query instead of searching with it",
  /isLogoLikeQuery\(p\.query\) \|\| isNonLatinQuery\(p\.query\)/.test(resolver)
);
check(
  "...and says which of the two reasons it was",
  /not written in Latin script/.test(resolver)
);

// ---------------------------------------------------------------------
console.log("\n== 3. the scan's own population, so the numbers above stay checkable ==");
function walk(dir) {
  const out = [];
  for (const e of readdirSync(dir)) {
    const p = join(dir, e);
    if (statSync(p).isDirectory()) out.push(...walk(p));
    else if (/\.tsx?$/.test(p)) out.push(p);
  }
  return out;
}
const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

// THE POPULATION FIRST, THEN THE FILTER OVER IT — and the floor on the
// population, not on the finding. gate-vacuity.test.mjs failed the first
// version of this section for exactly that: `suspect.length === 0` over a
// walk that could have found no files at all is a check that passes
// hardest when it is broken.
const boundaryLines = [];
for (const file of walk("src")) {
  const code = strip(readFileSync(file, "utf8"));
  code.split("\n").forEach((line, i) => {
    if (/\\b/.test(line)) boundaryLines.push({ file, line: i + 1, text: line });
  });
}
check(`the scan found the population (${boundaryLines.length} lines with a word boundary)`,
  boundaryLines.length >= 100, String(boundaryLines.length));

// A `\b` beside a NON-ASCII literal in the same pattern is the shape that
// silently matches nothing. This is the check that would have caught the
// Greek advice patterns before somebody wrote them correctly by hand.
const suspect = boundaryLines
  // Non-ASCII letters on the same line as a word boundary.
  .filter((l) => /[^\x00-\x7F]/.test(l.text))
  // A boundary next to Latin text and a non-Latin literal elsewhere on the
  // line is fine — `/\bonly\b/.test(x) || x.includes("μονο")` is the
  // correct bilingual shape, and the OR is what says so.
  .filter((l) => !/\|\||\bincludes\(/.test(l.text))
  .map((l) => `${l.file}:${l.line}  ${l.text.trim().slice(0, 110)}`);
check(
  "no pattern puts an ASCII word boundary around non-ASCII text",
  suspect.length === 0,
  suspect.join("\n        ")
);

// ---------------------------------------------------------------------
console.log("\n== 4. the two places that got it right by hand stay right ==");
const rules = readFileSync("src/lib/trading/rules.ts", "utf8");
check(
  "the session rule matches Greek without a boundary",
  /\/\\bonly\\b\/\.test\(folded\) \|\| folded\.includes\("μονο"\)/.test(rules)
);
const conduct = strip(readFileSync("src/lib/trading/conduct.ts", "utf8"));
const greekPatternsWithBoundary = (conduct.match(/\/[^/\n]*\\b[^/\n]*[Ͱ-Ͽ][^/\n]*\//g) ?? []).filter(
  (p) => /\\b/.test(p)
);
check(
  "no Greek advice pattern carries a word boundary",
  greekPatternsWithBoundary.length === 0,
  greekPatternsWithBoundary.join(", ")
);

console.log(`\n${failures.length === 0 ? "ALL PASS" : "FAILED"}: ${pass} passed, ${failures.length} failed`);
if (failures.length > 0) process.exit(1);
