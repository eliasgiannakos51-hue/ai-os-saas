// EVERY CLAUSE OF research-entries.test.mjs, BROKEN ON PURPOSE.
//
// The gate's whole claim is that an invented [E99] is caught as seriously
// as an invented [7]. That claim rests on four separate mechanisms — the
// entry regex, the per-namespace ceiling, the row filter and the flat
// summary's cap honesty — and each one of them can be broken in a way
// that leaves a report looking fully cited.
//
// THE MUTATION THAT MATTERS MOST is the first: deleting the entry regex
// puts the code back exactly as it shipped, where [E99] matched nothing
// and was neither passed nor failed. A gate that cannot go red for that
// is a gate that would have shipped it again.
//
// EVERY MUTATION IS AN EDIT OF REAL CODE, never an `if (false)`:
// scripts/check-mutation-markers.mjs fails on that literal, so such a
// mutation is "caught" by the marker gate without any behavioural check
// having looked at it.
//
// Run: node scripts/tests/research-entries.mutation.mjs
import { readFileSync } from "node:fs";
import { writeFileSync } from "./lib/sidecar-write.mjs";
import { execFileSync } from "node:child_process";

const GATE = "scripts/tests/research-entries.test.mjs";
const CITATIONS = "src/lib/verification/citations.ts";
const ENTRIES = "src/lib/research/entry-sources.ts";
const CONTEXT = "src/lib/research/research-context.ts";

/**
 * Green, or the gate's OWN first failing line.
 *
 * NAMING WHICH CHECK CAUGHT IT, which this file did not do and 57 of the
 * other 58 suites in this directory do. "CAUGHT" on its own says a
 * mutation turned something red; it does not say WHAT, and a mutation
 * caught by the wrong assertion is a mutation nobody has really tested —
 * the classic case being a syntax error that reddens every check at once
 * and looks like coverage.
 *
 * Read from the gate's stdout rather than predicted here: a label I write
 * is my belief about which check fires, and the point of running the
 * thing is to stop believing.
 */
function runGate() {
  try {
    execFileSync("node", [GATE], { stdio: "pipe" });
    return { green: true, firstFailure: null };
  } catch (e) {
    const out = String(e.stdout || "");
    const line = out.split("\n").find((l) => l.includes("FAIL"));
    return { green: false, firstFailure: (line ?? "").trim() };
  }
}
function gateIsGreen() {
  return runGate().green;
}

// THE SIDECAR IS SHARED NOW — scripts/tests/lib/sidecar-write.mjs.
//
// This file used to carry its own: a SIDECAR path, a healFromSidecar()
// and a writeFileSync(SIDECAR, ...) before every mutation. Five suites
// had that, all copied from one another, and fifty-five did not — which
// is how a killed run left `stripped.length === ch.length` deleted from
// lib/text/unicode-patterns.ts, a guard five writing systems depend on.
//
// The mechanism has one implementation now, behind the writeFileSync
// imported at the top of this file, and scripts/tests/mutation-sidecar.test.mjs
// proves it by killing a process with SIGKILL mid-mutation and reading
// the tree afterwards. Five copies of a safety net is five things to keep
// in step; the copies are gone rather than kept in step.
const MUTATIONS = [
  {
    name: "the entry regex is deleted — [E99] goes back to being INVISIBLE",
    file: CITATIONS,
    from: '  for (const m of prose.matchAll(/\\[E(\\d{1,3})\\]/g)) {\n    const n = Number(m[1]);\n    if (n >= 1) foundEntries.add(n);\n  }',
    to: "  void prose;",
  },
  {
    name: "an entry marker is judged against the WEB source count",
    file: CITATIONS,
    from: "    if (marker > entryCount) {\n      issues.push({ kind: \"dangling\", namespace: \"entry\", marker, sourceCount: entryCount });\n    }",
    to: "    if (marker > sourceCount) {\n      issues.push({ kind: \"dangling\", namespace: \"entry\", marker, sourceCount: entryCount });\n    }",
  },
  {
    name: "the annotator loses its E branch, so a dangling [E99] is never marked",
    file: CITATIONS,
    from: "    const ceiling = prefix === \"E\" ? entryCount : sourceCount;",
    to: "    void prefix;\n    const ceiling = sourceCount;",
  },
  {
    name: "the annotator marks VALID entry markers (the brief's 'must not cut' case)",
    file: CITATIONS,
    from: "    if (n < 1 || n <= ceiling) return whole;",
    to: "    if (n < 1) return whole;",
  },
  {
    name: "[E0] starts counting as a citation in a 1-based scheme",
    file: CITATIONS,
    from: "  for (const m of prose.matchAll(/\\[E(\\d{1,3})\\]/g)) {\n    const n = Number(m[1]);\n    if (n >= 1) foundEntries.add(n);\n  }",
    to: "  for (const m of prose.matchAll(/\\[E(\\d{1,3})\\]/g)) {\n    foundEntries.add(Number(m[1]));\n  }",
  },
  {
    name: "a dangling entry marker stops failing the check",
    file: CITATIONS,
    from: '    ok: !issues.some((i) => i.kind === "dangling"),',
    to: '    ok: !issues.some((i) => i.kind === "dangling" && i.namespace === "web"),',
  },
  // --- the entry list -------------------------------------------------
  {
    name: "rows with no id are numbered anyway, producing a citation nobody can follow",
    file: ENTRIES,
    from: "      if (!row.id) continue;",
    to: "      if (false && !row.id) continue;",
    // NOT an `if (false)` mutation of the forbidden kind: the marker gate
    // refuses `if (false)` in SOURCE files, and this restores the exact
    // shape being tested — a filter that no longer filters — rather than
    // disabling a behavioural check. Written as a real condition below.
    skip: true,
  },
  {
    name: "rows with no id are numbered anyway, producing a citation nobody can follow",
    file: ENTRIES,
    from: "      if (!row.id) continue;",
    to: "      if (row.id === undefined) continue;",
  },
  {
    name: "the entry link points at the module list instead of the record",
    file: ENTRIES,
    from: "        href: `${moduleHref(read.slug)}?record=${encodeURIComponent(row.id)}`,",
    to: "        href: moduleHref(read.slug),",
  },
  {
    name: "the model is told about an [E] namespace that does not exist",
    file: ENTRIES,
    from: "  if (entryCount === 0) return [];",
    to: "  if (entryCount < 0) return [];",
  },
  // --- the flat summary -----------------------------------------------
  {
    name: "a capped count is reported as a total",
    file: CONTEXT,
    from: "      const count = seen >= perModuleCap ? `at least ${seen}` : `${seen}`;",
    to: "      const count = `${seen}`;",
  },
  {
    name: "the 'most recent' date is the first row rather than the newest",
    file: CONTEXT,
    from: "      const last = dates.length ? new Date(Math.max(...dates)).toISOString().slice(0, 10) : \"undated\";",
    to: "      const last = dates.length ? new Date(dates[0]).toISOString().slice(0, 10) : \"undated\";",
  },
  {
    name: "empty modules stop being named, so the absence stops being a finding",
    file: CONTEXT,
    from: "    emptyModules.length > 0\n      ? `- Nothing recorded yet in: ${emptyModules.map((m) => m.title).join(\", \")}`\n      : null,",
    to: "    null,",
  },
  {
    name: "a module with undated rows gets a date invented for it",
    file: CONTEXT,
    from: ': "undated";',
    to: ': new Date(0).toISOString().slice(0, 10);',
  },
];

console.log("research-entries mutations\n");
if (!gateIsGreen()) {
  console.log("baseline: the gate is RED on the unmutated tree — fix that first.");
  process.exit(1);
}
console.log("baseline: the gate is GREEN on the unmutated tree");

let caught = 0;
const survivors = [];
const missed = [];

for (const m of MUTATIONS) {
  if (m.skip) continue;
  const before = readFileSync(m.file, "utf8");
  if (!before.includes(m.from)) {
    missed.push(`${m.name} — ANCHOR NOT FOUND in ${m.file}; the mutation never applied`);
    continue;
  }
  if (before.split(m.from).length - 1 !== 1) {
    missed.push(`${m.name} — anchor appears more than once in ${m.file}, so the edit is ambiguous`);
    continue;
  }
  writeFileSync(m.file, before.replace(m.from, m.to));

  const result = runGate();
  const red = !result.green;

  writeFileSync(m.file, before);

  if (red) {
    caught++;
    console.log(`  CAUGHT  ${m.name}`);
    console.log(`          -> ${result.firstFailure}`);
  } else {
    survivors.push(`${m.name} (${m.file}) — the gate stayed GREEN`);
    console.log(`  SURVIVED  ${m.name}`);
  }
}

console.log("");
if (!gateIsGreen()) {
  console.log("baseline: the gate is RED on the restored tree — a mutation was not put back.");
  process.exit(1);
}
console.log("baseline: the gate is green again on the restored tree\n");

const ran = MUTATIONS.filter((m) => !m.skip).length;
console.log(`${caught} of ${ran} mutations caught.`);
if (missed.length > 0) {
  console.log("\nMISSED ANCHORS (these mutations never ran):");
  for (const s of missed) console.log(`  - ${s}`);
}
if (survivors.length > 0) {
  console.log("\nSURVIVORS:");
  for (const s of survivors) console.log(`  - ${s}`);
}
if (missed.length > 0 || survivors.length > 0) process.exit(1);
console.log("Every clause of research-entries.test.mjs is load-bearing.");
