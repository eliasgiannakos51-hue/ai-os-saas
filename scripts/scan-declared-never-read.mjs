#!/usr/bin/env node
/*
 * WHICH EXPORTED CONSTANTS AND CONFIG FIELDS DOES NOTHING READ?
 *
 * THE QUESTION THIS EXISTS FOR. `PLANS.maxFileMb` was declared, printed on
 * a pricing page and enforced by nothing: uploads were bounded by a
 * different number in a different file, and the field was a promise the
 * reader had no way to check. The fix for that one field was a gate
 * (scripts/tests/plan-enforcement.test.mjs). The question it left behind
 * was how many OTHER declarations have the same shape, and that question
 * is this file.
 *
 * "Ένα πεδίο που κανείς δεν διαβάζει κοστίζει τίποτα να προστεθεί και
 * μοιάζει με δουλειά" — docs/shapes.md, "A field that costs nothing to add
 * and looks like work".
 *
 * ------------------------------------------------------------------
 * IT SETTLES BY MUTATING, NEVER BY READING
 * ------------------------------------------------------------------
 *
 * A grep cannot answer this, and the reason is worth stating because it is
 * what makes the naive version of this scan useless. `CREDIT_COSTS` had
 * `createAnything: 1`, `automationCreate: 50`, `missionPlan: 2`,
 * `websiteGenerate: 100` and `websiteEdit: 50`, none of which anything
 * read — and `grep -w createAnything` returns fifteen lines, because
 * `"createAnything"` is ALSO a live key of ACTION_PROFILES in
 * lib/billing/estimate.ts, a live i18n namespace, and a live producer id.
 * Five of the eleven dead prices in that one object would have survived a
 * grep-based scan, and they were the five with the largest numbers.
 *
 * So each candidate is settled the way CLAUDE.md requires: RENAME THE
 * DECLARATION, run `tsc --noEmit`, put it back. A reader anywhere in the
 * TypeScript tree becomes a compile error. Clean means nothing reads it.
 *
 * TWO THINGS tsc CANNOT SEE, both handled here:
 *   - .mjs and .js — the gate suite is JavaScript and imports production
 *     modules. Every candidate is also grepped across scripts/ and src/
 *     for its bare name in those files.
 *   - A field that is WRITTEN and never read. Renaming a type's field
 *     errors at the construction site too, so "has a reader" from tsc can
 *     mean "has a writer". Those are reported separately rather than
 *     counted as dead — see WRITE-ONLY below.
 *
 * ------------------------------------------------------------------
 * IT REPORTS; IT DOES NOT GATE
 * ------------------------------------------------------------------
 *
 * Same posture as scripts/scan-unjudged-numbers.mjs, for a weaker reason:
 * this scan's precision is GOOD (on 2026-09-13, of 25 candidates it
 * reported dead, 25 were dead — every one settled by the rename above),
 * but a dead export is not always a defect. Three honest cases:
 *
 *   - A constant whose comment SAYS it is held for something unbuilt.
 *     src/types/user-website.ts's `reference_image_url` says it is kept
 *     because the column still exists on old rows, which is true and is
 *     the reason not to delete it.
 *   - A row-shape mirror of a database column read via `select("*")`.
 *     Removing it from the TypeScript type does not remove the column.
 *   - A public API surface with no in-repo caller yet.
 *
 * A gate cannot tell those from the real thing, and a gate that fails a
 * build over a deliberate placeholder gets an ALLOWED list, and an ALLOWED
 * list is where this scan would go to die. So it prints, and a person
 * decides.
 *
 * Run: scripts/scan-declared-never-read.mjs
 *
 *   node scripts/scan-declared-never-read.mjs            # exported consts
 *   node scripts/scan-declared-never-read.mjs --object CREDIT_COSTS \
 *        --file src/lib/billing/credits.ts               # one config object
 *
 * The exported-const sweep runs one `tsc` per candidate and takes roughly
 * fifteen seconds each, so it is a thing you run deliberately, not a thing
 * the build runs.
 */
import { readFileSync, writeFileSync, readdirSync, statSync } from "node:fs";
import { execSync } from "node:child_process";
import { join } from "node:path";

const args = process.argv.slice(2);
const flag = (name) => {
  const i = args.indexOf(name);
  return i === -1 ? null : args[i + 1];
};
const OBJECT = flag("--object");
const OBJECT_FILE = flag("--file");
const LIMIT = Number(flag("--limit") ?? 0) || Infinity;

function walk(dir, out = []) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      if (entry === "node_modules" || entry === ".next") continue;
      walk(full, out);
    } else if (/\.tsx?$/.test(full)) out.push(full);
  }
  return out;
}

/** A compile error anywhere means something read the old name. */
function typecheckErrors() {
  try {
    execSync("npx tsc --noEmit", { stdio: "pipe" });
    return [];
  } catch (err) {
    return (String(err.stdout ?? "") + String(err.stderr ?? ""))
      .split("\n")
      .filter((line) => /error TS/.test(line));
  }
}

/** tsc does not read the gate suite, which is .mjs and imports these. */
function nonTypeScriptMentions(name) {
  const out = execSync(
    `grep -rn --include=*.mjs --include=*.js -w '${name}' src scripts 2>/dev/null || true`,
    { encoding: "utf8" }
  ).trim();
  return out ? out.split("\n") : [];
}

/**
 * Rename ONE declaration, typecheck, restore. The rename is confined to
 * the declaration line so that a use in the same file counts as a reader
 * like any other.
 */
function probe(file, lineNumber, name) {
  const src = readFileSync(file, "utf8");
  const lines = src.split("\n");
  const declaration = lines[lineNumber - 1];
  const word = new RegExp(`\\b${name}\\b`);
  if (!word.test(declaration)) return null;
  lines[lineNumber - 1] = declaration.replace(word, `${name}__PROBE`);
  writeFileSync(file, lines.join("\n"));
  try {
    const errors = typecheckErrors();
    const elsewhere = nonTypeScriptMentions(name);
    // TS2353/TS2561 is "object literal may only specify known properties":
    // the site that BUILDS the value, not one that reads it.
    const writesOnly =
      errors.length > 0 && errors.every((e) => /error TS(2353|2561)/.test(e));
    return {
      name,
      file,
      line: lineNumber,
      declaration: declaration.trim(),
      errors,
      elsewhere,
      verdict:
        errors.length === 0 && elsewhere.length === 0
          ? "DEAD"
          : writesOnly && elsewhere.length === 0
            ? "WRITE-ONLY"
            : "read",
    };
  } finally {
    writeFileSync(file, src);
  }
}

function candidatesFromObject(file, objectName) {
  const src = readFileSync(file, "utf8");
  const start = src.indexOf(`export const ${objectName} = {`);
  if (start === -1) throw new Error(`${objectName} not found in ${file}`);
  const end = src.indexOf("};", start);
  const before = src.slice(0, start).split("\n").length;
  const body = src.slice(start, end).split("\n");
  const out = [];
  body.forEach((line, i) => {
    const m = /^  (\w+):/.exec(line);
    if (m) out.push({ file, line: before + i, name: m[1] });
  });
  return out;
}

function candidatesFromExports() {
  const out = [];
  for (const file of walk("src")) {
    const lines = readFileSync(file, "utf8").split("\n");
    lines.forEach((line, i) => {
      const m = /^export const ([A-Z][A-Z0-9_]{2,})\b/.exec(line);
      if (m) out.push({ file, line: i + 1, name: m[1] });
    });
  }
  return out;
}

const candidates = OBJECT
  ? candidatesFromObject(OBJECT_FILE ?? "src/lib/billing/credits.ts", OBJECT)
  : candidatesFromExports();

console.log(
  OBJECT
    ? `${OBJECT} in ${OBJECT_FILE}: ${candidates.length} field(s)\n`
    : `SCREAMING_CASE exported constants under src/: ${candidates.length}\n`
);

const dead = [];
const writeOnly = [];
let checked = 0;
for (const c of candidates) {
  if (checked >= LIMIT) break;
  const result = probe(c.file, c.line, c.name);
  if (!result) continue;
  checked++;
  if (result.verdict === "DEAD") {
    dead.push(result);
    console.log(`DEAD        ${c.name.padEnd(30)} ${c.file}:${c.line}`);
  } else if (result.verdict === "WRITE-ONLY") {
    writeOnly.push(result);
    console.log(`WRITE-ONLY  ${c.name.padEnd(30)} ${c.file}:${c.line}`);
  }
}

console.log(
  `\n${checked} probed · ${dead.length} read by nothing · ${writeOnly.length} written and never read`
);
console.log(
  "Each verdict came from renaming that one declaration and running tsc.\n" +
    "A dead declaration is not automatically a defect — see the header for\n" +
    "the three honest cases this cannot tell apart. Decide, then delete or\n" +
    "write down why it stays."
);
