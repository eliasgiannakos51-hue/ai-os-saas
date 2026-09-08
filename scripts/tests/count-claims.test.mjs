// "COVERS N", "ALL TWELVE", "THE 39 PAGES" — the claims a reader trusts
// and nothing checks.
//
// This repository's comments carry counts, and a count is the easiest
// kind of claim to be wrong about: the number was right when it was
// typed, something was added, and nothing anywhere connects the sentence
// to the thing it counts. Three were wrong when this file was written:
//
//   · api/create/top-modules said "the 13 business modules + ideas".
//     CLASSIFIER_MODULES is 13 INCLUDING ideas, so the sentence counted
//     it twice; the business modules are 12.
//   · dashboard/layout.tsx said the layout's <main> covers "all 39
//     pages". There are 41.
//   · i18n-coverage's client fallback baseline said "31 new keys across
//     ten locales" while the count was 28 (fixed with the baseline
//     itself — see baselines.test.mjs).
//
// WHY THIS IS NOT A SCAN. A regex over prose finds 720 candidate count
// claims in src/ and scripts/, and almost all of them are rhetorical —
// "the two halves", "the three things", "the four questions" enumerate
// the paragraph itself and have nothing to count. Measured precision is
// well under a tenth. A gate with that ratio gets its baseline set to the
// size of the problem, which is the same as deleting it; self-claims
// makes the same argument for symbols and reports rather than asserts.
//
// SO THE CLAIM DECLARES ITS OWN CHECK. A count that matters carries a
// marker naming what to count and where:
//
//     // COUNT: 12 /^ {4}slug: "/ in src/lib/modules.ts
//
// and this gate counts the matches and requires the number. It also
// requires the number to appear in the surrounding comment in words or
// digits, so the marker cannot drift away from the sentence it is
// vouching for — a marker that agrees with the repository while the prose
// beside it says something else would be the same defect one level down.
//
// WHAT IS NOT CLAIMED: that every count claim is annotated. The
// un-annotated ones are counted and printed, and the number is the honest
// size of what a reader still has to take on trust.
//
// Run: node scripts/tests/count-claims.test.mjs
import { readFileSync, readdirSync, statSync, existsSync } from "node:fs";
import path from "node:path";

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

function walk(dir, exts, out = []) {
  if (!existsSync(dir)) return out;
  for (const e of readdirSync(dir)) {
    if (["node_modules", ".next", ".git"].includes(e)) continue;
    const p = path.join(dir, e);
    if (statSync(p).isDirectory()) walk(p, exts, out);
    else if (exts.some((x) => e.endsWith(x))) out.push(p);
  }
  return out;
}

const FILES = [...walk("src", [".ts", ".tsx"]), ...walk("scripts", [".mjs", ".js"])];

/** The marker: the word COUNT, a colon, the number, the pattern between
 *  slashes, the word `in`, and the file. Written out rather than shown as
 *  an example, because an example in this file is a marker this file then
 *  has to satisfy. */
export const MARKER = /COUNT:\s*(\d+)\s+\/(.+)\/\s+in\s+(\S+)/;

/** Digits, and the English words this repository actually writes. */
const WORDS = [
  "zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine",
  "ten", "eleven", "twelve", "thirteen", "fourteen", "fifteen", "sixteen",
  "seventeen", "eighteen", "nineteen", "twenty",
];
export function saysNumber(text, n) {
  if (new RegExp(`(?<![\\d.])${n}(?![\\d.])`).test(text)) return true;
  const word = WORDS[n];
  return Boolean(word) && new RegExp(word, "i").test(text);
}

/**
 * Every comment in a file, as blocks. The block is the unit a sentence
 * lives in, and a claim and its marker have to land in the same one or
 * the marker is not vouching for anything.
 *
 * BOTH SHAPES, AND THE SECOND ONE MATTERED IMMEDIATELY. A run of `//`
 * lines is a block; so is a delimited comment — INCLUDING a JSX one,
 * whose inner lines carry no prefix at all:
 *
 *     {(slash-star) Putting it in the layout is what makes it true
 *        for all 41 pages instead of 8 (star-slash)}
 *
 * — written here in words because the real delimiter would close this
 * comment, which is a small joke at the expense of a file about claims
 * that cannot be written down.
 *
 * The first version of this reader only knew about prefixed lines, so
 * the marker written into dashboard/layout.tsx was invisible: a marker
 * nothing read, sitting in the gate whose entire subject is claims
 * nothing reads. Its own mutation suite found it.
 */
export function commentBlocks(src) {
  const blocks = [];
  const covered = [];
  for (const m of src.matchAll(/\/\*[\s\S]*?\*\//g)) {
    covered.push([m.index, m.index + m[0].length]);
    blocks.push({
      line: src.slice(0, m.index).split("\n").length,
      text: m[0]
        .replace(/^\/\*+/, "")
        .replace(/\*+\/$/, "")
        .split("\n")
        .map((l) => l.replace(/^\s*\*?\s?/, ""))
        .join(" ")
        .trim(),
    });
  }
  const inBlock = (offset) => covered.some(([a, b]) => offset >= a && offset < b);
  const lines = src.split("\n");
  let offset = 0;
  let run = [];
  let start = 0;
  lines.forEach((line, i) => {
    const at = offset;
    offset += line.length + 1;
    const m = line.match(/^\s*\/\/\s?(.*)$/);
    if (m && !inBlock(at)) {
      if (run.length === 0) start = i + 1;
      run.push(m[1]);
      return;
    }
    if (run.length > 0) {
      blocks.push({ line: start, text: run.join(" ") });
      run = [];
    }
  });
  if (run.length > 0) blocks.push({ line: start, text: run.join(" ") });
  return blocks;
}

console.log("== 1. every declared count is the count ==");
// A FLOOR ON THE CORPUS, not on the findings. "No count is wrong" is
// trivially true of a scan that read nothing, which is the whole subject
// of gate-vacuity.test.mjs.
check(`the tree was read (${FILES.length} source files)`, FILES.length >= 500, String(FILES.length));
const wrong = [];
const unbound = [];
let declared = 0;
for (const file of FILES) {
  for (const block of commentBlocks(readFileSync(file, "utf8"))) {
    const m = block.text.match(MARKER);
    if (!m) continue;
    declared++;
    const [, nRaw, pattern, target] = m;
    const n = Number(nRaw);
    if (!existsSync(target.replace(/\/$/, ""))) {
      wrong.push(`${file}:${block.line}  names ${target}, which is not there`);
      continue;
    }
    let actual;
    try {
      // A TARGET ENDING IN "/" IS A DIRECTORY, and the pattern is matched
      // against the PATHS under it rather than a file's text. "all 41
      // pages" and "ten locale files" are counts of files, and without
      // this form they are exactly the claims this gate cannot reach —
      // which is the category it exists to shrink.
      actual = target.endsWith("/")
        ? walk(target, [""]).filter((f) => new RegExp(pattern).test(f)).length
        : (readFileSync(target, "utf8").match(new RegExp(pattern, "gm")) ?? []).length;
    } catch (err) {
      wrong.push(`${file}:${block.line}  /${pattern}/ is not a regex: ${String(err.message).slice(0, 60)}`);
      continue;
    }
    if (actual !== n) {
      wrong.push(`${file}:${block.line}  claims ${n}, /${pattern}/ matches ${actual} in ${target}`);
      continue;
    }
    // THE MARKER MUST VOUCH FOR THE SENTENCE, not stand beside it. A
    // marker that agrees with the repository while the prose next to it
    // says something else is the same defect one level down.
    const prose = block.text.replace(MARKER, " ");
    if (!saysNumber(prose, n)) {
      unbound.push(`${file}:${block.line}  marker says ${n}, the comment around it never does`);
    }
  }
}
check(`markers were found and read (${declared})`, declared >= 5, String(declared));
check("every declared count matches what it counts", wrong.length === 0, wrong.join("\n        "));
check(
  "every marker's number is also written in the sentence it vouches for",
  unbound.length === 0,
  unbound.join("\n        ")
);

console.log("\n== 2. and the checker can still go red ==");
// THE POSITIVE CONTROL. Everything above asserts a list is empty; a
// reader that found no markers, or a counter that agreed with anything,
// would empty all three.
const FIXTURE = 'a\nb\na\n';
check("the counter counts", (FIXTURE.match(new RegExp("^a$", "gm")) ?? []).length === 2);
check("saysNumber reads digits", saysNumber("there are 12 of them", 12));
check("...and words", saysNumber("there are twelve of them", 12));
check("...and is not fooled by a longer number", !saysNumber("there are 120 of them", 12));
check(
  "a directory target counts files, not lines",
  walk("messages/", [""]).filter((f) => /\.json$/.test(f)).length === 10
);
check(
  "a comment block joins its lines",
  commentBlocks("// the twelve\n// modules\nconst x = 1;\n")[0].text === "the twelve modules"
);
// THE JSX SHAPE, PINNED. Its inner lines carry no prefix, and a reader
// that only knew about prefixed ones made the marker in
// dashboard/layout.tsx invisible.
check(
  "a JSX comment is a block too",
  commentBlocks("<div>{/* the twelve\n   modules */}</div>")[0].text === "the twelve modules"
);

console.log("\n== 3. what is still taken on trust, as a number ==");
// NOT AN ASSERTION. The candidate scan's precision is under a tenth —
// "the two halves" and "the three things" enumerate the paragraph, not
// the repository — so this is printed and not gated, for the same reason
// self-claims reports its symbol scan rather than asserting it.
const CANDIDATE =
  /\b(?:the|all|every one of the|its)\s+(?:\d{1,4}|zero|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty|thirty|forty|fifty)\s+[a-z][a-z-]{3,}s\b/gi;
let candidates = 0;
for (const file of FILES) {
  for (const block of commentBlocks(readFileSync(file, "utf8"))) {
    candidates += (block.text.match(CANDIDATE) ?? []).length;
  }
}
console.log(
  `        ${candidates} sentences in src/ and scripts/ read like a count claim; ${declared} carry a COUNT marker.\n` +
    `        The rest are mostly rhetorical — a gate on them would be a gate whose baseline is the size of the problem.`
);
check("the candidate scan still runs, so the number stays honest", candidates >= 100, String(candidates));

console.log("\n== 4. and a bug described as a design note, which does not survive being a gate ==");
// A BUG DESCRIBED AS A DESIGN NOTE — a comment that states, calmly and in
// the present tense, that something does not work, and reads as a
// decision. docs/shapes.md carries it as a shape, and V5 #13 was asked to
// make it enforceable.
//
// IT DOES NOT SURVIVE THE MEASUREMENT. Blocks matching the strongest
// phrasing ("is broken", "is wrong", "does not work", "has no effect")
// are counted below; most of them name a gate, a round or a plan, and a
// hand read of twelve of the rest on 2026-09-08 found ZERO live defects.
// Every one was prose about behaviour: "what is broken now" as a page's
// subject, "a rule with no data did not pass, it did not run", "nothing
// is logged and nobody will ever see it" explaining why a guard exists.
//
// So it is printed and not asserted, for the same reason self-claims
// reports its symbol scan: a check with that ratio gets its baseline set
// to the size of the problem, which is the same as deleting it. The
// number is here so the next person can re-measure rather than re-argue.
const BUG_NOTE =
  /\b(?:is|are)\s+(?:currently\s+)?(?:broken|wrong|incorrect|buggy)\b|\bdoes not (?:work|fire|run)\b|\bhas no effect\b/i;
const OWNED = /\.(?:test|mutation|itest|dbtest|prodtest)\.mjs|TODO|V\d|round|gate\b|fixed|until\b/i;
let bugNotes = 0;
let bugNotesOwned = 0;
for (const file of FILES) {
  for (const block of commentBlocks(readFileSync(file, "utf8"))) {
    if (!BUG_NOTE.test(block.text)) continue;
    bugNotes++;
    if (OWNED.test(block.text)) bugNotesOwned++;
  }
}
console.log(
  `        ${bugNotes} comment blocks say something does not work; ${bugNotesOwned} name a gate, a round or a plan.\n` +
    `        The other ${bugNotes - bugNotesOwned} are not a backlog: twelve were read by hand and none was a live defect.`
);
check("the bug-note scan still runs too", bugNotes >= 20, String(bugNotes));

console.log(`\n${failures.length === 0 ? "ALL PASS" : "FAILED"}: ${pass} passed, ${failures.length} failed`);
if (failures.length > 0) process.exit(1);
