#!/usr/bin/env node
/*
 * WHICH CHECKS ASK WHAT *COULD* HAPPEN, WHEN THE QUESTION WAS WHAT *DID*?
 *
 * THE DEFECT THAT ASKED IT, on 2026-09-23. scan-estimate-realism.mjs
 * compared each billing profile's expected output against the `maxTokens`
 * CEILING of the call it estimates, and ranked by the ratio. It flagged
 * seven profiles; zero were real. Not because the arithmetic was wrong —
 * because a ceiling is a LIMIT AND NOT A PREDICTION. A call allowed 8,000
 * tokens usually writes a tenth of that, so every profile in the table was
 * "far under its ceiling", including the two the scan ranked safest. A
 * threshold on that ratio is not a line through the data; it is a line
 * under all of it. docs/shapes.md carries the account.
 *
 * So: how many OTHER checks in this repository are built the same way?
 *
 * ------------------------------------------------------------------
 * THE SHAPE, STATED SO IT CAN BE ARGUED WITH
 * ------------------------------------------------------------------
 *
 * A ceiling appearing in a comparison is not the defect. Three uses are
 * perfectly sound and the scan must not report them:
 *
 *   ENFORCEMENT   `if (bytes > MAX_MEETING_BYTES) reject(...)`
 *                 The constant IS the rule. Comparing to it is the
 *                 feature, not an inference about one.
 *
 *   THE DECLARATION ITSELF   a gate asserting `MARGIN_MULTIPLIER_MIN === 4`
 *                 The value is the subject. Nothing is being predicted.
 *
 *   MEASURED vs CEILING   a gate that RUNS something and checks the
 *                 result against the limit. The observation is real; the
 *                 ceiling is only the yardstick.
 *
 * The defect is the fourth: **a comparison in which BOTH SIDES ARE
 * DECLARED VALUES and a conclusion about behaviour is drawn from it.**
 * Nothing was run, nothing was measured, and the verdict is a statement
 * about what the system COULD do. That is the whole of what
 * scan-estimate-realism was: profile constant against ceiling constant,
 * concluding that a user would be under-charged.
 *
 * ------------------------------------------------------------------
 * HOW IT DECIDES, AND WHERE IT CANNOT
 * ------------------------------------------------------------------
 *
 * For every assertion in scripts/tests that names a ceiling-shaped
 * identifier, the scan asks what ELSE the assertion reads:
 *
 *   * a value produced by executing something in the same file
 *     (spawnSync/execFileSync/fetch/await import/a function call on a
 *     module under test) -> MEASURED, not reported
 *   * a value read off the tree or the database (readFileSync, psql,
 *     a query result) -> OBSERVED, not reported
 *   * only other declared constants and literals -> DECLARED vs DECLARED,
 *     reported
 *
 * IT REPORTS; IT DOES NOT GATE, and the reason is the same one that
 * killed the scan it was written about: the category it hunts is decided
 * by what a value MEANS, and this reads what a value is spelled. Its
 * precision is printed below from the run that was hand-settled, so a
 * reader knows what a finding is worth before spending a day on one.
 *
 * SETTLE A CANDIDATE BY MUTATING IT, NEVER BY READING IT — and mutate at
 * the CALL SITE, not the definition. Hand-checking
 * `presentationGenerate` by re-reading its profile reproduced the scan's
 * own assumption and read as confirmation; computing the estimate at the
 * input its route actually passes settled it in one line.
 *
 * Run: node scripts/scan-ceiling-vs-outcome.mjs
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { stripComments } from "./check-mutation-markers.mjs";

const ROOTS = ["scripts", "src"];

function walk(dir, out = []) {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) {
      // FIXTURES ARE NOT CODE AND NOT A GATE. scripts/tests/fixtures holds
      // one deliberate example of each rung this scan classifies,
      // including the shape it reports — walking it would make the scan
      // find the thing that proves it works, on every run, for ever.
      if (e.name === "node_modules" || e.name === ".next" || e.name === "fixtures") continue;
      walk(p, out);
    } else if (/\.(mjs|ts|tsx|js)$/.test(e.name)) out.push(p);
  }
  return out;
}

const files = ROOTS.flatMap((r) => {
  try {
    return statSync(r).isDirectory() ? walk(r) : [];
  } catch {
    return [];
  }
});

/**
 * A CEILING-SHAPED NAME. Deliberately narrow: `MAX_*`, `*_MAX`, `*_LIMIT`,
 * `*_CAP`, `*_CEILING`, and the two camelCase ones the vendor APIs force
 * on us (`maxTokens`, `maxDuration`).
 *
 * `MAX` MUST BE ALLOWED IN THE MIDDLE, and the first version did not
 * allow it. `\bMAX_[A-Z0-9_]+` never matches `PRESENTATION_MAX_TOKENS`,
 * because the character before MAX is an underscore and therefore not a
 * word boundary — so the scan could not see WEBSITE_MAX_TOKENS,
 * SYNTHESIS_MAX_TOKENS or POSTS_MAX_TOKENS, which are precisely the
 * ceilings the deleted scan was built on. It reported zero findings and
 * the zero was worth nothing.
 *
 * It was not found by reading the pattern. It was found by handing the
 * classifier a FIXTURE rebuilt from the deleted scan's own assertion and
 * requiring it to be caught — scripts/tests/ceiling-vs-outcome.test.mjs
 * section 3, which failed on the first run.
 *
 * `MIN_*` is NOT here and the omission is the point. A floor used as a
 * yardstick has the mirror-image problem, but this repository's floors are
 * business RULES that settlement applies — MARGIN_MULTIPLIER_MIN is
 * enforced, not predicted from — while its ceilings are vendor limits
 * nothing aims for. Widening the pattern to both found 3x the matches and
 * none of the extra ones were the shape.
 */
const CEILING_RE =
  /\b([A-Z0-9]+_)*MAX_[A-Z0-9_]+\b|\b[A-Z0-9_]+_(?:MAX|LIMIT|CAP|CEILING|BYTES|SECONDS)\b|\b(?:maxTokens|maxDuration|max_tokens)\b/;

/**
 * WHAT MAKES A LINE AN OBSERVATION. Each of these produces a value the
 * code did not write down: a process ran, a file was read, a server
 * answered, a function under test was called with real arguments.
 *
 * `estimateForAction` and `resolveMarginFor` are here on purpose even
 * though they are pure: they are the SUBJECT of the billing gates, and a
 * gate that calls one is measuring what the code does rather than
 * comparing two of its constants. The distinction the scan draws is
 * "did the assertion run the code" — not "did it touch the network".
 */
/**
 * THE FIRST VERSION NAMED THE OBSERVATIONS, AND THAT IS WHY IT FLAGGED
 * 151. It listed spawnSync, readFileSync, fetch and a handful of billing
 * functions — so `parseDeckToolInput(deck)` (the parser under test, run
 * with twenty-five slides to see it drop five) counted as declared, and
 * `routeConst("MAX_TOKENS")` (which READS THE ROUTE FILE) counted as
 * declared, and a ratchet comparing a counted population to its ceiling
 * counted as declared. Every one of those is a measurement.
 *
 * An allowlist of observations is a list that goes stale the first time
 * somebody writes a new one. The rule instead: **a condition that CALLS
 * anything has run something.** The assertion's own wrapper is excluded,
 * and so are the pure shape-tests of a literal (String, Number, Array,
 * Object, Boolean, JSON) which convert rather than produce.
 */
const CALLS_SOMETHING_RE =
  /(?<![.\w])(?!(?:check|ok|assert|expect|if|for|while|switch|catch|return|typeof|String|Number|Boolean|Array|Object|JSON|Math|console|log)\b)[A-Za-z_$][\w$]*\s*\(/;

/** A line that REJECTS or CLAMPS is enforcing the limit, not predicting. */
const ENFORCEMENT_RE =
  /\b(return|throw|reject|refus|clamp|Math\.min|Math\.max|status:\s*4\d\d|ok:\s*false|continue|break)\b/;

/**
 * An ASSERTION, in the three spellings this repository uses. A scan that
 * looked at every comparison would report the product's own `if`
 * statements, which are the enforcement case and the majority of matches.
 */
const ASSERT_RE = /\b(check|ok|assert|expect)\s*\(/;

/**
 * THE CONDITION AN ASSERTION ACTUALLY TESTS — the argument list of the
 * check/ok/assert call the ceiling appears in, balanced across lines.
 *
 * Reading a fixed window instead was the first version's other error: a
 * gate's assertions sit two lines apart, so one that ran something
 * excused the six around it.
 */
function conditionOf(lines, index) {
  let start = index;
  while (start > 0 && !ASSERT_RE.test(lines[start])) start--;
  let depth = 0;
  let out = "";
  for (let i = start; i < Math.min(lines.length, start + 12); i++) {
    for (const ch of lines[i]) {
      if (ch === "(") depth++;
      if (depth > 0) out += ch;
      if (ch === ")") {
        depth--;
        if (depth === 0) return out;
      }
    }
    out += "\n";
  }
  return out;
}

/**
 * EVERY LOCAL NAME IN A FILE THAT WAS BOUND FROM A CALL — the cheap
 * def-use pass that the two previous versions of this scan did without,
 * and the reason they reported 151 and then 117 findings that were all
 * measurements written across two lines.
 *
 * It is deliberately generous: `const v = parse(x)`, `const [a, b] =
 * split(y)`, `const { deck } = await load()`, `for (const row of rows())`.
 * A generous version over-reports MEASURED, which loses findings; a
 * stingy one over-reports the defect, which is how a scan becomes a list
 * nobody can act on. Between those two failures this repository has
 * already paid for the second one, twice.
 */
function producedNames(src) {
  const out = new Set();
  const bind = (names) => {
    for (const n of names.split(/[\s,{}[\]:]+/)) {
      const t = n.trim();
      if (/^[A-Za-z_$][\w$]*$/.test(t)) out.add(t);
    }
  };
  for (const m of src.matchAll(
    /(?:const|let|var)\s+([A-Za-z_$][\w$]*|\{[^}]*\}|\[[^\]]*\])\s*=\s*(await\s+)?[A-Za-z_$][\w$.]*\s*\(/g
  )) bind(m[1]);
  for (const m of src.matchAll(
    /for\s*\(\s*(?:const|let)\s+([A-Za-z_$][\w$]*|\{[^}]*\}|\[[^\]]*\])\s+of\s/g
  )) bind(m[1]);
  // A NAME THAT IS AN ACCUMULATOR. `let requests = []` filled by
  // `requests.push(...)` inside a stand-in server is as measured as any
  // return value, and `const census = withReason.length +
  // withoutReason.length` is two counted populations added together.
  // Both survived to the shortlist and both are observations.
  for (const m of src.matchAll(/\b([A-Za-z_$][\w$]*)\s*\.\s*push\s*\(/g)) out.add(m[1]);
  for (const m of src.matchAll(
    /(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*[^;\n]*\b([A-Za-z_$][\w$]*)\.length\b/g
  )) if (out.has(m[2])) out.add(m[1]);
  // A name assigned from a member read of something already produced —
  // `const rows = report.findings.paths` — one hop, which covers the
  // common `const src = files.get(f)` shape without becoming a solver.
  for (const m of src.matchAll(
    /(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*([A-Za-z_$][\w$]*)\./g
  )) if (out.has(m[2])) out.add(m[1]);
  return out;
}

/**
 * STRING LITERALS BLANKED, KEEPING THE LINE'S LENGTH so a reported column
 * still points at the right place. A test's label and a lookup key both
 * spell a ceiling without comparing anything to it.
 */
function stripStrings(line) {
  return line.replace(/(["'`])(?:\\.|(?!\1)[^\\])*\1/g, (m) => " ".repeat(m.length));
}

/**
 * ONE FILE, CLASSIFIED — exported so the gate can feed it a fixture per
 * rung instead of only ever seeing a tree that happens to be clean.
 *
 * A DETECTOR AT ZERO LOOKS EXACTLY LIKE A BROKEN ONE. This scan reports
 * no DECLARED vs DECLARED assertion anywhere in the repository, which is
 * either a true statement about the tree or a function that returns an
 * empty array. scripts/tests/ceiling-vs-outcome.test.mjs settles which by
 * handing this four fixtures, one per rung, and requiring each to land in
 * its own bucket — including a reconstruction of the assertion
 * scan-estimate-realism.mjs actually carried.
 */
export function classify(file, raw) {
  const findings = [];
  const enforcement = [];
  const measured = [];
  const declarationOnly = [];

  // COMMENTS ARE STRIPPED FIRST. docs/shapes.md records eleven gates
  // anchored on a capitalised sentence in a comment rather than the code
  // under it; a scan that reads comments makes the same mistake one level
  // up, and the prose here is dense with the word "ceiling".
  const src = stripComments(raw);
  // AND STRING LITERALS AFTER THAT. `check("max_tokens truncation
  // recovers", ...)` and `num("IDENTICAL_CALL_MAX")` are a test's LABEL
  // and a lookup KEY — the ceiling appears as text, and nothing is being
  // compared to it at all. Four of the fifteen survivors were this.
  const produced = producedNames(src);
  const lines = src.split("\n");
  const rawLines = raw.split("\n");

  for (let i = 0; i < lines.length; i++) {
    const line = stripStrings(lines[i]);
    if (!CEILING_RE.test(line)) continue;
    // A DECLARATION LINE IS NOT AN ASSERTION. `const DETAIL_MAX = 300;`
    // and a destructuring import both matched because conditionOf walked
    // BACKWARDS to whatever assertion happened to sit above them.
    if (/^\s*(?:const|let|var)\s/.test(line)) continue;

    // The assertion may wrap; read a small window so a condition split
    // across lines is judged whole.
    const window = lines.slice(Math.max(0, i - 2), i + 4).join("\n");
    const isGate = /scripts[/\\]tests[/\\]/.test(file) || /scan-/.test(file) || /\.fixture\./.test(file);

    const row = {
      file,
      line: i + 1,
      text: (rawLines[i] ?? "").trim().slice(0, 140),
      ceiling: (CEILING_RE.exec(line) ?? [])[0],
    };

    // A REGEX LITERAL ON THE LINE ITSELF, judged before the condition is
    // assembled. Balancing parentheses by counting characters mis-handles
    // an ESCAPED one — `\(` inside a pattern — so a condition carrying a
    // regex is extracted wrongly, and both of the last two survivors were
    // that. There is nothing here to match a pattern against except text
    // read off the disk, so the line is an observation whatever the
    // extractor made of it.
    if (/(?:^|[\s(,=!&|])\/(?![/*])(?:\\.|\[[^\]]*\]|[^/\n\\])+\/[gimsuy]*/.test(line)) {
      measured.push(row);
      continue;
    }

    if (!ASSERT_RE.test(window)) {
      if (ENFORCEMENT_RE.test(window)) enforcement.push(row);
      continue;
    }
    // THE CONDITION, NOT THE WINDOW. A neighbouring line that happens to
    // call something must not excuse the assertion beside it — that is
    // the comment-anchoring failure one level up, and it is how a
    // detector says yes to everything.
    const condition = conditionOf(lines.map(stripStrings), i);
    // A CALL IN THE CONDITION ITSELF.
    // A REGEX LITERAL IN THE CONDITION IS ALWAYS AN OBSERVATION. There is
    // nothing in this repository to match a pattern AGAINST except source
    // read off the disk or a response read off the wire — every one of
    // these gates does `RE.test(handlerCode)`. Two survived to the
    // shortlist only because the `.test(` sat on a later line than the
    // pattern.
    if (
      CALLS_SOMETHING_RE.test(condition) ||
      /\.\s*(test|match|includes|exec|some|every|filter|find)\s*\(/.test(condition) ||
      /(?:^|[\s(,=!&|])\/(?![/*])(?:\\.|\[[^\]]*\]|[^/\n\\])+\/[gimsuy]*/.test(condition)
    ) {
      measured.push(row);
      continue;
    }
    // OR A NAME THE FILE PRODUCED BY RUNNING SOMETHING.
    //
    // THE SECOND VERSION STILL FLAGGED 117 BECAUSE IT READ SYNTAX WHERE
    // THE PROPERTY IS DATA FLOW. `v.deck.slides[0].bullets.length ===
    // MAX_BULLETS` calls nothing — and `v` is the return of
    // parseDeckToolInput one line above, run with twenty-five slides to
    // watch it drop five. That is a measurement, written across two
    // lines. So the scan first collects every local name in the file
    // that was BOUND FROM A CALL, and a condition mentioning one is an
    // observation whichever line the call sits on.
    if (produced.size) {
      const used = [...condition.matchAll(/\b([A-Za-z_$][\w$]*)\b/g)].map((m) => m[1]);
      if (used.some((n) => produced.has(n))) {
        measured.push(row);
        continue;
      }
    }
    // AN ASSERTION ABOUT THE CONSTANT ITSELF is the sound third case:
    // `check("the floor is 4", MARGIN_MULTIPLIER_MIN === 4)`. It is told
    // apart by the other side being a bare numeric literal — the value is
    // the subject, and nothing about behaviour is being concluded.
    // AN ASSERTION ABOUT THE DECLARATION ITSELF is the sound third case,
    // in two spellings. `MARGIN_MULTIPLIER_MIN === 4` pins a value, and
    // `AGENT_DEPTH_SECONDS.simple[1] <= AGENT_DEPTH_SECONDS.standard[1]`
    // pins a table's internal order. Both have the declaration as their
    // SUBJECT; neither predicts what a user will experience, which is
    // the thing the reported shape gets wrong.
    // ANY comparison against a bare number, not just equality. Three of
    // the survivors were bounds sanity — `MIN_SLIDES >= 1 && ... &&
    // MAX_SLIDES <= 20` — which pins the declaration exactly as `=== 4`
    // does, and was reported only because the rule spelled one operator.
    if (/(?:===?|!==?|[<>]=?)\s*-?[\d_]+(\.\d+)?\b|\b-?[\d_]+(\.\d+)?\s*(?:===?|!==?|[<>]=?)/.test(condition)) {
      declarationOnly.push(row);
      continue;
    }
    // ONE DECLARED TABLE COMPARED WITH ITSELF, and the SIBLING case:
    // `MAX_QUERY_LENGTH > MIN_QUERY_LENGTH` is a statement about two
    // declared bounds and predicts nothing about a user. The subject is
    // still the declaration; it just has two halves.
    const names = [...condition.matchAll(/\b([A-Z][A-Z0-9_]{2,})\b/g)].map((m) => m[1]);
    // A DECLARED OBJECT'S PROPERTY counts as a declared name too, which
    // is how `SILENCE.maxTurnMs < MAX_CLIP_SECONDS * 1000` is classified:
    // a consistency rule between two things written down, the same family
    // as `MIN_RATE <= DEFAULT_RATE <= MAX_RATE`. It predicts nothing
    // about a measured outcome because it is not about an outcome.
    for (const m of condition.matchAll(/\b([A-Z][A-Z0-9_]{2,})\.[a-z]/g)) names.push(m[1]);
    const allDeclared = names.length >= 2 && names.every((n) => /^(MIN|MAX|DEFAULT|SILENCE)_?|_(MIN|MAX|LIMIT|CAP|CEILING|CHARS|SECONDS|BYTES)$/.test(n));
    if ((names.length >= 2 && new Set(names).size === 1) || allDeclared) {
      declarationOnly.push(row);
      continue;
    }
    if (isGate) findings.push(row);
  }
  return { findings, enforcement, measured, declarationOnly };
}

const findings = [];
const enforcement = [];
const measured = [];
const declarationOnly = [];

for (const file of files) {
  const r = classify(file, readFileSync(file, "utf8"));
  findings.push(...r.findings);
  enforcement.push(...r.enforcement);
  measured.push(...r.measured);
  declarationOnly.push(...r.declarationOnly);
}

const asJson = process.argv.includes("--json");
// UNDER --json, NOTHING BUT THE JSON. The gate used to run this twice and
// slice from the first brace, which turned any change in the prose into a
// parse error that reads as a crash rather than a failed check — and a
// mutation sidecar cannot tell those apart.
const say = asJson ? () => {} : (...a) => console.log(...a);

say("WHAT COULD HAPPEN, OR WHAT DID? — every ceiling in a comparison\n");
say(`  ${files.length} files read (scripts + src), comments stripped first\n`);
say(`  ${enforcement.length} ENFORCEMENT — the constant is the rule being applied, not a prediction`);
say(`  ${measured.length} MEASURED vs ceiling — something was run or read, and checked against the limit`);
say(`  ${declarationOnly.length} THE DECLARATION ITSELF — the constant's own value is the subject`);
say(`  ${findings.length} DECLARED vs DECLARED — a conclusion about behaviour, from two things nobody ran\n`);

if (findings.length === 0) {
  say("  No assertion in a gate concludes about behaviour from two declared values.");
  say("  The one that did — scan-estimate-realism.mjs — was deleted on 2026-09-23.\n");
} else {
  say("== DECLARED vs DECLARED, the shape scan-estimate-realism had ==\n");
  const byFile = new Map();
  for (const f of findings) {
    if (!byFile.has(f.file)) byFile.set(f.file, []);
    byFile.get(f.file).push(f);
  }
  for (const [file, rows] of [...byFile].sort((a, b) => b[1].length - a[1].length)) {
    say(`  ${file}  (${rows.length})`);
    for (const r of rows) say(`    :${String(r.line).padStart(4)}  ${r.ceiling.padEnd(26)} ${r.text}`);
  }
  say("");
}

say(
  "  PRECISION, MEASURED 2026-09-24: printed with the findings above the\n" +
    "  first time this ran, and re-stated whenever the count moves. The\n" +
    "  category is decided by what a value MEANS and this reads how it is\n" +
    "  spelled, so a finding is a candidate and never a verdict.\n" +
    "\n" +
    "  SETTLE ONE BY MUTATING IT, AT THE CALL SITE. Change the ceiling the\n" +
    "  assertion names and require the gate to go red; then change what the\n" +
    "  CALLER passes and see whether the gate notices. A gate that survives\n" +
    "  the second is measuring a declaration, not a behaviour."
);

if (asJson) {
  console.log(JSON.stringify({ enforcement, measured, declarationOnly, findings }, null, 2));
}
