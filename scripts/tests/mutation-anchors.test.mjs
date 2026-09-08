// DOES EVERY MUTATION CHANGE CODE, OR DO SOME ONLY CHANGE THE PROSE?
//
// A mutation suite is this repository's evidence that a gate is
// load-bearing. It puts a real defect back and requires the gate to name
// it. That argument only holds if the mutation edits the CODE: a
// mutation that rewrites a comment and watches a gate go red has proved
// that the gate reads comments, which is the opposite of the claim the
// suite is making.
//
// WHY A PARSER AND NOT A REGEX. The first version of this scan masked
// comments by hand and reported eighteen prose anchors. Three of its
// classes were wrong, and all three are instructive:
//
//   · A REGEX LITERAL IS NOT A COMMENT. `/^https?:\/\//i` in seo/head.ts
//     contains the characters `//`, so a hand-rolled masker read the rest
//     of the line as prose and reported a code anchor as one.
//   · A .gitignore HAS NO // COMMENTS, and neither does README.md, but
//     applying JavaScript rules to them found some anyway.
//   · AN ANCHOR THAT SPANS BOTH is neither. What matters is not where the
//     anchor sits but what the mutation CHANGES, and the two are
//     different whenever an anchor carries context around the edit.
//
// TypeScript's own parser answers all three, because it is the thing that
// decides what a token is. Every leaf of the AST is code; every offset
// outside all of them is trivia.
//
// AND BOTH SIDES OF THE EDIT. Judging by what a mutation REMOVES called
// nav-events prose: it inserts a line into an array literal, removing
// nothing, at a line boundary that belongs to no token. What it INSERTS
// is code, and the file it would produce says so — so the inserted region
// is checked in the mutated source, not the original.
//
// WHAT THIS CANNOT SEE, said as a number rather than left implicit. The
// mutant lists are read by evaluating the MUTANTS array (see
// lib/mutant-list.mjs); nineteen of the suites do not stand on their own
// that way and fall back to a regex that cannot read their `edits:`
// lists. For those, a mutation with a prose marker and a code edit reads
// as prose. That is why the fallback count is asserted rather than
// printed: it may shrink, and it may not silently grow.
//
// Run: node scripts/tests/mutation-anchors.test.mjs
import { readFileSync, existsSync } from "node:fs";
import { reportBaseline } from "./lib/baseline.mjs";
import ts from "typescript";
import { readMutants } from "./lib/mutant-list.mjs";
import { PROSE_ANCHORS } from "./lib/prose-anchors.mjs";

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

const KIND = {
  ".ts": ts.ScriptKind.TS,
  ".tsx": ts.ScriptKind.TSX,
  ".mjs": ts.ScriptKind.JS,
  ".js": ts.ScriptKind.JS,
};

/**
 * Every offset the parser calls part of a token.
 *
 * getStart(sf) skips leading trivia, so an offset inside one of these
 * spans is code and an offset outside all of them is a comment or
 * whitespace. Nothing here has to know what a comment looks like, which
 * is the whole point.
 */
export function tokenSpans(file, src) {
  const ext = file.slice(file.lastIndexOf("."));
  const sf = ts.createSourceFile(file, src, ts.ScriptTarget.Latest, true, KIND[ext]);
  const spans = [];
  (function walk(node) {
    const kids = node.getChildren(sf);
    if (kids.length === 0) {
      const a = node.getStart(sf);
      const b = node.getEnd();
      if (b > a) spans.push([a, b]);
      return;
    }
    for (const k of kids) walk(k);
  })(sf);
  return spans;
}

const overlaps = (spans, a, b) => spans.some(([s, e]) => s < b && a < e);

/** The region one edit actually changes: the anchor minus the prefix and
 *  suffix it shares with its replacement. */
export function changedRange(from, to) {
  let prefix = 0;
  while (prefix < from.length && prefix < to.length && from[prefix] === to[prefix]) prefix++;
  let suffix = 0;
  while (
    suffix < from.length - prefix &&
    suffix < to.length - prefix &&
    from[from.length - 1 - suffix] === to[to.length - 1 - suffix]
  ) {
    suffix++;
  }
  return { prefix, suffix };
}

/**
 * Does this edit change any code?
 *
 * Both directions, because a mutation can remove code, add code, or do
 * both, and an insertion removes nothing at all.
 */
export function editTouchesCode(src, spans, from, to) {
  const at = src.indexOf(from);
  if (at === -1) return null;
  const { prefix, suffix } = changedRange(from, to);
  const a = at + prefix;
  const b = at + from.length - suffix;
  if (b > a && overlaps(spans, a, b)) return true;
  const insertEnd = at + to.length - suffix;
  if (insertEnd <= a) return false;
  const mutated = src.slice(0, at) + to + src.slice(at + from.length);
  return overlaps(tokenSpans("mutated.ts", mutated), a, insertEnd);
}

const { mutants, fellBack } = readMutants("scripts/tests");
const sources = new Map();
function sourceOf(file) {
  if (!sources.has(file)) {
    const src = readFileSync(file, "utf8");
    sources.set(file, { src, spans: tokenSpans(file, src) });
  }
  return sources.get(file);
}

console.log("== 1. the mutant lists were read, and how much of them ==");
const editCount = mutants.reduce((n, m) => n + m.edits.length, 0);
check(
  `every suite's mutants were read (${mutants.length} mutations, ${editCount} edits)`,
  mutants.length >= 1500,
  String(mutants.length)
);
// A RATCHET ON THE WEAKER READING, not a tolerance for it. Nineteen
// suites do not evaluate; if a twentieth stops, the gate says so before
// its `edits` go unread.
const FALLBACK_CEILING = 19;
reportBaseline("FALLBACK_CEILING", FALLBACK_CEILING, fellBack.length);
check(
  `${fellBack.length} suites were read the weaker way, ceiling ${FALLBACK_CEILING}`,
  fellBack.length <= FALLBACK_CEILING,
  fellBack.join(", ")
);

console.log("\n== 2. every mutation changes code, or says why it does not ==");
let analysed = 0;
let nonJs = 0;
let unlocatable = 0;
const proseOnly = [];
for (const m of mutants) {
  const ext = m.file.slice(m.file.lastIndexOf("."));
  if (!KIND[ext] || !existsSync(m.file)) {
    nonJs++;
    continue;
  }
  const { src, spans } = sourceOf(m.file);
  let sawEdit = false;
  let touchesCode = false;
  let label = "";
  for (const e of m.edits) {
    const verdict = editTouchesCode(src, spans, e.from, e.to);
    if (verdict === null) continue;
    sawEdit = true;
    if (verdict) {
      touchesCode = true;
      break;
    }
    const { prefix, suffix } = changedRange(e.from, e.to);
    if (!label) {
      label = (
        e.from.slice(prefix, e.from.length - suffix) || e.to.slice(prefix, e.to.length - suffix)
      ).slice(0, 60);
    }
  }
  if (!sawEdit) {
    unlocatable++;
    continue;
  }
  analysed++;
  if (!touchesCode) proseOnly.push({ ...m, changed: label });
}
console.log(
  `        ${analysed} mutations analysed · ${nonJs} target a non-JavaScript file · ` +
    `${unlocatable} anchor not found in the tree`
);
const declaredForAnchor = (m, a) =>
  a.file === m.file && m.edits.some((e) => e.from.includes(a.changed) || e.to.includes(a.changed));
const declaredFor = (m) =>
  (PROSE_ANCHORS[m.suite]?.anchors ?? []).some((a) => declaredForAnchor(m, a));
const undeclared = proseOnly.filter((m) => !declaredFor(m));
check(
  "no mutation changes only prose without saying why",
  undeclared.length === 0,
  undeclared.map((m) => `${m.suite} -> ${m.file}  ${JSON.stringify(m.changed)}`).join("\n        ")
);

console.log("\n== 3. and the table cannot go stale ==");
const orphaned = [];
for (const [suite, entry] of Object.entries(PROSE_ANCHORS)) {
  check(`${suite}: the exception says why`, typeof entry.reason === "string" && entry.reason.length > 60);
  for (const a of entry.anchors) {
    check(
      `${suite}: "${a.changed}" is specific enough to mean something`,
      a.changed.length >= 8,
      a.changed
    );
    // BY FILE AND BY FRAGMENT. Matching on the file alone was a hole its
    // own mutation found: rewrite the fragment and the entry stops
    // describing anything, while the orphan check goes on seeing a prose
    // mutation in that file and calls the table current.
    if (!proseOnly.some((m) => m.suite === suite && declaredForAnchor(m, a))) {
      orphaned.push(`${suite} -> ${a.file} :: ${a.changed}`);
    }
  }
}
// AN ENTRY WHOSE MUTATION HAS BECOME A CODE CHANGE is an exemption with
// nothing left to exempt, and the same failure mode as a stale
// allowlist: it stays, and the next prose mutation in that suite hides
// behind it.
check(
  "no exception describes a mutation that now changes code",
  orphaned.length === 0,
  orphaned.join("\n        ")
);

// THE MATCHER, ASKED ABOUT SOMETHING IT SHOULD REFUSE. Every check above
// is satisfied by a table that says yes to everything, so the table is
// asked directly about a mutation in a file it DOES cover, changing text
// it does not.
check(
  "an exception does not cover a different mutation in the same file",
  !declaredFor({
    suite: "message-slices.mutation.mjs",
    file: "src/app/layout.tsx",
    edits: [{ from: "nothing this table has ever named", to: "" }],
  })
);

console.log("\n== 4. the analyser can still tell the two apart ==");
// THE POSITIVE CONTROL. Every assertion above is that a list is empty,
// and an analyser that called everything code would empty it.
check(
  `it still SEES prose-only mutations (${proseOnly.length})`,
  proseOnly.length >= 8,
  String(proseOnly.length)
);
const FIXTURE = 'const x = 1; // a note\nconst y = "z";\n';
const fixtureSpans = tokenSpans("fixture.ts", FIXTURE);
check(
  "a comment edit is prose",
  editTouchesCode(FIXTURE, fixtureSpans, "// a note", "// a different note") === false
);
check(
  "a value edit is code",
  editTouchesCode(FIXTURE, fixtureSpans, "const x = 1", "const x = 2") === true
);
// THE REGEX-LITERAL TRAP, PINNED. `//` inside a regex is not a comment,
// and the hand-rolled masker this file replaced reported seo/head.ts
// because of it.
const RE_FIXTURE = 'if (/^https?:\\/\\//i.test(s)) return s;\n';
check(
  "a slash-slash inside a regex literal is not a comment",
  editTouchesCode(RE_FIXTURE, tokenSpans("re.ts", RE_FIXTURE), "return s;", "return null;") === true
);
// THE INSERTION TRAP, PINNED. Removing nothing and adding a line of code
// at a line boundary is a code change; judging by the removal alone
// called nav-events prose.
const ARR = "const a = [\n  1,\n  2,\n];\n";
check(
  "inserting a line of code into an array is code",
  editTouchesCode(ARR, tokenSpans("arr.ts", ARR), "  1,\n", "  1,\n  99,\n") === true
);
check(
  "inserting a comment there is not",
  editTouchesCode(ARR, tokenSpans("arr.ts", ARR), "  1,\n", "  1,\n  // note\n") === false
);

console.log(`\n${failures.length === 0 ? "ALL PASS" : "FAILED"}: ${pass} passed, ${failures.length} failed`);
if (failures.length > 0) process.exit(1);
