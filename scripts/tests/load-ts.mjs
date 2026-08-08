// Minimal TypeScript loader for the reproduction tests.
//
// The billing libs are plain functions with no runtime dependencies beyond
// each other, so they can be exercised without Next, without a bundler and
// without a database — which is the point. This transpiles a module and
// its `@/`-aliased imports on the fly and returns the live namespace.
//
// Deliberately not a general-purpose bundler: it handles the import forms
// these files actually use (named, type-only, relative and `@/`), and
// throws on anything else rather than silently mis-resolving.
import { readFileSync, existsSync, mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import ts from "typescript";

const ROOT = process.cwd();
const cache = new Map();

// Marker packages with no runtime API. `server-only` exists purely so the
// Next bundler can fail a build that imports a server module from a client
// one; outside Next its index.js throws on sight. Dropping the import
// changes nothing about the module's behavior — unlike stubbing a real
// dependency, which would be substituting our own logic for the app's.
const MARKER_ONLY_PACKAGES = new Set(["server-only", "client-only"]);

function resolveSpecifier(spec, fromFile) {
  let base;
  if (spec.startsWith("@/")) base = path.join(ROOT, "src", spec.slice(2));
  else if (spec.startsWith(".")) base = path.resolve(path.dirname(fromFile), spec);
  else return null; // node_modules — left to the real resolver

  for (const ext of [".ts", ".tsx", "/index.ts", ".js"]) {
    if (existsSync(base + ext)) return base + ext;
  }
  if (existsSync(base)) return base;
  throw new Error(`Cannot resolve ${spec} from ${fromFile}`);
}

/** Transpiles `file` and every local module it imports into one ES module. */
function collect(file, seen, out, allowExternals = false) {
  const abs = path.resolve(file);
  if (seen.has(abs)) return;
  seen.add(abs);

  const source = readFileSync(abs, "utf8");
  const sf = ts.createSourceFile(abs, source, ts.ScriptTarget.ES2022, true);

  // Depth-first: dependencies are emitted before the module that needs them,
  // so the concatenated bundle evaluates in a valid order.
  for (const stmt of sf.statements) {
    if (
      (ts.isImportDeclaration(stmt) || ts.isExportDeclaration(stmt)) &&
      stmt.moduleSpecifier &&
      ts.isStringLiteral(stmt.moduleSpecifier)
    ) {
      const resolved = resolveSpecifier(stmt.moduleSpecifier.text, abs);
      if (resolved) collect(resolved, seen, out, allowExternals);
    }
  }

  const js = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
    fileName: abs,
  }).outputText;

  // Local imports are satisfied by concatenation, so their statements are
  // dropped. A bare-specifier import is a real dependency: rejected in the
  // default mode (the billing libs genuinely have none, and a silent stub
  // would be a lie), kept verbatim when `allowExternals` is on — see
  // loadTsWithDeps.
  //
  // `node:` builtins are the one exception, and they are allowed in BOTH
  // modes. The rule they would otherwise trip exists to stop a build-gate
  // suite depending on node_modules — which is why
  // scripts/tests/billing-coverage.test.mjs forbids loadTsWithDeps in any
  // *.test.mjs. A Node builtin is not that: it needs no resolution, no
  // install and no bundle written to disk, and a data: URL imports it
  // directly (verified). Without this, a module that does nothing more
  // exotic than `import { createCipheriv } from "node:crypto"` could only
  // be tested by the mode that writes into node_modules — which would have
  // pushed the encryption tests for third-party OAuth tokens OUT of the
  // build gate, i.e. exactly the wrong place for them.
  const stripped = js
    .split("\n")
    .filter((line) => {
      const t = line.trim();
      // `import "server-only";` has no `from` clause, so the test below
      // never sees it. Match the side-effect form explicitly.
      const bare = t.match(/^import\s+["']([^"']+)["'];?$/)?.[1];
      if (bare) return !MARKER_ONLY_PACKAGES.has(bare) && !bare.startsWith("@/") && !bare.startsWith(".");
      if (!/^(import|export)\s.*from\s+["']/.test(t)) return true;
      const spec = t.match(/from\s+["']([^"']+)["']/)?.[1] ?? "";
      if (spec.startsWith("@/") || spec.startsWith(".")) return false;
      if (spec.startsWith("node:")) return true;
      if (allowExternals) return true;
      throw new Error(`Unsupported external import in ${abs}: ${t}`);
    })
    .join("\n");

  out.push(stripped);
}

// External imports are HOISTED AND MERGED, not left where they were.
//
// Concatenating two modules that both `import { ... } from "node:crypto"`
// produces two import statements in one module scope, and any binding they
// share is a hard SyntaxError: "Identifier 'randomBytes' has already been
// declared". That is a property of the bundling, not of the code — both
// files are perfectly valid on their own — so it is fixed here rather than
// by contorting the modules under test to suit the test harness.
//
// Merging per specifier also keeps the default and namespace forms
// working: `import Anthropic from "@anthropic-ai/sdk"` in two files
// collapses to one binding rather than colliding.
function hoistExternalImports(chunks) {
  const named = new Map(); // specifier -> Set of "a" | "a as b"
  const defaults = new Map(); // specifier -> local name
  const bare = new Set();
  const body = [];

  const IMPORT_RE = /^import\s+(?:([\w$]+)\s*,\s*)?(?:\{([^}]*)\}|([\w$]+))?\s*from\s*["']([^"']+)["'];?$/;

  for (const chunk of chunks) {
    for (const line of chunk.split("\n")) {
      const trimmed = line.trim();
      const bareMatch = trimmed.match(/^import\s+["']([^"']+)["'];?$/);
      if (bareMatch) {
        bare.add(bareMatch[1]);
        continue;
      }
      const m = trimmed.match(IMPORT_RE);
      if (!m) {
        body.push(line);
        continue;
      }
      const [, defaultWithNamed, namedList, defaultOnly, specifier] = m;
      const defaultName = defaultWithNamed || defaultOnly;
      if (defaultName) defaults.set(specifier, defaultName);
      if (namedList) {
        const set = named.get(specifier) ?? new Set();
        for (const part of namedList.split(",")) {
          const name = part.trim();
          if (name) set.add(name);
        }
        named.set(specifier, set);
      }
      if (!defaultName && !namedList) bare.add(specifier);
    }
  }

  const header = [];
  for (const specifier of bare) header.push(`import "${specifier}";`);
  const specifiers = new Set([...named.keys(), ...defaults.keys()]);
  for (const specifier of specifiers) {
    const defaultName = defaults.get(specifier);
    const names = [...(named.get(specifier) ?? [])];
    const clause = [defaultName, names.length ? `{ ${names.join(", ")} }` : null]
      .filter(Boolean)
      .join(", ");
    header.push(`import ${clause} from "${specifier}";`);
  }
  return [...header, ...body].join("\n");
}

function bundleOf(entry, allowExternals) {
  const out = [];
  collect(path.resolve(entry), new Set(), out, allowExternals);
  // Hoisted in both modes: two concatenated modules that each import
  // `node:crypto` would otherwise redeclare a shared binding and fail to
  // parse.
  return hoistExternalImports(out);
}

export async function loadTs(entry) {
  const key = path.resolve(entry);
  if (cache.has(key)) return cache.get(key);
  const mod = await import(
    "data:text/javascript;base64," + Buffer.from(bundleOf(entry, false)).toString("base64")
  );
  cache.set(key, mod);
  return mod;
}

/**
 * Same transpile, but external (node_modules) imports are KEPT — so a
 * module that genuinely depends on a real package can be exercised as
 * itself rather than as a rewritten copy of itself.
 *
 * A data: URL can't resolve bare specifiers, so the bundle is written
 * inside node_modules/, where Node's normal upward resolution finds the
 * project's real dependencies. Nothing about the module under test is
 * substituted: only `server-only`, a marker package with no runtime API,
 * is dropped.
 */
export async function loadTsWithDeps(entry) {
  const key = `deps:${path.resolve(entry)}`;
  if (cache.has(key)) return cache.get(key);

  const dir = path.join(ROOT, "node_modules", ".ionexa-test-bundles");
  mkdirSync(dir, { recursive: true });
  const file = path.join(dir, `${path.basename(entry).replace(/\W/g, "_")}.mjs`);
  writeFileSync(file, bundleOf(entry, true));
  // pathToFileURL, not the bare path. `import("/abs/path.mjs?v=1")` is
  // accepted on POSIX Node 22 but is not a valid module specifier — the
  // query string makes it look like a bare specifier to stricter
  // resolvers, and Node has been tightening this. A file: URL is the
  // documented form and behaves the same everywhere.
  const url = new URL(pathToFileURL(file));
  url.searchParams.set("v", String(process.pid));
  const mod = await import(url.href);
  cache.set(key, mod);
  return mod;
}
