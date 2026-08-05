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
import { readFileSync, existsSync } from "node:fs";
import path from "node:path";
import ts from "typescript";

const ROOT = process.cwd();
const cache = new Map();

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
function collect(file, seen, out) {
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
      if (resolved) collect(resolved, seen, out);
    }
  }

  const js = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
    fileName: abs,
  }).outputText;

  // Local imports are satisfied by concatenation, so their statements are
  // dropped. A bare-specifier import would be a real dependency and is not
  // supported here — the tests only cover dependency-free libs.
  const stripped = js
    .split("\n")
    .filter((line) => {
      const t = line.trim();
      if (!/^(import|export)\s.*from\s+["']/.test(t)) return true;
      const spec = t.match(/from\s+["']([^"']+)["']/)?.[1] ?? "";
      if (spec.startsWith("@/") || spec.startsWith(".")) return false;
      throw new Error(`Unsupported external import in ${abs}: ${t}`);
    })
    .join("\n");

  out.push(stripped);
}

export async function loadTs(entry) {
  const key = path.resolve(entry);
  if (cache.has(key)) return cache.get(key);

  const out = [];
  collect(key, new Set(), out);
  const bundle = out.join("\n");
  const mod = await import(
    "data:text/javascript;base64," + Buffer.from(bundle).toString("base64")
  );
  cache.set(key, mod);
  return mod;
}
