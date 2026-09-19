#!/usr/bin/env node
/*
 * CAN order-stability.test.mjs SEE THE DEFECT IT WAS WRITTEN FOR?
 *
 * Its first version could not. The gate holds "no loop over an unsorted
 * listing assigns into a keyed collection" at zero, and putting the
 * real defect back — rpc-signatures losing the `.sort()` on its
 * migration listing — left it GREEN. The key-assignment detector was
 * `\w+\[[^\]]+\]\s*=`, and the line it exists for is `sigs[m[1]] = …`:
 * a nested bracket, where a class that excludes `]` stops at the inner
 * one and never reaches the `=`.
 *
 * So the first mutant below is that exact line, and it is the point of
 * the file.
 *
 * Run: node scripts/tests/order-stability.mutation.mjs
 */
import { readFileSync } from "node:fs";
import { writeFileSync } from "./lib/sidecar-write.mjs";
import { execFileSync } from "node:child_process";

const GATE = "scripts/tests/order-stability.test.mjs";
const RPC = "scripts/tests/rpc-signatures.test.mjs";
const SCAN = "scripts/scan-order-dependence.mjs";
const PRELOAD = "scripts/tests/lib/reverse-readdir.cjs";
const PKG = "package.json";

const TARGETS = [GATE, RPC, SCAN, PRELOAD, PKG];

const MUTANTS = [
  {
    // THE DEFECT, PUT BACK. Under a reversed listing this really does
    // flip rpc-signatures from green to red, reporting two call sites
    // as passing arguments the function does not take. Both are in the
    // current signature.
    name: "the migration listing loses its sort, so last-writer-wins again",
    file: RPC,
    from: 'for (const f of [...readdirSync("supabase/migrations")].sort()) {',
    to: 'for (const f of readdirSync("supabase/migrations")) {',
    expect: "assigns into a keyed collection",
  },
  {
    // THE DETECTOR'S OWN BLIND SPOT, put back: the class that cannot
    // reach past a nested bracket.
    name: "the key-assignment detector stops at a nested bracket again",
    file: GATE,
    from: "lastWriterWins: /\\w+\\[[^=;\\n]{1,80}\\]\\s*=(?!=)/.test(body) || /\\.set\\(/.test(body),",
    to: "lastWriterWins: /\\w+\\[[^\\]]+\\]\\s*=(?!=)/.test(body) || /\\.set\\(/.test(body),",
    // With the narrow class restored the gate still finds loops, so it
    // stays green on the unmutated tree — the hole only shows with the
    // defect present. Both edits together are the honest mutant.
    edits: [
      {
        file: GATE,
        from: "lastWriterWins: /\\w+\\[[^=;\\n]{1,80}\\]\\s*=(?!=)/.test(body) || /\\.set\\(/.test(body),",
        to: "lastWriterWins: /\\w+\\[[^\\]]+\\]\\s*=(?!=)/.test(body) || /\\.set\\(/.test(body),",
      },
      {
        file: RPC,
        from: 'for (const f of [...readdirSync("supabase/migrations")].sort()) {',
        to: 'for (const f of readdirSync("supabase/migrations")) {',
      },
    ],
    expect: "assigns into a keyed collection",
    inverted: true,
  },
  {
    // THE FLOOR. A scan that finds no loops passes "none of them are
    // unsorted" by finding none.
    name: "the loop scan returns nothing",
    file: GATE,
    from: "export function listingLoops() {\n  const out = [];",
    to: "export function listingLoops() {\n  const out = [];\n  if (out.length === 0) return [];",
    expect: "for-of loops over a directory listing",
  },
  {
    // AND THE CONTROL RUN, which is what keeps the empirical scan from
    // reporting a pid as a file order.
    name: "the scan drops its control run",
    file: SCAN,
    from: "    const control = runGate(file);",
    to: "    const control = a;",
    expect: "a pid is not read as an order",
  },
  {
    name: "the preload stops reversing the async listing",
    file: PRELOAD,
    from: "fs.promises.readdir = async function readdir(...args) {",
    to: "fs.promises.readdirDisabled = async function readdir(...args) {",
    expect: "reverses all three readdir shapes",
  },
  {
    name: "the empirical scan stops being reachable as a command",
    file: PKG,
    from: '"test:order": "node scripts/scan-order-dependence.mjs",',
    to: '"test:order:disabled": "node scripts/scan-order-dependence.mjs",',
    expect: "reachable as a command",
  },
];

function runGate() {
  try {
    execFileSync(process.execPath, [GATE], { encoding: "utf8", stdio: "pipe" });
    return { green: true, failed: [] };
  } catch (e) {
    const out = String(e.stdout ?? "") + String(e.stderr ?? "");
    return { green: false, failed: [...out.matchAll(/^ {2}- (.+)$/gm)].map((m) => m[1]) };
  }
}

console.log("order-stability mutations\n");

const originals = new Map(TARGETS.map((f) => [f, readFileSync(f, "utf8")]));
const restoreAll = () => {
  for (const [file, text] of originals) writeFileSync(file, text);
};

let caught = 0;
const missed = [];
try {
  const base = runGate();
  console.log(`baseline: the gate is ${base.green ? "GREEN" : "RED"} on the unmutated tree`);
  if (!base.green) {
    console.log(`\nBASELINE IS RED — nothing below would mean anything.\n  ${base.failed.join("\n  ")}`);
    process.exit(1);
  }

  for (const m of MUTANTS) {
    const edits = m.edits ?? [{ file: m.file, from: m.from, to: m.to }];
    const stale = edits.filter((e) => !originals.get(e.file ?? m.file).includes(e.from));
    if (stale.length > 0) {
      missed.push({ ...m, why: `the mutation target no longer exists in ${stale.map((e) => e.file ?? m.file).join(", ")}` });
      console.log(`  STALE   ${m.name}`);
      continue;
    }
    const byFile = new Map();
    for (const e of edits) {
      const file = e.file ?? m.file;
      byFile.set(file, (byFile.get(file) ?? originals.get(file)).replace(e.from, () => e.to));
    }
    for (const [file, text] of byFile) writeFileSync(file, text);
    let result;
    try {
      result = runGate();
    } finally {
      restoreAll();
    }

    // AN INVERTED MUTANT expects the gate to stay GREEN while a real
    // defect is present — that is the hole, and finding it is the pass.
    if (m.inverted) {
      if (result.green) {
        caught += 1;
        console.log(`  CAUGHT  ${m.name}\n          -> the gate went blind, which is the hole this records`);
      } else {
        missed.push({ ...m, why: "the narrow class still caught it — the blind spot is gone, delete this mutant" });
        console.log(`  MISSED  ${m.name}`);
      }
      continue;
    }

    if (result.green) {
      missed.push({ ...m, why: "the gate stayed green — nothing here is load-bearing" });
      console.log(`  MISSED  ${m.name}`);
      continue;
    }
    const onTarget = result.failed.filter((f) => f.includes(m.expect));
    if (onTarget.length === 0) {
      missed.push({ ...m, why: `red, but on "${result.failed.join('", "')}" — nothing matching "${m.expect}"` });
      console.log(`  WRONG   ${m.name}\n          -> red on: ${result.failed.join(" | ")}`);
      continue;
    }
    caught += 1;
    console.log(`  CAUGHT  ${m.name}\n          -> ${onTarget[0]}`);
  }
} finally {
  restoreAll();
}

const after = runGate();
console.log(
  after.green
    ? "\nbaseline: the gate is green again on the restored tree"
    : "\nBASELINE IS RED — a mutation was not restored. Check `git diff`."
);

console.log(`\n${caught} of ${MUTANTS.length} mutations caught.`);
if (missed.length > 0 || !after.green) {
  if (missed.length > 0) {
    console.log("\nHOLES:");
    for (const m of missed) console.log(`  - ${m.name}\n    ${m.why}`);
  }
  process.exit(1);
}
console.log("Every clause of the gate is load-bearing.");
