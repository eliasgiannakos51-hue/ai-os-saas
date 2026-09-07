#!/usr/bin/env node
/*
 * WOULD ANYBODY NOTICE IF THE READING LIST STOPPED BEING TRUE?
 *
 * docs/first-run/ is a pack meant to be SENT to a native speaker who has
 * one hour. Everything about it is only worth something if it matches
 * what the product ships: a stale pack costs a reader their hour and
 * returns notes on wording nobody uses.
 *
 * The mutations below break each way it can quietly stop being true — the
 * pack drifting from the messages, a runtime-built key silently dropped
 * instead of listed, the tiers losing their meaning, and the extractor
 * missing a whole form of translation call.
 *
 * THE LAST ONE IS THE REAL DEFECT THIS ROUND FIXED. address-register's
 * gate holds Greek at zero polite-plural strings; the mutation puts one
 * back, in the file, and requires the gate to name it.
 *
 * Run: node scripts/tests/first-run-strings.mutation.mjs
 */
import { readFileSync } from "node:fs";
import { writeFileSync } from "./lib/sidecar-write.mjs";
import { execFileSync } from "node:child_process";

const GATE = "scripts/tests/first-run-strings.test.mjs";
const REGISTER_GATE = "scripts/tests/address-register.test.mjs";
const SCRIPT = "scripts/first-run-strings.mjs";
const EL = "messages/el.json";
const TARGETS = [GATE, REGISTER_GATE, SCRIPT, EL];

const MUTANTS = [
  {
    // 1. THE PACK DRIFTS. One Greek sentence is rewritten and the
    // committed file still carries the old one — the exact failure that
    // makes a review pack worse than no pack.
    name: "a first-run string changes and the pack is not rebuilt",
    file: EL,
    from: "Σφάλμα δικτύου — δοκίμασε ξανά.",
    to: "Σφάλμα δικτύου — δοκίμασε πάλι σε λίγο.",
    expect: "first-run.el.md is up to date",
  },
  {
    // 2. A RUNTIME KEY IS DROPPED INSTEAD OF LISTED. The count goes down,
    // the coverage looks better, and the strings behind it are read by
    // nobody. This is the shape four of this repository's instruments
    // have had.
    name: "keys built at runtime are silently discarded",
    file: SCRIPT,
    from: "        } else {\n          allDynamic.push(d);\n        }",
    to: "        }",
    expect: "the keys it cannot read are still listed, not dropped",
  },
  {
    // 3. THE SENTENCE THRESHOLD COLLAPSES, so tier 1 becomes every label
    // on the first screens — hundreds of them, which is the 2,933 problem
    // with a smaller number in front of it.
    name: "a one-word label counts as a sentence",
    file: SCRIPT,
    from: "export const SENTENCE_WORDS = 12;",
    to: "export const SENTENCE_WORDS = 1;",
    expect: "tier 1 is a sitting's worth of reading",
  },
  {
    // 4. DEPTH STOPS MEANING DISTANCE. Every file reached is called depth
    // 0, so "on a first screen" stops selecting anything.
    name: "every reachable file is called depth 0",
    file: SCRIPT,
    from: "      if (resolved && !depth.has(resolved)) queue.push([resolved, d + 1]);",
    to: "      if (resolved && !depth.has(resolved)) queue.push([resolved, 0]);",
    expect: "depth is a distance, not a constant",
  },
  {
    // 5. THE EXTRACTOR LOSES .rich(). Seven strings in the tree are
    // rendered that way, and a scan that cannot see them reports a path
    // shorter than it is.
    name: "the extractor stops reading t.rich() and t.raw()",
    file: SCRIPT,
    from: "(?:\\\\.(?:rich|raw|markup|has))?",
    to: "",
    expect: "a namespaced key, a second binding, .rich and an absolute key are all found",
  },
  {
    // 6. THE POLITE PLURAL COMES BACK, on the first screen anybody sees.
    // This is the defect the round found by reading: two sentences three
    // lines apart, one saying εσύ and one saying εσείς.
    name: "one Greek string goes back to the polite plural",
    file: EL,
    gate: REGISTER_GATE,
    // BOTH VERBS, and the first draft changed only the first. The string
    // then matched the informal reader on "δημιουργήσεις" and the formal
    // one on "αποδεχτείτε", so it landed in the mixed-register clause
    // instead of the one this mutation names — a mutation that only half
    // reintroduces a defect measures the neighbouring check.
    from: "Πρέπει να αποδεχτείς τους Όρους Χρήσης και την Πολιτική Απορρήτου για να δημιουργήσεις λογαριασμό.",
    to: "Πρέπει να αποδεχτείτε τους Όρους Χρήσης και την Πολιτική Απορρήτου για να δημιουργήσετε λογαριασμό.",
    expect: "no Greek string addresses the reader in the polite plural",
  },
  {
    // 7. THE READER GOES BACK TO ASCII \\b, which matches nothing against
    // Greek and reports a clean file. CLAUDE.md names this trap and it
    // has now broken five things here — including the first draft of the
    // scan that found the defect above.
    name: "the register reader goes back to an ASCII word boundary",
    file: REGISTER_GATE,
    gate: REGISTER_GATE,
    from: 'const B0 = "(?<![\\\\p{L}\\\\p{N}])";',
    to: 'const B0 = "\\\\b";',
    expect: "the informal reader matches",
  },
];

function runGate(file) {
  try {
    execFileSync(process.execPath, [file], { encoding: "utf8", stdio: "pipe", timeout: 600_000 });
    return { green: true, failed: [] };
  } catch (e) {
    const out = String(e.stdout ?? "") + String(e.stderr ?? "");
    return { green: false, failed: [...out.matchAll(/^ {2}FAIL {2}(.+)$/gm)].map((m) => m[1].trim()) };
  }
}

console.log("first-run-strings mutations\n");

const GATES = [...new Set([GATE, ...MUTANTS.map((m) => m.gate ?? GATE)])];
const originals = new Map(TARGETS.map((f) => [f, readFileSync(f, "utf8")]));
const restoreAll = () => {
  for (const [file, text] of originals) writeFileSync(file, text);
};

let caught = 0;
const missed = [];
try {
  for (const g of GATES) {
    const base = runGate(g);
    console.log(`baseline: ${g.split("/").pop()} is ${base.green ? "GREEN" : "RED"} on the unmutated tree`);
    if (!base.green) {
      console.log(`\nBASELINE IS RED — no mutation result below would mean anything.\n  ${base.failed.join("\n  ")}`);
      process.exit(1);
    }
  }

  for (const m of MUTANTS) {
    const gate = m.gate ?? GATE;
    if (!originals.get(m.file).includes(m.from)) {
      missed.push({ ...m, why: `the mutation target no longer exists in ${m.file}` });
      console.log(`  STALE   ${m.name}`);
      continue;
    }
    writeFileSync(m.file, originals.get(m.file).replace(m.from, m.to));
    let result;
    try {
      result = runGate(gate);
    } finally {
      restoreAll();
    }
    if (result.green) {
      missed.push({ ...m, why: `${gate} stayed green — nothing here is load-bearing` });
      console.log(`  MISSED  ${m.name}`);
      continue;
    }
    const onTarget = result.failed.filter((f) => f.includes(m.expect));
    if (onTarget.length === 0) {
      missed.push({ ...m, why: `red on "${result.failed.slice(0, 3).join('", "')}" — nothing matching "${m.expect}"` });
      console.log(`  WRONG   ${m.name}\n          -> red on: ${result.failed.slice(0, 3).join(" | ")}`);
      continue;
    }
    caught++;
    console.log(`  CAUGHT  ${m.name}\n          -> ${onTarget[0]}`);
  }
} finally {
  restoreAll();
}

let allGreen = true;
for (const g of GATES) if (!runGate(g).green) allGreen = false;
console.log(
  allGreen
    ? "\nbaseline: every gate is green again on the restored tree"
    : "\nBASELINE IS RED — a mutation was not restored. Check `git diff`."
);

console.log(`\n${caught} of ${MUTANTS.length} mutations caught.`);
if (missed.length > 0 || !allGreen) {
  if (missed.length > 0) {
    console.log("\nHOLES:");
    for (const m of missed) console.log(`  - ${m.name}\n    ${m.why}`);
  }
  process.exit(1);
}
