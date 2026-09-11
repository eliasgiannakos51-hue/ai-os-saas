// A WORD BOUNDARY MAY NOT TOUCH A SENTENCE SOMEBODY WROTE.
//
// `\b` is defined against [A-Za-z0-9_]. Greek, Arabic, Chinese, Cyrillic
// and Hebrew letters are all NON-word characters to it, and the `u` flag
// does not help: it is the BOUNDARY that is ASCII, not the pattern. The
// failure is silent — no throw, no warning, one language simply stops
// matching.
//
// WHY THIS FILE EXISTS BESIDE ascii-boundaries.test.mjs. That gate asks
// whether a boundary sits next to a NON-ASCII LITERAL — `\bπροτείνω\b` —
// which is the version of the mistake somebody makes while looking at the
// Greek word. It cannot tell a correct `<img\b` from a wrong `\bonly\b`,
// because both patterns are pure ASCII; the difference is not in the
// pattern at all, it is in WHAT THE PATTERN IS APPLIED TO. 126 lines in
// src/ carry a boundary and the great majority of them are right.
//
// SO THE RULE IS NARROWED UNTIL IT CAN BE ENFORCED:
//
//   1. Find every regex APPLIED to a value whose name says it holds text
//      a person or a model wrote. Measured by section 2, which prints both
//      halves: 162 of 379 regex applications in src/.
//   2. Of those, the ones whose pattern carries \b or \B are the set that
//      has to be DECLARED. 27 today; 29 before the two fixes below.
//   3. A declaration is a `// BOUNDARY-FORMAT: <format>` line near the top
//      of the file, naming the machine format the file parses.
//   4. AND THE DECLARATION IS CHECKED, not taken. The pattern must carry
//      no non-ASCII letter and must contain a token of that format —
//      `<`, `>`, `=`, an escaped `/`, or `\d`. A pattern matching a bare
//      word cannot satisfy that, so a boundary on prose CANNOT BE
//      DECLARED AT ALL. It has to be fixed.
//
// WHAT THAT SEPARATED, ON THE DAY IT WAS WRITTEN: 27 of the 29 were tag
// names, attribute names, PDF object headers and OOXML elements — ASCII
// by their own specifications, where the boundary is what stops `<a`
// matching `<article`. The two that were left are the two that were
// wrong:
//
//   · lib/agents/agent-config.ts — `/^NO_RESULT\b/i` on MODEL OUTPUT.
//     "NO_RESULTS" did not match and "NO_RESULTΣ" did.
//   · lib/health/classify.ts — `/\bjwt\b/i` on a PROVIDER'S ERROR TEXT.
//     "jwtToken" did not match and "jwtΤΟΚΕΝ" did.
//
// Both now use a Unicode-aware lookahead, and both are measured in
// section 1 rather than asserted.
//
// WHAT THIS CANNOT DO, said before somebody trusts it further than it
// goes. "A value a person or a model wrote" is decided from the NAME of
// the variable. That is a heuristic: it will miss a regex applied to
// something called `s`, and it will flag one applied to markup this
// project generated itself. Section 2 prints both numbers so the
// precision is visible, and the declaration is what makes a false
// positive cheap — one line, naming the format — rather than a reason to
// switch the check off.
//
// Run: node scripts/tests/untrusted-boundaries.test.mjs
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

// ---------------------------------------------------------------------
console.log("== 1. the property, and the two sites that had it ==");
// ---------------------------------------------------------------------
// NOT A BELIEF. Every claim this file makes about \b is run.
check("a boundary around a Greek word matches nothing", !/\bπροτείνω\b/u.test("θα προτείνω κάτι"));
check("...while the same word without one matches", /προτείνω/u.test("θα προτείνω κάτι"));
{
  // THE SENTINEL A MODEL IS ASKED TO EMIT. The old pattern answered by
  // the SCRIPT of the next character, which nobody chose.
  const oldWay = /^NO_RESULT\b/i;
  const nowWay = /^NO_RESULT(?![\p{L}\p{N}])/iu;
  check("the old sentinel test refused a Latin suffix", !oldWay.test("NO_RESULTS"));
  check("...and accepted a Greek one", oldWay.test("NO_RESULTΣ"));
  check("the fixed one refuses both", !nowWay.test("NO_RESULTS") && !nowWay.test("NO_RESULTΣ"));
  check("...and still accepts the token itself", nowWay.test("NO_RESULT") && nowWay.test("NO_RESULT — nothing to report"));
  const cfg = readFileSync("src/lib/agents/agent-config.ts", "utf8");
  check("and the shipped file carries the fixed form", /\^NO_RESULT\(\?!\[\\p\{L\}\\p\{N\}\]\)/.test(cfg));
}
{
  // A PROVIDER'S OWN ERROR TEXT, which this project does not write.
  const oldWay = /\bjwt\b/i;
  const nowWay = /(?<![\p{L}\p{N}])jwt(?![\p{L}\p{N}])/iu;
  check("the old jwt test refused a Latin suffix", !oldWay.test("jwtToken"));
  check("...and accepted a Greek one", oldWay.test("jwtΤΟΚΕΝ"));
  check("the fixed one refuses both", !nowWay.test("jwtToken") && !nowWay.test("jwtΤΟΚΕΝ"));
  check("...and still finds the word in a Greek sentence", nowWay.test("Το jwt δεν είναι έγκυρο"));
  const cls = readFileSync("src/lib/health/classify.ts", "utf8");
  check("and the shipped file carries the fixed form", /\(\?<!\[\\p\{L\}\\p\{N\}\]\)jwt/.test(cls));
}

// ---------------------------------------------------------------------
console.log("\n== 2. the population, and how much of it this rule touches ==");
// ---------------------------------------------------------------------
const walk = (d) =>
  readdirSync(d).flatMap((e) => {
    const p = join(d, e);
    return statSync(p).isDirectory() ? walk(p) : /\.tsx?$/.test(p) ? [p] : [];
  });
const stripComments = (s) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

/**
 * A regex being APPLIED to something, in the four shapes this codebase
 * writes. Group order differs per shape, so each carries which capture is
 * the subject and which is the pattern.
 */
const APPLICATIONS = [
  { re: /\b([A-Za-z_$][\w$.?]*)\s*\.\s*(?:match|matchAll|replace|replaceAll|split|search)\s*\(\s*(\/(?:[^/\\\n[]|\\.|\[(?:[^\]\\]|\\.)*\])+\/[gimsuyv]*)/g, subject: 1, pattern: 2 },
  { re: /(\/(?:[^/\\\n[]|\\.|\[(?:[^\]\\]|\\.)*\])+\/[gimsuyv]*)\s*\.\s*(?:test|exec)\s*\(\s*([A-Za-z_$][\w$.?]*)/g, subject: 2, pattern: 1 },
];

/** Names that say a value holds text a person or a model wrote. */
const UNTRUSTED_NAME =
  /(query|prompt|message|msg|text|brief|answer|reply|response|content|input|body|html|description|title|caption|note|comment|transcript|word|term|phrase|search|raw|value|str|name|label|instruction|output|completion)/i;

const applications = [];
for (const file of walk("src")) {
  const code = stripComments(readFileSync(file, "utf8"));
  code.split("\n").forEach((line, i) => {
    for (const { re, subject, pattern } of APPLICATIONS) {
      re.lastIndex = 0;
      let m;
      while ((m = re.exec(line))) {
        applications.push({ file, line: i + 1, subject: m[subject], pattern: m[pattern], text: line.trim() });
      }
    }
  });
}
// FLOORS ON THE SCAN, not on the finding. "nothing violates the rule" is
// trivially true of a walk that read no files, which is the shape
// gate-vacuity.test.mjs refuses.
check(`the scan found regex applications (${applications.length})`, applications.length >= 300, String(applications.length));
const untrusted = applications.filter((a) => UNTRUSTED_NAME.test(a.subject));
check(
  `...of which the subject looks like text somebody wrote (${untrusted.length} of ${applications.length})`,
  untrusted.length >= 100,
  String(untrusted.length)
);
const bounded = untrusted.filter((a) => /\\b|\\B/.test(a.pattern));
console.log(`        ${bounded.length} of those carry an ASCII word boundary — the set this rule governs`);
check(`the governed set is not empty (${bounded.length})`, bounded.length >= 10, String(bounded.length));

// ---------------------------------------------------------------------
console.log("\n== 3. every one of them is declared, and the declaration is checked ==");
// ---------------------------------------------------------------------
const FORMATS = ["html", "xml", "pdf", "csv", "json", "sql", "http", "code"];
/** The format a file declares near its top, or null. */
export function declaredFormat(src) {
  const head = src.split("\n").slice(0, 40).join("\n");
  const m = head.match(/^\s*\/\/\s*BOUNDARY-FORMAT:\s*([a-z]+)\s*$/m);
  return m ? m[1] : null;
}
/**
 * Is this pattern syntax of a machine format rather than a bare word?
 *
 * A tag name, an attribute, a PDF object header and an OOXML element all
 * carry one of these; `\bjwt\b` and `^NO_RESULT\b` carry none. Measured on
 * the 29-site population the day this was written: it admitted 27 and
 * refused exactly the two that were wrong.
 */
export function looksLikeFormat(pattern) {
  return /[<>=]|\\\/|\\d/.test(pattern);
}
export const hasNonAsciiLetter = (pattern) => /[^\x00-\x7F]/.test(pattern);

{
  const undeclared = [];
  const misdeclared = [];
  const byFile = new Map();
  for (const a of bounded) {
    if (!byFile.has(a.file)) byFile.set(a.file, declaredFormat(readFileSync(a.file, "utf8")));
    const fmt = byFile.get(a.file);
    if (!fmt) {
      undeclared.push(`${a.file}:${a.line}  ${a.text.slice(0, 90)}`);
      continue;
    }
    if (!FORMATS.includes(fmt)) misdeclared.push(`${a.file}: "${fmt}" is not one of ${FORMATS.join(", ")}`);
    else if (hasNonAsciiLetter(a.pattern)) misdeclared.push(`${a.file}:${a.line} declares ${fmt} but the pattern has a non-ASCII letter`);
    else if (!looksLikeFormat(a.pattern)) misdeclared.push(`${a.file}:${a.line} declares ${fmt} but ${a.pattern} matches a bare word, not ${fmt} syntax`);
  }
  check(
    `every boundary applied to written text is declared (${bounded.length} sites, ${new Set(bounded.map((b) => b.file)).size} files)`,
    undeclared.length === 0,
    undeclared.join("\n        ")
  );
  check(
    "...and every declaration matches the pattern it covers",
    misdeclared.length === 0,
    misdeclared.join("\n        ")
  );
}

// ---------------------------------------------------------------------
console.log("\n== 4. and a declaration cannot outlive what it declared ==");
// ---------------------------------------------------------------------
// BOTH WAYS. A file that keeps `BOUNDARY-FORMAT` after its last boundary
// is gone is a sentence about nothing, and the next boundary added to
// that file is then waved through by a declaration nobody re-argued.
{
  const declaredFiles = walk("src").filter((f) => declaredFormat(readFileSync(f, "utf8")));
  check(`the declarations were found (${declaredFiles.length})`, declaredFiles.length >= 5, String(declaredFiles.length));
  const withBoundary = new Set(bounded.map((b) => b.file));
  const orphans = declaredFiles.filter((f) => !withBoundary.has(f));
  check("no declaration is left behind after its last boundary", orphans.length === 0, orphans.join(", "));
}

// ---------------------------------------------------------------------
console.log("\n== 5. the three readers, on text whose answer is known ==");
// ---------------------------------------------------------------------
// EVERY NUMBER ABOVE COMES FROM A REGEX. One that stopped matching would
// report a smaller population and a clean result, which is the failure
// this whole file is about, one level up.
{
  check("a declaration is read", declaredFormat("// BOUNDARY-FORMAT: html\nconst x = 1;") === "html");
  check("...only near the top", declaredFormat("\n".repeat(60) + "// BOUNDARY-FORMAT: html") === null);
  check("...and not from a sentence that merely mentions it", declaredFormat("// see BOUNDARY-FORMAT: html above") === null);
  check("a tag pattern is format syntax", looksLikeFormat("<a\\b[^>]*>"));
  check("an attribute pattern is too", looksLikeFormat("\\bid\\s*=\\s*\"([^\"]+)\""));
  check("a PDF object reference is too", looksLikeFormat("(\\d{1,10})\\s+\\d{1,5}\\s+R\\b"));
  check("a PDF type key is too", looksLikeFormat("\\/Type\\s*\\/Page\\b"));
  check("a bare word is NOT", !looksLikeFormat("\\bjwt\\b|api key|unauthorized"));
  check("...nor is a sentinel", !looksLikeFormat("^NO_RESULT\\b"));
  check("a Greek literal is caught", hasNonAsciiLetter("\\bπροτείνω\\b"));
  check("...and an ASCII one is not", !hasNonAsciiLetter("<img\\b"));
  // The application reader itself, on the four shapes it must find.
  const fixture = [
    'if (/^A\\b/.test(text)) return 1;',
    'const out = html.replace(/<a\\b/g, "");',
    'for (const m of body.matchAll(/<t\\b/g)) void m;',
    'const n = value.split(/\\s+/);',
  ].join("\n");
  const found = [];
  fixture.split("\n").forEach((line) => {
    for (const { re, subject, pattern } of APPLICATIONS) {
      re.lastIndex = 0;
      let m;
      while ((m = re.exec(line))) found.push({ subject: m[subject], pattern: m[pattern] });
    }
  });
  check(`the application reader finds all four shapes (${found.length})`, found.length === 4, JSON.stringify(found));
  check("...and names the subject, not the pattern", found.every((f) => /^(text|html|body|value)$/.test(f.subject)), JSON.stringify(found.map((f) => f.subject)));
}

console.log(`\n${failures.length === 0 ? "ALL PASS" : "FAILURES"}: ${pass} passed, ${failures.length} failed`);
if (failures.length) {
  for (const f of failures) console.log(`  - ${f}`);
  process.exit(1);
}
