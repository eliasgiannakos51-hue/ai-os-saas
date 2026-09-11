#!/usr/bin/env node
/*
 * WHICH GATES PRINT A NUMBER THEY NEVER JUDGE?
 *
 * THE QUESTION THIS EXISTS FOR, and the defect that asked it. On
 * 2026-09-11 scripts/tests/schema-canaries.test.mjs was found deriving
 * what the newest migrations add, PRINTING it —
 *
 *     newest 12 migrations add: 10 column(s), 3 table(s), 7 function(s)
 *
 * — and then asserting nothing whatsoever about it, one line above its
 * first check. Three migrations landed inside that window with no canary,
 * /api/health answered `schema ok, missing: []`, and the owner found three
 * product screens dark by hand.
 *
 * A number measured and not judged is not a weak check. It is the SHAPE of
 * a check with none of the effect, and it reads in a green log exactly
 * like the real thing.
 *
 * WHAT IT LOOKS FOR: a `console.log` interpolating something counted off
 * the tree (`.length`, `.size`, `count`, `total`) whose root identifier
 * never appears inside a `check(...)` or `ok(...)` call in the same file.
 *
 * ------------------------------------------------------------------
 * ITS PRECISION IS POOR, AND THAT IS WHY IT IS NOT A GATE
 * ------------------------------------------------------------------
 *
 * ALL NINETEEN of its findings were run down on 2026-09-11 — one agent per
 * gate reading the whole file, each verdict then challenged by a second
 * told to refute it. ONE was real. The tally: 1 REAL, 11 false positives,
 * 6 informational context lines, 1 pass/fail footer under a local name.
 *
 * The common innocent case is a value that reaches an assertion under a
 * DIFFERENT name, which is the thing this scan cannot see.
 *
 *     combined-ceiling     foundTables -> `unclassified` -> checked
 *     conduct-language     exemplarsIn -> `handOver`     -> checked
 *     gdpr-coverage        tablesWithUserId -> `unclassified`/`ghosts`
 *     enum-schema-drift    read back by the completeness block at :345
 *     i18n-coverage        `counts` is the map both assertions read
 *     command-palette-…    `results` -> `byLocale` -> checked
 *     pricing-truth        goes red when its claim scans are emptied
 *     production-errors    `fails.length` is the pass/fail footer
 *
 * That is one in nineteen (measured 2026-09-11), and the rule this
 * repository already applies to its symbol scan applies here: a check with
 * that ratio gets its baseline set to the size of the problem, so this
 * REPORTS and does not gate. Read the list, mutate the value, decide. Do
 * not fix a line because it appears below.
 *
 * THE ONE WAY TO SETTLE IT, and the only one that counted for the finding
 * above: replace the value with an empty Set/Map/array and run the gate.
 * If it still prints ALL PASS, the section is measuring nothing.
 * db-migrations.test.mjs did exactly that with three separate scrapers and
 * printed "ALL PASS: 307 passed, 0 failed" every time, byte-identical to
 * the real run — see scripts/tests/db-migrations.mutation.mjs, which now
 * holds all three.
 *
 * Run: node scripts/scan-unjudged-numbers.mjs
 */
import { readFileSync, readdirSync } from "node:fs";

const DIR = "scripts/tests";

// The pass/fail footer every gate prints, plus built-ins. Not measurements
// of the tree — `${pass} passed, ${failures.length} failed` is the summary
// line, and flagging it in 255 files would bury everything else.
const NOISE = new Set([
  "pass", "failures", "failed", "passed", "caught", "missed", "skipped", "fails",
  "Object", "String", "Array", "Math", "JSON", "Number", "Boolean", "Set", "Map",
]);
const isNoise = (id) => NOISE.has(id) || id.length <= 2;

/** Every argument of every check()/ok() call in one file, as one string. */
function assertedText(src) {
  const out = [];
  for (const m of src.matchAll(/\b(?:check|ok)\s*\(/g)) {
    let i = m.index + m[0].length, depth = 1;
    while (i < src.length && depth > 0) {
      if (src[i] === "(") depth++;
      else if (src[i] === ")") depth--;
      i++;
    }
    out.push(src.slice(m.index, i));
  }
  return out.join("\n");
}

/**
 * Names bound by a loop or a callback parameter.
 *
 * A per-item name is not the gate's own measurement of the tree, and
 * leaving them in was the difference between 50 findings and 36 on the
 * first run.
 */
function loopBoundNames(src) {
  const bound = new Set();
  for (const m of src.matchAll(/for\s*\(\s*(?:const|let|var)\s*(?:\[([^\]]*)\]|([A-Za-z_$][\w$]*))/g)) {
    for (const part of (m[1] || m[2] || "").split(",")) {
      const id = part.trim().replace(/[^\w$].*$/, "");
      if (id) bound.add(id);
    }
  }
  for (const m of src.matchAll(
    /[.(]\s*(?:map|filter|forEach|some|every|find|reduce|sort|flatMap)\s*\(\s*\(?\s*([A-Za-z_$][\w$]*)/g
  )) {
    bound.add(m[1]);
  }
  return bound;
}

export function scan() {
  const files = readdirSync(DIR).filter((f) => f.endsWith(".test.mjs"));
  const findings = [];

  for (const file of files) {
    let src;
    try { src = readFileSync(`${DIR}/${file}`, "utf8"); } catch { continue; }

    const asserted = assertedText(src);
    const loopBound = loopBoundNames(src);
    const lines = src.split("\n");
    const seen = new Set();

    for (const m of src.matchAll(/console\.log\(([\s\S]*?)\);/g)) {
      const line = src.slice(0, m.index).split("\n").length;
      for (const e of m[1].matchAll(/\$\{([^}]+)\}/g)) {
        const expr = e[1].trim();
        if (!/\.(length|size)\b|\bcount\b|\btotal\b/i.test(expr)) continue;
        if (/^(pass|failures)\b/.test(expr)) continue;
        const root = (expr.match(/([A-Za-z_$][\w$]*)/) || [])[1];
        if (!root || isNoise(root) || loopBound.has(root)) continue;
        if (new RegExp(`\\b${root}\\b`).test(asserted)) continue;
        if (seen.has(root)) continue;
        seen.add(root);
        findings.push({ file, line, root, text: (lines[line - 1] || "").trim().slice(0, 120) });
      }
    }
  }
  return { files, findings };
}

if (process.argv[1] && process.argv[1].endsWith("scan-unjudged-numbers.mjs")) {
  const { files, findings } = scan();
  const byFile = new Map();
  for (const f of findings) {
    if (!byFile.has(f.file)) byFile.set(f.file, []);
    byFile.get(f.file).push(f);
  }
  console.log(`scanned ${files.length} gates in ${DIR}`);
  console.log(
    `${byFile.size} print a measurement no assertion in the same file reads; ${findings.length} distinct value(s)\n`
  );
  for (const [file, xs] of [...byFile].sort()) {
    console.log(file);
    for (const x of xs) console.log(`  :${x.line}  ${x.root}  <- ${x.text}`);
  }
  console.log(
    "\nCANDIDATES, NOT DEFECTS — 1 of 19 held up when run down by hand (2026-09-11).\n" +
      "To settle one: replace the value with an empty Set/Map/array and run that gate.\n" +
      "If it still prints ALL PASS, the section is measuring nothing."
  );
}
