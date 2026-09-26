#!/usr/bin/env node
/**
 * A HOOK THAT DOES NOT RUN EVERY RENDER — the defect React error #310 is.
 *
 * Run: node scripts/scan-conditional-hooks.mjs [dir ...]
 *
 * #310 is "Rendered more hooks than during the previous render", read
 * 2026-09-26 from React's own published error-code table,
 * the codes.json that facebook/react publishes under error-codes
 * — a file in the React repository, not in this one. It has exactly one
 * cause: on some render a component called a hook it had
 * not called before. In practice that is one of three shapes —
 *
 *   1. a hook inside an `if`, a `&&`, a ternary or a loop
 *   2. a hook AFTER an early `return`, so it is skipped when the guard fires
 *   3. a hook inside a callback, a `.map()` or a nested function
 *
 * WHY A SCAN RATHER THAN THE LINTER. eslint-plugin-react-hooks catches all
 * three and this repository runs it — `next build` emits it as a Warning,
 * and a Warning never fails a build (CLAUDE.md's own note about the CI
 * build says so). So the rule is enforced by nobody. This prints the
 * findings as findings.
 *
 * IT IS A HEURISTIC AND PRINTS ITS OWN PRECISION RATHER THAN A VERDICT.
 * It reads text, not an AST, so a hook on a line that merely follows a
 * `return` inside an unrelated nested function reads the same as a real
 * early return. That is why nothing here exits non-zero on a finding: the
 * companion gate for this repository is "measure, then judge", and a
 * detector whose precision is unknown must not be a gate. Confirm a
 * candidate by reading the component, never by trusting this list.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, extname } from "node:path";

const ROOTS = process.argv.slice(2).length ? process.argv.slice(2) : ["src"];
const HOOK = /\b(use[A-Z]\w*)\s*\(/;
const DECLARES_COMPONENT = /^(export\s+)?(default\s+)?function\s+[A-Z]|^(export\s+)?const\s+[A-Z]\w*\s*[:=].*=>/;

function walk(dir, out = []) {
  for (const e of readdirSync(dir)) {
    const p = join(dir, e);
    if (statSync(p).isDirectory()) {
      if (e === "node_modules" || e === ".next") continue;
      walk(p, out);
    } else if ([".tsx", ".ts"].includes(extname(p))) out.push(p);
  }
  return out;
}

const findings = [];
let filesRead = 0;
let hookCalls = 0;

for (const root of ROOTS) {
  for (const file of walk(root)) {
    const src = readFileSync(file, "utf8");
    if (!HOOK.test(src)) continue;
    filesRead++;
    const lines = src.split("\n");
    let depthAfterReturn = null; // brace depth at which an early return was seen
    let depth = 0;
    let inComponent = false;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const code = line.replace(/\/\/.*$/, "");
      if (DECLARES_COMPONENT.test(code.trim())) {
        inComponent = true;
        depthAfterReturn = null;
      }
      const opens = (code.match(/\{/g) ?? []).length;
      const closes = (code.match(/\}/g) ?? []).length;

      // An early return at the component's own top level.
      if (inComponent && /^\s*return\b/.test(code) && depth === 1) depthAfterReturn = depth;

      const m = code.match(HOOK);
      if (m && !/^\s*(\/\/|\*)/.test(line)) {
        hookCalls++;
        const name = m[1];
        // Shape 1: a hook on a line that is itself a condition or a loop.
        if (/\b(if|for|while|switch)\s*\([^)]*$/.test(code) || /\?\s*use[A-Z]|&&\s*use[A-Z]/.test(code)) {
          findings.push({ file, line: i + 1, name, shape: "inside a condition or loop" });
        } else if (depthAfterReturn !== null && depth >= 1) {
          // Shape 2: after an early return at the component's top level.
          findings.push({ file, line: i + 1, name, shape: "after an early return" });
        } else if (depth > 1 && inComponent) {
          // Shape 3: nested deeper than the component body.
          findings.push({ file, line: i + 1, name, shape: `nested ${depth} braces deep` });
        }
      }
      depth += opens - closes;
      if (depth <= 0) {
        depth = 0;
        inComponent = false;
        depthAfterReturn = null;
      }
    }
  }
}

console.log(`conditional-hook scan: ${filesRead} file(s) with hooks, ${hookCalls} hook call(s)\n`);
if (findings.length === 0) {
  console.log("  no candidate found.");
} else {
  const byShape = new Map();
  for (const f of findings) byShape.set(f.shape, (byShape.get(f.shape) ?? 0) + 1);
  for (const [shape, n] of [...byShape].sort((a, b) => b[1] - a[1])) console.log(`  ${String(n).padStart(4)}  ${shape}`);
  console.log("");
  for (const f of findings.slice(0, 40)) {
    console.log(`  ${f.file.replace(/^src\//, "")}:${f.line}  ${f.name}  — ${f.shape}`);
  }
  if (findings.length > 40) console.log(`  ... and ${findings.length - 40} more`);
}
console.log("\nThis REPORTS; it does not gate. It reads text rather than an AST, so a");
console.log("`return` inside a nested function reads like an early return. Confirm any");
console.log("candidate by reading the component — never by trusting this list.");
