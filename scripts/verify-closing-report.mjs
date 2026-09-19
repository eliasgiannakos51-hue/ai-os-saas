#!/usr/bin/env node
/*
 * DOES THE CLOSING REPORT STILL SAY WHAT THE TREE SAYS?
 *
 * CLAUDE.md's rule: every number in a document either carries its date
 * or is produced by the thing that prints it. docs/v5-closing-report.md
 * does the first — "every number here was measured on 2026-09-18" — and
 * that is the right shape for a record of one day.
 *
 * But the report is also the thing the owner schedules from, and it
 * names a gate and a count on nearly every row. A count that has moved
 * is not a lie in a dated document; it is a row the reader cannot use.
 * docs/v5-list.md was wrong in four places for the same reason, all in
 * the same direction — work that had been done, described as still to
 * do — and it cost three rounds of scheduling.
 *
 * So: parse every `<gate>.test.mjs` — N/M claim out of the report, RUN
 * that gate, and print AGREES, MOVED or RED. It re-derives rather than
 * asserting, because the report is a record: a moved number wants a
 * dated correction, not a red build.
 *
 * Run: node scripts/verify-closing-report.mjs
 *      node scripts/verify-closing-report.mjs docs/v4-closing-report.md
 */
import { readFileSync, existsSync } from "node:fs";
import { execFileSync } from "node:child_process";

const DOC = process.argv[2] ?? "docs/v5-closing-report.md";
const DIR = "scripts/tests";

/** Every "`x.test.mjs` — N/M" or "`x.test.mjs` N/M" in the document. */
export function claims(md) {
  const out = [];
  for (const m of md.matchAll(/`([a-z0-9-]+\.test\.mjs)`[^\S\n]*(?:—|-)?[^\S\n]*(\d+)\/(\d+)/g)) {
    out.push({ gate: m[1], claimed: Number(m[2]), of: Number(m[3]) });
  }
  return out;
}

/** What the gate prints today: passed and failed. */
export function run(gate) {
  const file = `${DIR}/${gate}`;
  if (!existsSync(file)) return { missing: true };
  let out;
  let status = 0;
  try {
    out = execFileSync(process.execPath, [file], { encoding: "utf8", stdio: "pipe" });
  } catch (e) {
    out = String(e.stdout ?? "") + String(e.stderr ?? "");
    status = e.status ?? 1;
  }
  const m =
    /ALL PASS:\s*(\d+) passed,\s*(\d+) failed/.exec(out) ??
    /(\d+) passed,\s*(\d+) (?:failed|FAILED)/.exec(out) ??
    /(\d+) checks? passed/.exec(out);
  if (!m) return { unparsed: true, status };
  return { passed: Number(m[1]), failed: Number(m[2] ?? 0), status };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const md = readFileSync(DOC, "utf8");
  const found = claims(md);
  const seen = new Map();
  for (const c of found) if (!seen.has(c.gate)) seen.set(c.gate, c);
  const rows = [...seen.values()];

  console.log(`== ${DOC}: ${found.length} counted claims, ${rows.length} distinct gates ==\n`);
  // A PARSER THAT FINDS NOTHING PRINTS "0 agree · 0 moved · 0 red" and
  // exits clean, which reads exactly like a verified document. That is
  // the shape CLAUDE.md records under db-migrations' three scrapers.
  if (rows.length < 10) {
    console.log(`  ONLY ${rows.length} CLAIMS FOUND — the parser, not the document. A closing`);
    console.log("  report names a gate and a count on most of its rows; finding almost");
    console.log("  none means the shape it is looking for has changed.");
    process.exit(1);
  }
  const moved = [];
  const red = [];
  const gone = [];
  for (const c of rows) {
    const r = run(c.gate);
    if (r.missing) {
      gone.push(c);
      console.log(`  GONE    ${c.gate.padEnd(34)} the report names a gate that is not there`);
      continue;
    }
    if (r.unparsed) {
      console.log(`  ?       ${c.gate.padEnd(34)} ran, but prints no count this can read`);
      continue;
    }
    if (r.failed > 0 || r.status !== 0) {
      red.push({ ...c, ...r });
      console.log(`  RED     ${c.gate.padEnd(34)} ${r.passed} passed, ${r.failed} FAILED`);
      continue;
    }
    if (r.passed !== c.claimed) {
      moved.push({ ...c, ...r });
      console.log(`  MOVED   ${c.gate.padEnd(34)} report says ${c.claimed}, today ${r.passed}`);
      continue;
    }
    console.log(`  AGREES  ${c.gate.padEnd(34)} ${r.passed}/${r.passed}`);
  }

  console.log(
    `\n  ${rows.length - moved.length - red.length - gone.length} agree · ` +
      `${moved.length} moved · ${red.length} red · ${gone.length} gone`
  );
  console.log(
    "\n  A MOVED ROW IS NOT A BUG, it is a number that has aged. The report\n" +
      "  is a record of one day and says so. What a moved row costs is the\n" +
      "  reader: they cannot tell a figure that grew from one that rotted\n" +
      "  without re-running it, which is what this does."
  );
  if (red.length > 0) process.exitCode = 1;
}
