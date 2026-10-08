// A ROUTE WHOSE BOUND LIVES IN A SHARED STEP IT CALLS.
//
// The game routes (package 26) reach the model, hold credits and ask the
// breaker through one function, lib/games/charge.ts chargedGameStep, so
// that four paid steps cannot drift apart in how they charge. A gate that
// reads only the route file sees none of it, and calls the routes free,
// unbounded and unguarded — four gates did, on 2026-10-08.
//
// The answer is one hop, and only one: a route counts as doing X when it
// CALLS a function it imports from a src/lib module whose OWN BODY does
// X. The function, not the module — lib/billing/credits.ts both defines
// the spending calls and exports reads, and a route that only reads a
// balance has charged nobody. The body runs from `export … function NAME`
// to the next top-level export, comments stripped.
//
// Run: imported by feature-catalog.test.mjs, rate-limits.test.mjs,
// route-spend-inventory.test.mjs and route-write-bound.test.mjs.
import { existsSync, readFileSync } from "node:fs";

const strip = (t) => t.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

const cache = new Map();
/** Every exported function of a module, by name, with its body (signature's name cut off). */
export function exportedBodies(file) {
  if (cache.has(file)) return cache.get(file);
  const bodies = new Map();
  if (existsSync(file)) {
    const text = strip(readFileSync(file, "utf8"));
    for (const m of text.matchAll(/export (?:async )?function (\w+)([\s\S]*?)(?=\nexport |$)/g)) bodies.set(m[1], m[2]);
  }
  cache.set(file, bodies);
  return bodies;
}

/**
 * The names a route imports from src/lib and calls, whose own body matches
 * `pattern`. Empty when there are none.
 */
export function callsThroughImport(src, pattern) {
  const code = strip(src);
  const body = code.replace(/^import [^;]+;$/gm, "");
  const found = [];
  for (const [, names, mod] of code.matchAll(/import \{([^}]+)\} from "@\/(lib\/[^"]+)";/g)) {
    const bodies = exportedBodies(`src/${mod}.ts`);
    for (const raw of names.split(",")) {
      const name = raw.replace(/^\s*type\s+/, "").split(/\s+as\s+/).pop().trim();
      const original = raw.replace(/^\s*type\s+/, "").split(/\s+as\s+/)[0].trim();
      if (!name || !bodies.has(original)) continue;
      if (new RegExp(pattern.source).test(bodies.get(original)) && new RegExp(`\\b${name}\\s*\\(`).test(body)) found.push(original);
    }
  }
  return found;
}
