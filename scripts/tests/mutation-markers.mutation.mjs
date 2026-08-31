#!/usr/bin/env node
/*
 * CAN mutation-markers.test.mjs TELL A GUARD FROM A DECORATION?
 *
 * There is a joke in the shape of this file and it is worth stating: a
 * mutation suite proving a mutation-marker guard has to put markers into
 * files in order to check that markers are found. That is exactly why
 * *.mutation.mjs is exempt from the guard, and exactly why the exemption is
 * itself checked — the day these files stop carrying markers, the exemption
 * is excusing nothing and should go.
 *
 * The defect being guarded is real and has happened: a mutation run killed
 * by a timeout left `if (true) return true;` in src/lib/website-multipage.ts
 * where a completeness check belonged. Every truncated page would have
 * shipped as a finished website.
 *
 * Run: node scripts/tests/mutation-markers.mutation.mjs
 */
import { readFileSync } from "node:fs";
import { writeFileSync } from "./lib/sidecar-write.mjs";
import { execFileSync } from "node:child_process";

const GATE = "scripts/tests/mutation-markers.test.mjs";
const CHECKER = "scripts/check-mutation-markers.mjs";
const INSTALLER = "scripts/install-hooks.mjs";
const PKG = "package.json";
const VICTIM = "src/lib/website-multipage.ts";

const TARGETS = [GATE, CHECKER, INSTALLER, PKG, VICTIM];

const MUTANTS = [
  // ---- the incident, put back ----------------------------------------
  {
    // THE EXACT LINE. If nothing else in this suite ran, this one would
    // still be the point of the whole file.
    name: "the stranded mutation is back in the tree",
    file: VICTIM,
    from: "    if (looksLikeCompleteHtmlDocument(s.html)) return true;",
    to: "    if (true) return true;",
    expect: "no mutation marker is in the tree",
  },
  {
    name: "a branch is switched off somewhere in src",
    file: VICTIM,
    from: "  const complete = segments.filter((s) => {",
    to: "  if (false) console.log('x');\n  const complete = segments.filter((s) => {",
    expect: "no mutation marker is in the tree",
  },

  // ---- the checker's own clauses -------------------------------------
  {
    name: "the if-true pattern stops matching",
    file: CHECKER,
    from: "    pattern: /\\bif\\s*\\(\\s*true\\s*\\)/,",
    to: "    pattern: /\\bif\\s*\\(\\s*NEVER_TRUE\\s*\\)/,",
    expect: "the stranded mutation is recognised",
  },
  {
    name: "comments stop being stripped, so prose becomes a marker",
    file: CHECKER,
    from: "export function stripComments(source) {",
    to: "export function stripComments(source) {\n  return source;\n  // eslint-disable-line",
    expect: "a marker inside a line comment is not a marker",
  },
  {
    // The half that is easy to get backwards: strip the comments and the
    // line numbers move, so every report points somewhere else.
    name: "stripping collapses the blank lines it leaves",
    file: CHECKER,
    from: '    .replace(/\\/\\*[\\s\\S]*?\\*\\//g, (m) => m.replace(/[^\\n]/g, " "))',
    to: '    .replace(/\\/\\*[\\s\\S]*?\\*\\//g, "")',
    expect: "stripping does not move the lines",
  },
  {
    // The marker that lives ON a comment line. Written without its flag it
    // could never match anything — which is what the first version did.
    name: "the comment-borne marker is read from the stripped line again",
    file: CHECKER,
    from: '        const haystack = marker.inComments ? (raw[index] ?? "") : line;',
    to: "        const haystack = line;",
    expect: "unreachable is recognised",
  },
  {
    name: "the exemption widens to every file",
    file: CHECKER,
    from: "export const isExempt = (file) =>",
    to: "export const isExempt = (file) =>\n  Boolean(file) ||",
    expect: "and nothing else is",
  },
  {
    name: "the exemption narrows to nothing, so the suites fail the build",
    file: CHECKER,
    from: "    match: /\\.mutation\\.mjs$/,",
    to: "    match: /\\.no-such-suffix$/,",
    expect: "mutation suites are exempt",
  },
  {
    name: "the scan stops descending into directories",
    file: CHECKER,
    from: "      walk(full, out);",
    to: "      void full;",
    expect: "the scan reaches the source",
  },

  // ---- where it is installed -----------------------------------------
  {
    // A GUARD THAT ONLY RUNS ON ONE LAPTOP. .git/hooks is not versioned, so
    // dropping it from the build removes it from CI and from every fresh
    // clone — while the hook on the machine that wrote it keeps passing.
    name: "the build stops running the check",
    file: PKG,
    from: "node scripts/check-mutation-markers.mjs && ",
    to: "",
    expect: "the build runs the check",
  },
  {
    name: "the check moves to after the unit suite and the compile",
    file: PKG,
    from: "node scripts/apply-function-limits.mjs && node scripts/check-mutation-markers.mjs && node scripts/check-i18n.js && npm run test:unit && next build",
    to: "node scripts/apply-function-limits.mjs && node scripts/check-i18n.js && npm run test:unit && node scripts/check-mutation-markers.mjs && next build",
    expect: "before the build spends time on anything expensive",
  },
  {
    name: "npm install stops installing the hook",
    file: PKG,
    from: '"prepare": "node scripts/install-hooks.mjs"',
    to: '"prepare": "echo skip"',
    expect: "npm install installs the hook",
  },
  {
    // A hook that copies the rules enforces whatever they were the day it
    // was written, and nobody re-runs the installer.
    name: "the hook inlines the rules instead of calling the checker",
    file: INSTALLER,
    from: "exec node scripts/check-mutation-markers.mjs --staged",
    // The replacement deliberately spells no marker: written with a
    // literal one, the installer file itself became a violation and the
    // tree-scan clause reddened first — a mutant testing the wrong check.
    to: "grep -rn 'always-passing guard' src/ && exit 1 || exit 0",
    expect: "the hook calls the checker rather than copying it",
  },
  {
    name: "the installer clobbers somebody else's pre-commit hook",
    file: INSTALLER,
    from: '      "install-hooks: .git/hooks/pre-commit exists and is not ours — leaving it alone.",',
    to: '      "install-hooks: overwriting",',
    expect: "refuses to clobber somebody else",
  },
];

function runGate() {
  try {
    execFileSync(process.execPath, [GATE], { encoding: "utf8", stdio: "pipe" });
    return { green: true, failed: [] };
  } catch (e) {
    const out = String(e.stdout ?? "") + String(e.stderr ?? "");
    return {
      green: false,
      failed: [...out.matchAll(/^ {2}- (.+)$/gm)].map((m) => m[1]),
    };
  }
}

console.log("mutation-markers mutations\n");

const originals = new Map(TARGETS.map((f) => [f, readFileSync(f, "utf8")]));
const restoreAll = () => {
  for (const [file, text] of originals) writeFileSync(file, text);
};

let caught = 0;
const missed = [];
try {
  const base = runGate();
  console.log(
    `baseline: the gate is ${base.green ? "GREEN" : "RED"} on the unmutated tree`,
  );
  if (!base.green) {
    console.log(
      `\nBASELINE IS RED — no mutation result below would mean anything.\n  ${base.failed.join("\n  ")}`,
    );
    process.exit(1);
  }

  for (const m of MUTANTS) {
    const edits = m.edits ?? [{ file: m.file, from: m.from, to: m.to }];
    const stale = edits.filter((e) => !originals.get(e.file).includes(e.from));
    if (stale.length > 0) {
      missed.push({
        ...m,
        why: `the mutation target no longer exists in ${stale.map((e) => e.file).join(", ")}`,
      });
      console.log(`  STALE   ${m.name}`);
      continue;
    }
    const byFile = new Map();
    for (const e of edits) {
      const current = byFile.get(e.file) ?? originals.get(e.file);
      byFile.set(e.file, current.replace(e.from, e.to));
    }
    if (
      [...byFile.entries()].every(
        ([file, text]) => text === originals.get(file),
      )
    ) {
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
    if (result.green) {
      missed.push({
        ...m,
        why: "the gate stayed green — nothing here is load-bearing",
      });
      console.log(`  MISSED  ${m.name}`);
      continue;
    }
    const onTarget = result.failed.filter((f) => f.includes(m.expect));
    if (onTarget.length === 0) {
      missed.push({
        ...m,
        why: `the gate went red, but on "${result.failed.join('", "')}" — nothing matching "${m.expect}"`,
      });
      console.log(
        `  WRONG   ${m.name}\n          -> red on: ${result.failed.join(" | ")}`,
      );
      continue;
    }
    caught++;
    console.log(`  CAUGHT  ${m.name}\n          -> ${onTarget[0]}`);
  }
} finally {
  restoreAll();
}

const after = runGate();
console.log(
  after.green
    ? "\nbaseline: the gate is green again on the restored tree"
    : "\nBASELINE IS RED — a mutation was not restored. Check `git diff`.",
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
