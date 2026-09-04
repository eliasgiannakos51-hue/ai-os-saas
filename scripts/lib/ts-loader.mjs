// A REAL MODULE LOADER FOR THE APP'S TYPESCRIPT, for scripts that need
// the whole dependency graph with real module semantics.
//
// scripts/tests/load-ts.mjs bundles a file and its `@/` imports into ONE
// scope, which is fine for the small, flat libraries the gates exercise
// and wrong for anything that reaches the provider layer: two modules
// there each declare a top-level `const BASE`, and a bundle of both is a
// SyntaxError before a single line runs. This is the alternative — every
// module stays its own module — built on Node's module.register() hooks
// and sucrase (already a dependency) for the TypeScript-to-JavaScript
// step. Types are stripped, nothing is type-checked here: `tsc` is the
// type gate, this is only a way to execute.
//
//   import { register } from "node:module";
//   register("./lib/ts-loader.mjs", import.meta.url);
//   const mod = await import("../src/lib/agents/agent-runner.ts");
//
// `@/x` resolves to src/x; extensionless relative imports try .ts, .tsx,
// /index.ts; `server-only` and `client-only` are the empty modules they
// are outside Next; JSON imports are turned into a default export.
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { transform } from "sucrase";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const MARKER_ONLY = new Set(["server-only", "client-only"]);
const EXTS = [".ts", ".tsx", ".mts", ".js", ".mjs", ".json"];

function resolveFile(base) {
  if (existsSync(base) && !isDir(base)) return base;
  for (const ext of EXTS) if (existsSync(base + ext)) return base + ext;
  for (const ext of EXTS) if (existsSync(path.join(base, "index" + ext))) return path.join(base, "index" + ext);
  return null;
}
function isDir(p) {
  try {
    return readFileSync(p) && false;
  } catch (e) {
    return e.code === "EISDIR";
  }
}

export async function resolve(specifier, context, next) {
  if (MARKER_ONLY.has(specifier)) return { url: "ionexa-marker:" + specifier, shortCircuit: true };
  let base = null;
  if (specifier.startsWith("@/")) base = path.join(ROOT, "src", specifier.slice(2));
  else if ((specifier.startsWith("./") || specifier.startsWith("../")) && context.parentURL?.startsWith("file:")) {
    const parent = fileURLToPath(context.parentURL);
    if (/\.(tsx?|mts)$/.test(parent)) base = path.resolve(path.dirname(parent), specifier);
  }
  if (base) {
    const file = resolveFile(base);
    if (file) return { url: pathToFileURL(file).href, shortCircuit: true };
  }
  return next(specifier, context);
}

export async function load(url, context, next) {
  if (url.startsWith("ionexa-marker:")) return { format: "module", source: "export {};", shortCircuit: true };
  if (url.startsWith("file:") && /\.(tsx?|mts)$/.test(url)) {
    const file = fileURLToPath(url);
    const src = readFileSync(file, "utf8");
    const { code } = transform(src, {
      transforms: file.endsWith(".tsx") ? ["typescript", "jsx"] : ["typescript"],
      jsxRuntime: "automatic",
      disableESTransforms: true,
      filePath: file,
    });
    return { format: "module", source: code, shortCircuit: true };
  }
  if (url.startsWith("file:") && url.endsWith(".json") && context.importAttributes?.type !== "json") {
    // A TS file importing JSON without `with { type: "json" }`, which
    // Next allows and plain Node does not: hand it over as a module.
    const text = readFileSync(fileURLToPath(url), "utf8");
    return { format: "module", source: `export default ${text};`, shortCircuit: true };
  }
  return next(url, context);
}
