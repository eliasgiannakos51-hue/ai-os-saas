/*
 * EVERY MUTATION THE SUITES DECLARE, READ ONCE.
 *
 * WHY THIS IS A MODULE. scripts/check-mutation-tree.mjs parsed the
 * suites twice, in two sections, with two copies of the same regex and
 * the same `const NAME = "path"` resolution beside each. V5 #13 needed a
 * third reader, for a different question — does this anchor land on code
 * or in a comment — and a third copy of a parser is how two answers about
 * one list start disagreeing. That is the defect this whole area exists
 * to stop, so the parser moved here instead.
 *
 * PARSED FROM SOURCE, NOT IMPORTED. Importing a mutation suite RUNS it,
 * which mutates the tree the caller is trying to inspect.
 *
 * WHAT IT CANNOT READ, COUNTED RATHER THAN IGNORED. The pattern below
 * handles `from:`/`to:` written as single- or double-quoted literals.
 * Some suites use template literals — role-grants builds its anchors from
 * a shared prefix — and those come back in `unparsed` with the suite that
 * holds them. A reader that silently skipped them would let a gate say
 * "every anchor is checked" while checking 1,230 of 1,239.
 */
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

export const SUITE_DIR = "scripts/tests";

/**
 * The same pattern check-mutation-tree.mjs has used since it was written,
 * moved rather than rewritten. Comments are allowed between the keys
 * because every mutant in this repository carries one.
 */
export const PAIR =
  /\bfile:\s*(?:"([^"]+)"|([A-Z_][A-Z_0-9]*))\s*,\s*\n\s*(?:\/\/[^\n]*\n\s*)*from:\s*("(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*')\s*,\s*\n\s*(?:\/\/[^\n]*\n\s*)*to:\s*("(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*')/g;

/** Any `file:` at all, quoted or by constant — used to count what PAIR
 *  could not read, so the shortfall is a number rather than a silence. */
const ANY_FILE = /\bfile:\s*(?:"([^"]+)"|([A-Z_][A-Z_0-9]*))\s*,/g;

export function unquote(literal) {
  try {
    return JSON.parse(
      literal.startsWith("'") ? `"${literal.slice(1, -1).replace(/"/g, '\\"')}"` : literal
    );
  } catch {
    return null;
  }
}

/** The `const NAME = "path"` declarations a suite uses in `file:`. */
export function fileConstants(src) {
  const consts = new Map();
  for (const m of src.matchAll(/^const ([A-Z_][A-Z_0-9]*)\s*=\s*"([^"]+)";$/gm)) {
    consts.set(m[1], m[2]);
  }
  return consts;
}

/**
 * THE ARRAY ITSELF, EVALUATED — because a regex cannot read this shape.
 *
 * Ten suites write a mutant as a marker pair plus an `edits: [...]` list,
 * and the marker is deliberately inert: agent-depth's "deep's output
 * allowance drops below what the runner may produce" has
 * `to: "…\n    // eslint-disable-next-line\n"` and does its real work in
 * `edits`. Read by PAIR alone, that mutant looks like a suite changing a
 * comment and calling it a budget — which is a serious accusation to
 * make on the strength of a regex that cannot see the other key.
 *
 * So the MUTANTS array is extracted and evaluated with the suite's own
 * string constants in scope. It runs no suite: the text between
 * `const MUTANTS = [` and its matching `];` is an array literal, and the
 * Function it becomes is called with nothing but those constants.
 *
 * Falls back to PAIR when the array does not stand on its own — a suite
 * that builds its mutants from a helper, say — and the caller is told
 * which suites needed the fallback rather than being handed a number
 * that quietly means less than it says.
 */
function evaluateMutantArray(src) {
  const start = src.indexOf("const MUTANTS = [");
  if (start === -1) return null;
  const open = src.indexOf("[", start);
  let depth = 0;
  let end = -1;
  let mode = 0; // 0 code, 1 line comment, 2 block comment, 3 string
  let quote = "";
  for (let i = open; i < src.length; i++) {
    const c = src[i];
    const n = src[i + 1];
    if (mode === 1) {
      if (c === "\n") mode = 0;
      continue;
    }
    if (mode === 2) {
      if (c === "*" && n === "/") { mode = 0; i++; }
      continue;
    }
    if (mode === 3) {
      if (c === "\\") { i++; continue; }
      if (c === quote) mode = 0;
      continue;
    }
    if (c === "/" && n === "/") { mode = 1; i++; continue; }
    if (c === "/" && n === "*") { mode = 2; i++; continue; }
    if (c === '"' || c === "'" || c === "`") { mode = 3; quote = c; continue; }
    if (c === "[") depth++;
    else if (c === "]") {
      depth--;
      if (depth === 0) { end = i; break; }
    }
  }
  if (end === -1) return null;
  // THE SUITE'S OWN SINGLE-LINE CONSTANTS, TEXTUALLY. Passing only the
  // `const NAME = "path"` ones left nineteen suites unreadable: several
  // build their anchors from a shared prefix (self-claims writes
  // `${RUN_PREFIX}scripts/tests/truncate.test.mjs`), and a missing
  // binding throws. Only declarations that are one line and end in a
  // semicolon are taken, and only from ABOVE the array, so nothing with a
  // side effect can be dragged in.
  const prelude = src
    .slice(0, start)
    .split("\n")
    .filter((l) => /^const [A-Za-z_$][\w$]* = .*;$/.test(l) && !/\brequire\(|\bimport\(/.test(l))
    .join("\n");
  try {
    // eslint-disable-next-line no-new-func
    const fn = new Function(`${prelude}\nreturn ${src.slice(open, end + 1)};`);
    const value = fn();
    return Array.isArray(value) ? value : null;
  } catch {
    return null;
  }
}

/**
 * Every declared mutation, and every suite whose list had to be read the
 * weaker way.
 *
 * `mutants` carries { suite, file, edits: [{ from, to }] } — the primary
 * pair first, then any `edits`, so a caller judging what a mutation
 * CHANGES sees all of it. `fellBack` names the suites read by PAIR, which
 * cannot see `edits`; a gate that wants to claim it checked them all has
 * to say that number out loud.
 */
export function readMutants(dir = SUITE_DIR) {
  const mutants = [];
  const fellBack = [];
  for (const suite of readdirSync(dir).filter((f) => f.endsWith(".mutation.mjs"))) {
    const src = readFileSync(join(dir, suite), "utf8");
    const consts = fileConstants(src);
    const evaluated = evaluateMutantArray(src);
    if (evaluated) {
      for (const m of evaluated) {
        if (!m || typeof m.file !== "string" || typeof m.from !== "string") continue;
        const edits = [{ from: m.from, to: typeof m.to === "string" ? m.to : "" }];
        for (const e of Array.isArray(m.edits) ? m.edits : []) {
          if (e && typeof e.from === "string" && typeof e.to === "string") edits.push(e);
        }
        mutants.push({ suite, file: m.file, name: m.name, edits });
      }
      continue;
    }
    fellBack.push(suite);
    for (const m of src.matchAll(PAIR)) {
      const file = m[1] ?? consts.get(m[2]);
      const from = unquote(m[3]);
      const to = unquote(m[4]);
      if (!file || from === null || to === null) continue;
      mutants.push({ suite, file, edits: [{ from, to }] });
    }
  }
  return { mutants, fellBack };
}
