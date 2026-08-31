#!/usr/bin/env node
/*
 * THE SAME FUNCTION, TWICE, DISAGREEING.
 *
 * This session found eleven escapeHtml implementations, seven truncators
 * with three different answers, and then — while measuring the pattern
 * for the audit — two more pairs that were live:
 *
 *   formatBytes   files/file-types.ts said "—" for NaN and
 *                 websites/storage-quota.ts said "0 MB"; and the negative
 *                 case, which is the OVER-QUOTA figure the website
 *                 builder passes it, was "0 MB" in the copy the builder
 *                 actually imports. A comment I had written earlier in
 *                 this session claimed the opposite, about a function
 *                 that caller never used.
 *
 *   detectDelimiter  import/csv-parse.ts cut the header at the first
 *                    newline even when that newline was inside a quoted
 *                    field — while its own parseCsv supports exactly
 *                    that. Measured against data-analysis/csv.ts's
 *                    detector: eleven inputs, one disagreement, and the
 *                    consequence was a whole CSV imported as one column.
 *
 * WHAT THIS GATE DOES is not "find every duplicate" — it pins the ones
 * that were found, by running BOTH implementations over a cross-product
 * of inputs and requiring the same answer. A name appearing twice is not
 * a defect; two answers to one question is.
 *
 * Run: node scripts/tests/duplicate-implementations.test.mjs
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { loadTs } from "./load-ts.mjs";

let pass = 0;
const failures = [];
function check(name, cond, detail) {
  if (typeof cond !== "boolean") {
    failures.push(name);
    console.log(`  FAIL  ${name}\n        check() takes a BOOLEAN; got ${Array.isArray(cond) ? "an array" : typeof cond}`);
    return;
  }
  if (cond) pass++;
  else { failures.push(name); console.log(`  FAIL  ${name}${detail ? "\n        " + detail : ""}`); }
}

console.log("== 1. formatBytes has one implementation, and both importers get it ==");
{
  const canon = await loadTs("src/lib/format-bytes.ts");
  const files = await loadTs("src/lib/files/file-types.ts");
  const quota = await loadTs("src/lib/websites/storage-quota.ts");
  // THE CROSS-PRODUCT, not a sample. Every boundary that told the two
  // copies apart, plus the ordinary ones.
  const INPUTS = [
    NaN, Infinity, -Infinity, 0, -0, 1, -1, 512, 1023, 1024, 1025,
    1048575, 1048576, -524288000, 1073741824, -1073741824, 1e15,
  ];
  const disagree = INPUTS.filter(
    (v) => files.formatBytes(v) !== canon.formatBytes(v) || quota.formatBytes(v) !== canon.formatBytes(v)
  ).map((v) => `${v}: files=${files.formatBytes(v)} quota=${quota.formatBytes(v)} canonical=${canon.formatBytes(v)}`);
  check(`all three agree on every input (${INPUTS.length})`, disagree.length === 0,
    disagree.join("\n        "));
  // The values themselves, so "they agree" cannot be satisfied by three
  // copies of the same wrong answer.
  check('NaN is a dash, not a number nobody measured', canon.formatBytes(NaN) === "—");
  check("an over-quota figure keeps its unit", canon.formatBytes(-524288000) === "-500.0 MB",
    canon.formatBytes(-524288000));
  check("zero is zero bytes", canon.formatBytes(0) === "0 B");
  // And there is only ONE definition in the tree.
  const src = [];
  (function walk(d) {
    for (const e of readdirSync(d)) {
      const p = path.join(d, e);
      if (statSync(p).isDirectory()) walk(p);
      else if (/\.tsx?$/.test(p)) src.push(p);
    }
  })("src");
  const definers = src.filter((f) => /export function formatBytes/.test(readFileSync(f, "utf8")));
  check(`formatBytes is defined once (${definers.length})`, definers.length === 1, definers.join(", "));
}

console.log("== 2. the two CSV delimiter detectors give one answer ==");
{
  const A = await loadTs("src/lib/data-analysis/csv.ts");
  const B = await loadTs("src/lib/import/csv-parse.ts");
  const CASES = [
    ["a plain comma file", "a,b,c\n1,2,3"],
    ["semicolons, as Excel writes in a comma-decimal locale", "a;b;c\n1;2;3"],
    ["tabs", "a\tb\tc"],
    ["pipes", "a|b|c"],
    ["a comma inside a quoted cell does not win", '"a,b",c;d;e'],
    // THE ONE THAT DISAGREED. import/csv-parse.ts cut the header at the
    // first newline even inside a quoted cell, detected a comma, and
    // imported the whole file as one column.
    ["a newline inside the first quoted cell", '"line1\nline2",b;c;d'],
    ["...and the same with tabs", '"x\ny"\tb\tc'],
    ["doubled quotes are an escape, not a boundary", '"a""b",c;d;e'],
    ["an empty sample falls back to a comma", ""],
    ["a single column falls back to a comma", "header"],
    ["a tie keeps the earlier candidate", "a,b;c"],
    ["CRLF", "a;b;c\r\n1;2;3"],
    ["a BOM before the header", "﻿a;b;c"],
  ];
  const disagree = CASES
    .filter(([, s]) => A.detectDelimiter(s) !== B.detectDelimiter(s))
    .map(([n, s]) => `${n}: analysis=${JSON.stringify(A.detectDelimiter(s))} import=${JSON.stringify(B.detectDelimiter(s))}`);
  check(`both detectors agree on every case (${CASES.length})`, disagree.length === 0,
    disagree.join("\n        "));
  // Agreement on a wrong answer is still wrong: the expected value is
  // asserted for the case that mattered.
  check("a semicolon file with a multi-line header cell is semicolon-delimited",
    B.detectDelimiter('"line1\nline2",b;c;d') === ";",
    B.detectDelimiter('"line1\nline2",b;c;d'));
  check("...and the analysis side says the same", A.detectDelimiter('"line1\nline2",b;c;d') === ";");
  check("a plain comma file is still comma-delimited", B.detectDelimiter("a,b,c") === ",");
}

console.log(`\n${pass} passed, ${failures.length} failed`);
if (failures.length) { for (const f of failures) console.log(`  - ${f}`); process.exit(1); }
