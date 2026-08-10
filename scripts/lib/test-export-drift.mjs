/**
 * Finds test files that call something their subject no longer exports.
 *
 * THE FAILURE THIS EXISTS TO CATCH, exactly as it happened. A helper was
 * removed from src/lib/function-limits.ts because Next silently ignores a
 * computed `maxDuration`. One of the two suites that used it was updated;
 * the other still had
 *
 *     fl.routeMaxDuration(800)
 *
 * on line 66. Nothing in the repository connected those two files, so the
 * removal looked complete. The suite then threw
 *
 *     TypeError: fl.routeMaxDuration is not a function
 *
 * inside `npm run build`, which is the deploy gate, and production stopped
 * building.
 *
 * A crash is a WORSE failure than a red assertion, because a red assertion
 * prints the word FAILURES and a crash prints a stack trace. Anything that
 * greps the log for failures — which is what I was doing — reads a crash as
 * a pass. The gate itself was fine (`node "$f" || exit 1` propagates the
 * exit code); the verification around it was not.
 *
 * So this closes the loop statically: every symbol a suite reads off a
 * module it loaded with loadTs() must actually be exported by that module,
 * at RUNTIME. `export type` and `export interface` do not count — they are
 * erased before the file ever runs, so reading one gives undefined just as
 * surely as reading a name that was deleted.
 *
 * It is pure text analysis: no network, no ports, no database, no
 * credentials. It can run inside the build gate on any machine.
 */

/**
 * Removes comments without eating URLs.
 *
 * A naive /\/\/.*$/ strips the second half of `http://localhost:3131`, and
 * the line it mangles may contain the very access being looked for. The
 * `[^:]` guard keeps `https://` intact because the character before the
 * slashes is a colon.
 */
export function stripComments(source) {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/.*$/gm, "$1");
}

/**
 * What a TypeScript module actually provides once compiled.
 *
 * Returns runtime names and type-only names separately, because the whole
 * point is that they behave differently at runtime, and `opaque` for a
 * module that re-exports with `export *` — there the export list cannot be
 * known without following the chain, so the module is not judged at all
 * rather than judged wrongly.
 */
export function extractRuntimeExports(source) {
  const src = stripComments(source);
  const runtime = new Set();
  const typeOnly = new Set();
  const opaque = /^export\s+\*/m.test(src);

  for (const m of src.matchAll(/^export\s+(?:declare\s+)?(?:async\s+)?function\s*\*?\s*([A-Za-z_$][\w$]*)/gm)) {
    runtime.add(m[1]);
  }
  for (const m of src.matchAll(/^export\s+(?:abstract\s+)?class\s+([A-Za-z_$][\w$]*)/gm)) {
    runtime.add(m[1]);
  }
  // Before the const/let/var rule, and excluded from it below: `export
  // const enum X` is an enum named X, not a const named "enum".
  for (const m of src.matchAll(/^export\s+(?:const\s+)?enum\s+([A-Za-z_$][\w$]*)/gm)) {
    runtime.add(m[1]);
  }
  for (const m of src.matchAll(/^export\s+(?:const|let|var)\s+(?!enum\b)([A-Za-z_$][\w$]*)/gm)) {
    runtime.add(m[1]);
  }
  for (const m of src.matchAll(/^export\s+type\s+([A-Za-z_$][\w$]*)/gm)) typeOnly.add(m[1]);
  for (const m of src.matchAll(/^export\s+interface\s+([A-Za-z_$][\w$]*)/gm)) typeOnly.add(m[1]);
  if (/^export\s+default\b/m.test(src)) runtime.add("default");

  // export { a, b as c } and export type { d }
  for (const m of src.matchAll(/^export\s+(type\s+)?\{([^}]*)\}/gm)) {
    const listIsType = Boolean(m[1]);
    for (const raw of m[2].split(",")) {
      const part = raw.trim();
      if (!part) continue;
      const aliased = part.match(/(?:^|\s)as\s+([A-Za-z_$][\w$]*)$/);
      const name = aliased ? aliased[1] : part.replace(/^type\s+/, "").trim();
      if (!/^[A-Za-z_$][\w$]*$/.test(name)) continue;
      if (listIsType || /^type\s/.test(part)) typeOnly.add(name);
      else runtime.add(name);
    }
  }

  return { runtime, typeOnly, opaque };
}

/**
 * Which modules a suite loads, and under what binding.
 *
 * Two shapes exist in this repository and both are handled: a namespace
 * binding (`const fl = await loadTs("...")`) and a destructuring
 * (`const { getPlan } = await loadTs("...")`). The `\s*` before the string
 * matters — two call sites wrap the path onto the next line.
 */
export function extractLoadTsBindings(source) {
  const src = stripComments(source);
  const out = [];

  for (const m of src.matchAll(/const\s+([A-Za-z_$][\w$]*)\s*=\s*await\s+loadTs\(\s*"([^"]+)"/g)) {
    out.push({ kind: "namespace", binding: m[1], modulePath: m[2] });
  }
  for (const m of src.matchAll(/const\s*\{([^}]*)\}\s*=\s*await\s+loadTs\(\s*"([^"]+)"/g)) {
    const names = m[1]
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean)
      // `{ a: renamed }` — the imported name is what must exist.
      .map((s) => s.split(":")[0].trim())
      .filter((s) => /^[A-Za-z_$][\w$]*$/.test(s));
    if (names.length) out.push({ kind: "destructured", names, modulePath: m[2] });
  }

  return out;
}

/**
 * Blanks out string literals, keeping the quotes so nothing shifts.
 *
 * Without this the module path is itself scanned, and
 * `loadTs("src/lib/agents/agent-limits.ts")` reads as an access to
 * `limits.ts` — a member called "ts" that no module exports. Ten of the
 * first run's thirty-five hits were that, and every one of them was my
 * regex being wrong rather than the code.
 */
export function blankStrings(source) {
  return source
    .replace(/`(?:[^`\\]|\\.)*`/g, (s) => "`" + " ".repeat(Math.max(0, s.length - 2)) + "`")
    .replace(/"(?:[^"\\\n]|\\.)*"/g, (s) => '"' + " ".repeat(Math.max(0, s.length - 2)) + '"')
    .replace(/'(?:[^'\\\n]|\\.)*'/g, (s) => "'" + " ".repeat(Math.max(0, s.length - 2)) + "'");
}

/**
 * Every `binding.name` a suite reads.
 *
 * The lookbehind is the other half of the false-positive fix. A test that
 * writes `result.draft.config.language` is reading a field of its own
 * result object, not of the module bound to `config` — but `\bconfig\.`
 * matches it happily, because `.` is a word boundary. Requiring that the
 * binding not be preceded by a dot (nor by an identifier character)
 * restricts this to the binding itself.
 */
export function accessedMembers(source, binding) {
  const src = blankStrings(stripComments(source));
  const found = new Set();
  const re = new RegExp(`(?<![.\\w$])${binding.replace(/\$/g, "\\$")}\\.([A-Za-z_$][\\w$]*)`, "g");
  for (const m of src.matchAll(re)) found.add(m[1]);
  return found;
}

/**
 * The whole check, over a set of suites.
 *
 * `read` is injected so this can be exercised against fixtures — including
 * the historical failure — without touching the working tree.
 */
export function findExportDrift(testFiles, read) {
  const drift = [];

  for (const testFile of testFiles) {
    let testSrc;
    try {
      testSrc = read(testFile);
    } catch {
      continue;
    }

    for (const binding of extractLoadTsBindings(testSrc)) {
      let moduleSrc;
      try {
        moduleSrc = read(binding.modulePath);
      } catch {
        drift.push({
          testFile,
          modulePath: binding.modulePath,
          symbol: null,
          reason: "the module the suite loads does not exist",
        });
        continue;
      }

      const exports = extractRuntimeExports(moduleSrc);
      // A module that re-exports with `export *` cannot be judged from its
      // own text. Saying nothing is correct; guessing is not.
      if (exports.opaque) continue;

      const wanted =
        binding.kind === "namespace"
          ? [...accessedMembers(testSrc, binding.binding)]
          : binding.names;

      for (const name of wanted) {
        if (exports.runtime.has(name)) continue;
        drift.push({
          testFile,
          modulePath: binding.modulePath,
          symbol: name,
          reason: exports.typeOnly.has(name)
            ? `exported as a TYPE only — erased at runtime, so reading it gives undefined`
            : `not exported — reading it gives undefined, calling it throws TypeError`,
        });
      }
    }
  }

  return drift;
}
