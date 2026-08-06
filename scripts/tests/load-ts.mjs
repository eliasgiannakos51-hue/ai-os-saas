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
      if (allowExternals) return true;
      throw new Error(`Unsupported external import in ${abs}: ${t}`);
    })
    .join("\n");

  out.push(stripped);
}

function bundleOf(entry, allowExternals) {
  const out = [];
  collect(path.resolve(entry), new Set(), out, allowExternals);
  return out.join("\n");
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
