// WHICH FILES A ROUTE CAN REACH, FOLLOWING IMPORTS.
//
// Shared by the gate and its mutations so there is one answer to "is this
// component on a public page". Static and dynamic imports both count: a
// next/dynamic component is still in that route's client bundle, just in
// a later chunk.
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";

const EXTENSIONS = [".tsx", ".ts", "/index.tsx", "/index.ts"];

export function resolveImport(spec, fromFile) {
  let base = null;
  if (spec.startsWith("@/")) base = `src/${spec.slice(2)}`;
  else if (spec.startsWith(".")) {
    const dir = fromFile.split("/").slice(0, -1).join("/");
    base = `${dir}/${spec}`.replace(/\/\.\//g, "/");
    while (base.includes("/../")) base = base.replace(/[^/]+\/\.\.\//, "");
  } else return null; // a node_modules package
  for (const ext of EXTENSIONS) if (existsSync(base + ext)) return base + ext;
  return existsSync(base) && statSync(base).isFile() ? base : null;
}

/** Every routable file Next.js renders, anywhere under src/app. */
export function appEntries(root = "src/app") {
  const out = [];
  (function walk(dir) {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = `${dir}/${entry.name}`;
      if (entry.isDirectory()) walk(full);
      else if (/^(page|layout|template|error|not-found|loading)\.tsx$/.test(entry.name)) out.push(full);
    }
  })(root);
  return out.sort();
}

/** Everything reachable from these files by import, transitively. A file
 *  in `stopAt` is reached but not walked into: what only it imports is not
 *  reachable through it (scripts/tests/one-primary-action.test.mjs uses
 *  this for a screen a page draws INSTEAD of its body). */
export function reachableFrom(seeds, stopAt = new Set()) {
  const seen = new Set();
  const stack = [...seeds];
  while (stack.length > 0) {
    const file = stack.pop();
    if (seen.has(file)) continue;
    seen.add(file);
    if (stopAt.has(file)) continue;
    const source = readFileSync(file, "utf8");
    const specs = [
      ...[...source.matchAll(/from\s+["']([^"']+)["']/g)].map((m) => m[1]),
      ...[...source.matchAll(/import\(\s*["']([^"']+)["']\s*\)/g)].map((m) => m[1]),
    ];
    for (const spec of specs) {
      const target = resolveImport(spec, file);
      if (target && !seen.has(target)) stack.push(target);
    }
  }
  return seen;
}

export const isClientComponent = (file) =>
  /^\s*["']use client["']/m.test(readFileSync(file, "utf8"));
