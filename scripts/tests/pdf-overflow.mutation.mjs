#!/usr/bin/env node
/*
 * CAN pdf-overflow.test.mjs SEE A PAGE THAT DOES NOT FIT?
 *
 * Every defect it guards was invisible to a check that reads characters:
 *
 *   - an Arabic title overflowed its line box and the subtitle was drawn
 *     across it (every character present, every check green);
 *   - a Chinese paragraph with no spaces came out as ONE LINE running off
 *     the right edge, losing most of its text;
 *   - the two obvious fixes for that both put a HYPHEN at the end of every
 *     Chinese line;
 *   - and with the Latin face leading, every space in an Arabic document was
 *     set in Inter, which cut the line into a separate shaping run at each
 *     word boundary.
 *
 * So each of those is put back, one at a time, and the gate has to notice.
 *
 * Run: node scripts/tests/pdf-overflow.mutation.mjs
 */
import { readFileSync } from "node:fs";
import { writeFileSync } from "./lib/sidecar-write.mjs";
import { execFileSync } from "node:child_process";

const GATE = "scripts/tests/pdf-overflow.test.mjs";
const STACK_TS = "src/lib/pdf/font-stack.ts";
const DOCUMENT = "src/lib/pdf/document.tsx";
const CJK_WRAP = "src/lib/pdf/cjk-wrap.ts";

const TARGETS = [GATE, STACK_TS, DOCUMENT, CJK_WRAP];

const MUTANTS = [
  {
    name: "the sheet pins a line height again, too short for Arabic",
    file: DOCUMENT,
    from: "      fontSize: BODY_SIZE,\n      color: \"#1a1a1a\",",
    to: "      fontSize: BODY_SIZE,\n      lineHeight: 1.55,\n      color: \"#1a1a1a\",",
  },
  {
    name: "Arabic goes back to leading with the Latin face",
    file: STACK_TS,
    from: '    return ["NotoSansArabic", "NotoSansSC", "Inter"];',
    to: '    return ["Inter", "NotoSansArabic", "NotoSansSC"];',
  },
  {
    name: "CJK goes back to leading with the Latin face",
    file: STACK_TS,
    from: '    return ["NotoSansSC", "Inter", "NotoSansArabic"];',
    to: '    return ["Inter", "NotoSansSC", "NotoSansArabic"];',
  },
  {
    name: "the CJK breaker returns the paragraph unbroken, so it runs off the page",
    file: CJK_WRAP,
    from: "  if (!CJK.test(text)) return text;",
    to: "  return text;\n  // eslint-disable-next-line no-unreachable",
  },
  {
    name: "the breaker never reaches the column width, so nothing is broken",
    file: CJK_WRAP,
    from: "    if (run >= charsPerLine) {",
    to: "    if (false) {",
  },
  {
    name: "a column fits one more character than it does",
    file: CJK_WRAP,
    from: "  return Math.floor(columnWidth / fontSize);",
    to: "  return Math.ceil(columnWidth / fontSize) + 4;",
  },
  {
    name: "a line may start with the punctuation that ends a sentence",
    file: CJK_WRAP,
    from: "      if (NEVER_STARTS_A_LINE.has(ch)) {",
    to: "      if (false) {",
  },
  {
    name: "the gate stops counting lines AND the paragraph stops wrapping",
    edits: [
      { file: GATE, from: "      n += [...t.matchAll(/\\bTm\\b/g)].length;", to: "      n += 99;\n      void t;" },
      { file: CJK_WRAP, from: "    if (run >= charsPerLine) {", to: "    if (false) {" },
    ],
  },
  {
    // The zero-width space is one of the two fixes measured and rejected:
    // it wraps, and @react-pdf puts a hyphen at the break anyway — and Noto
    // Sans SC has no glyph for U+200B, so it is neither zero-width nor
    // invisible in the one font that matters.
    name: "the gate stops looking for a hyphen AND the breaker uses a zero-width space",
    edits: [
      {
        file: GATE,
        from: "      if (breakHyphens.length > 0) inserted.push(`${locale}: ${breakHyphens.length} after a CJK character`);",
        to: "      void breakHyphens;",
      },
      { file: CJK_WRAP, from: '        out.push("\\n");', to: '        out.push("\\u200b");' },
    ],
  },
];

function runGate() {
  try {
    execFileSync(process.execPath, [GATE], { encoding: "utf8", stdio: "pipe" });
    return { green: true, out: "" };
  } catch (e) {
    return { green: false, out: String(e.stdout ?? "") + String(e.stderr ?? "") };
  }
}

console.log("pdf-overflow mutations\n");

const originals = new Map(TARGETS.map((f) => [f, readFileSync(f, "utf8")]));
const restoreAll = () => {
  for (const [file, text] of originals) writeFileSync(file, text);
};

let caught = 0;
const missed = [];
try {
  const base = runGate();
  console.log(`baseline: the gate is ${base.green ? "GREEN" : "RED"} on the unmutated tree`);
  if (!base.green) {
    console.log("\nBASELINE IS RED — no mutation result below would mean anything.\n" + base.out.slice(-900));
    process.exit(1);
  }

  for (const m of MUTANTS) {
    // A CLAUSE OF THE GATE ONLY MATTERS WHEN THE CODE IS BROKEN. Removing
    // the check that counts lines changes nothing while the lines are
    // right, so those mutants carry the code break with them.
    const edits = m.edits ?? [{ file: m.file, from: m.from, to: m.to }];
    const stale = edits.filter((e) => {
      const source = originals.get(e.file);
      return !source.includes(e.from);
    });
    if (stale.length > 0) {
      missed.push({ ...m, why: `the mutation target no longer exists in ${stale.map((e) => e.file).join(", ")}` });
      console.log(`  STALE   ${m.name}`);
      continue;
    }
    const byFile = new Map();
    for (const e of edits) byFile.set(e.file, (byFile.get(e.file) ?? originals.get(e.file)).replace(e.from, e.to));
    if ([...byFile.entries()].every(([f, t]) => t === originals.get(f))) {
      missed.push({ ...m, why: "the mutation left every file byte-identical" });
      console.log(`  NO-OP   ${m.name}`);
      continue;
    }
    for (const [file, text] of byFile) writeFileSync(file, text);
    let result;
    try {
      result = runGate();
    } finally {
      restoreAll();
    }
    if (!result.green) {
      caught++;
      const which = (result.out.match(/^ {2}- (.+)$/m) ?? [])[1] ?? "a check went red";
      console.log(`  CAUGHT  ${m.name}\n          -> ${which}`);
    } else {
      missed.push({ ...m, why: "the gate stayed green — nothing here is load-bearing" });
      console.log(`  MISSED  ${m.name}`);
    }
  }
} finally {
  restoreAll();
}

const after = runGate();
console.log(
  after.green
    ? "\nbaseline: the gate is green again on the restored tree"
    : "\nBASELINE IS RED — a mutation was not restored. Check `git diff`."
);

console.log(`\n${caught} of ${MUTANTS.length} mutations caught.`);
if (missed.length > 0 || !after.green) {
  if (missed.length > 0) {
    console.log("\nHOLES:");
    for (const m of missed) console.log(`  - ${m.name}\n    ${m.why}`);
  }
  process.exit(1);
}
console.log("Every clause of the gate is load-bearing.");
