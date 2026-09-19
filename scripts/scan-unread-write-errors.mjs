#!/usr/bin/env node
/*
 * A WRITE WHOSE FAILURE NOBODY READS.
 *
 * supabase-js does not throw on a database error — it returns one in
 * `.error`. So `await supabase.from("x").update({...})` is a statement
 * that cannot fail as far as the surrounding code is concerned, and a
 * row-level-security denial, a missing column or a constraint violation
 * all read exactly like success.
 *
 * This is the population behind six of the seven defects found in the
 * multi-write sweep of 2026-09-17/18, and it is REPORTED, not gated: 25
 * of the 139 route writes are in it today and most of them are
 * legitimately best-effort — a `status: "failed"` write on a path that is
 * already answering an error, where reading the result would change
 * nothing the route does. Turning it into a zero-offender register means
 * a written reason per site, which is a round of work rather than a
 * check. docs/v6-list.md §14 carries that decision.
 *
 * WHAT COUNTS AS READ. The call's result is destructured (or bound whole)
 * and the bound name appears again within the next 2,000 characters. That
 * catches `if (error) return`, `if (error) throw`, `logApiError(..., err)`
 * and a result passed onward; it does NOT catch a read further away than
 * that, so the number is an over-count by construction rather than an
 * under-count. Four of the sites it lists were read by hand on 2026-09-18
 * and found correct for reasons the scan cannot see — see
 * scripts/tests/reservation-lifecycle.test.mjs §6.
 *
 * Line numbers are the real ones: comments are MASKED with spaces rather
 * than deleted, so nothing shifts.
 *
 * Run: node scripts/scan-unread-write-errors.mjs
 *      node scripts/scan-unread-write-errors.mjs --json
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";

const ROOT = "src/app";
const LOOKAHEAD = 2000;

const routes = [];
(function walk(dir) {
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) walk(full);
    else if (entry === "route.ts") routes.push(full.replace(/\\/g, "/"));
  }
})(ROOT);
routes.sort();

const mask = (t) =>
  t
    .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, " "))
    .replace(/^([ \t]*)\/\/.*$/gm, (m, indent) => indent + " ".repeat(Math.max(0, m.length - indent.length)));

const WRITE = /\.from\(\s*"([a-z_0-9]+)"\s*\)\s*\)?\s*\n?\s*\.(insert|update|upsert|delete)\s*\(/g;

let total = 0;
const offenders = [];

for (const file of routes) {
  const src = mask(readFileSync(file, "utf8"));
  for (const m of src.matchAll(WRITE)) {
    total++;
    const line = src.slice(0, m.index).split("\n").length;
    const before = src.slice(Math.max(0, m.index - 300), m.index);
    // The assignment this call is the right-hand side of. Two shapes:
    // `= await supabase` (a client identifier) and `= await` (the call
    // chain starts on the next line).
    const assigned =
      /(?:const|let|var)\s*(\{[^{}]*\}|[A-Za-z_$][\w$]*)\s*=\s*await\s+[A-Za-z_$][\w$]*\s*$/.exec(before) ||
      /(?:const|let|var)\s*(\{[^{}]*\}|[A-Za-z_$][\w$]*)\s*=\s*await\s*$/.exec(before);

    let name = null;
    if (assigned) {
      const bound = assigned[1];
      if (bound.startsWith("{")) {
        const err = /(?:^\{|,)\s*error\s*(?::\s*([A-Za-z_$][\w$]*))?\s*(?:,|\})/.exec(bound);
        if (err) name = err[1] || "error";
      } else {
        name = bound;
      }
    }
    if (!name) {
      offenders.push({ file, line, table: m[1], op: m[2], why: "the result is discarded" });
      continue;
    }

    // Past the call's own parentheses and the rest of the chain.
    let j = m.index;
    let depth = 0;
    let open = false;
    for (; j < src.length; j++) {
      if (src[j] === "(") {
        depth++;
        open = true;
      } else if (src[j] === ")") {
        depth--;
        if (open && depth === 0) {
          j++;
          break;
        }
      }
    }
    while (j < src.length && src[j] !== ";") j++;

    const after = src.slice(j, j + LOOKAHEAD);
    const escaped = name.replace(/\$/g, "\\$");
    if (!new RegExp(`(^|[^\\w$.])${escaped}([^\\w$]|$)`).test(after)) {
      offenders.push({ file, line, table: m[1], op: m[2], why: `binds \`${name}\`, never reads it` });
    }
  }
}

if (process.argv.includes("--json")) {
  console.log(JSON.stringify({ routes: routes.length, writes: total, unread: offenders.length, offenders }, null, 2));
  process.exit(0);
}

const byFile = new Map();
for (const o of offenders) {
  const key = o.file.replace(`${ROOT}/api/`, "").replace("/route.ts", "");
  byFile.set(key, [...(byFile.get(key) ?? []), o]);
}
for (const [key, list] of [...byFile].sort((a, b) => b[1].length - a[1].length || a[0].localeCompare(b[0]))) {
  console.log(`  ${String(list.length).padStart(2)}  ${key}`);
  for (const o of list) console.log(`        ${o.table}.${o.op} @${o.line} — ${o.why}`);
}
console.log(
  `\n  ${routes.length} routes · ${total} writes · ${offenders.length} whose error is never read ` +
    `(${((offenders.length / total) * 100).toFixed(0)}%)`
);
console.log("  REPORTED, NOT GATED — see this file's header for why.");
