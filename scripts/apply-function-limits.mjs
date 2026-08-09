#!/usr/bin/env node
/*
 * Applies MAX_FUNCTION_DURATION to every route's `maxDuration` literal.
 *
 * WHY A BUILD STEP AND NOT AN EXPRESSION. Next.js route segment config
 * must be a plain numeric literal — it is read by static analysis, not by
 * evaluating the module. Measured, not assumed: a build with each of the
 * four plausible expression forms produces
 *
 *   export const maxDuration = routeMaxDuration(800)          -> Unsupported node type "CallExpression"
 *   export const maxDuration = Number(process.env.X) || 800   -> Unsupported node type "BinaryExpression"
 *   export const maxDuration = process.env.X ? 60 : 800       -> Unsupported node type "ConditionalExpression"
 *   export const maxDuration = +(process.env.X ?? 800)        -> Unsupported node type "UnaryExpression"
 *
 * and in every case Next prints "can't recognize the exported `config`
 * field" and IGNORES the value — which is worse than an error, because the
 * build succeeds while the setting silently does nothing.
 *
 * So the literal is rewritten in place before the build. Each route
 * carries its own preferred ceiling in a marker comment:
 *
 *   export const maxDuration = 800; // @function-limit 800
 *
 * and this script sets the literal to min(preferred, MAX_FUNCTION_DURATION).
 * The marker is the source of truth for what the route WANTS; the literal
 * is what this deployment GETS.
 *
 * WHY IT MATTERS. Vercel validates maxDuration against the plan at build
 * time: a route asking for 800 on Hobby fails the build outright. This is
 * what makes the downgrade a config change rather than a code change.
 *
 * Modes:
 *   (default)  rewrite the literals for the current MAX_FUNCTION_DURATION
 *   --check    exit 1 if any literal exceeds the ceiling, change nothing
 *
 * Run: node scripts/apply-function-limits.mjs [--check]
 */
import { readFileSync, writeFileSync, readdirSync, statSync } from "node:fs";

const DEFAULT_MAX = 800;
const MIN_ALLOWED = 10;
const MAX_ALLOWED = 3600;

function resolveCeiling(raw) {
  if (raw === undefined || String(raw).trim() === "") return DEFAULT_MAX;
  const parsed = Number(raw);
  if (!Number.isInteger(parsed) || parsed < MIN_ALLOWED || parsed > MAX_ALLOWED) {
    console.warn(
      `[function-limits] MAX_FUNCTION_DURATION="${raw}" ignored ` +
        `(must be a whole number between ${MIN_ALLOWED} and ${MAX_ALLOWED}) — using ${DEFAULT_MAX}.`
    );
    return DEFAULT_MAX;
  }
  return parsed;
}

export function routeFiles(root = "src/app/api") {
  const out = [];
  (function walk(dir) {
    for (const entry of readdirSync(dir)) {
      const full = `${dir}/${entry}`;
      if (statSync(full).isDirectory()) walk(full);
      else if (entry === "route.ts") out.push(full);
    }
  })(root);
  return out.sort();
}

const MARKED = /export const maxDuration = (\d+); \/\/ @function-limit (\d+)/;

/** Pure: the new file contents, and what changed. Separated from disk so
 *  it can be unit tested against strings. */
export function applyToSource(source, ceiling) {
  const match = source.match(MARKED);
  if (!match) return { changed: false, source, current: null, preferred: null, applied: null };
  const current = Number(match[1]);
  const preferred = Number(match[2]);
  const applied = Math.min(preferred, ceiling);
  if (current === applied) return { changed: false, source, current, preferred, applied };
  return {
    changed: true,
    source: source.replace(MARKED, `export const maxDuration = ${applied}; // @function-limit ${preferred}`),
    current,
    preferred,
    applied,
  };
}

/** Every route that declares maxDuration WITHOUT a marker — those are the
 *  ones this script cannot manage, and they are only safe if they are
 *  already within the ceiling. */
export function unmanagedOverCeiling(files, ceiling, read = (f) => readFileSync(f, "utf8")) {
  const bad = [];
  for (const file of files) {
    const src = read(file);
    if (MARKED.test(src)) continue;
    const m = src.match(/export const maxDuration = (\d+)\s*;/);
    if (m && Number(m[1]) > ceiling) bad.push({ file, value: Number(m[1]) });
  }
  return bad;
}

// --- CLI --------------------------------------------------------------
// Guarded so the exported helpers above can be imported by the test
// without the script running.
if (import.meta.url === `file://${process.argv[1]}`) {
  const checkOnly = process.argv.includes("--check");
  const ceiling = resolveCeiling(process.env.MAX_FUNCTION_DURATION);
  const files = routeFiles();

  let changed = 0;
  let managed = 0;
  const violations = [];

  for (const file of files) {
    const src = readFileSync(file, "utf8");
    const result = applyToSource(src, ceiling);
    if (result.preferred === null) continue;
    managed++;
    if (result.applied > ceiling) violations.push(`${file}: ${result.applied} > ${ceiling}`);
    if (!result.changed) continue;
    if (checkOnly) {
      violations.push(`${file}: literal is ${result.current}, should be ${result.applied}`);
      continue;
    }
    writeFileSync(file, result.source);
    console.log(`  ${file}: ${result.current} -> ${result.applied} (wants ${result.preferred})`);
    changed++;
  }

  for (const { file, value } of unmanagedOverCeiling(files, ceiling)) {
    violations.push(`${file}: maxDuration ${value} exceeds ${ceiling} and has no @function-limit marker`);
  }

  if (violations.length > 0) {
    console.error(
      `\n[function-limits] ${checkOnly ? "check failed" : "PROBLEM"} at ceiling ${ceiling}s:\n  ` +
        violations.join("\n  ")
    );
    process.exit(1);
  }

  console.log(
    `[function-limits] ceiling ${ceiling}s — ${managed} managed route${managed === 1 ? "" : "s"}, ` +
      `${changed} rewritten.`
  );
}
