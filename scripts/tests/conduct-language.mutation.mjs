#!/usr/bin/env node
/*
 * CAN conduct-language.test.mjs SEE THE ENGLISH SENTENCE COME BACK?
 *
 * The defect it was written for was measured on live models, not read:
 * Haiku 4.5 closed a Greek agent answer with the English disclaimer 1 run
 * in 5 (and once more in the product's own tier comparison), while Sonnet
 * 4.6 and Opus 4.5 translated it every time. A defect the strong models
 * hide is a defect no cheap check will stumble on by accident, so the
 * gate has to be aimed exactly at the shape.
 *
 * The last two mutations are aimed at the gate rather than at the prompt,
 * because this file has already been wrong twice in exactly those ways:
 * its first detector flagged three blocks that were noise (a phrase the
 * crisis block FORBIDS, and two fragments spanning scare-quotes), and its
 * second stopped seeing the English block the moment that block was
 * fixed — a green check over an empty set.
 *
 * Run: node scripts/tests/conduct-language.mutation.mjs
 */
import { readFileSync } from "node:fs";
import { writeFileSync } from "./lib/sidecar-write.mjs";
import { execFileSync } from "node:child_process";

const GATE = "scripts/tests/conduct-language.test.mjs";
const CONDUCT = "src/lib/ai-conduct.ts";

const SILENT = "no block hands over a sentence without saying what language";
const DETECTED = "the blocks that hand over a sentence are still detected";

const MUTANTS = [
  {
    // THE DEFECT ITSELF, in the block that shipped it.
    name: "the English disclaimer goes back to being a bare quoted sentence",
    file: CONDUCT,
    from: 'and ALWAYS close with an explicit note WRITTEN IN THE SAME LANGUAGE AS THE REST OF YOUR ANSWER. In English that note reads: "I\'m not a doctor/lawyer/accountant — for your specific situation, consult a professional." If you are answering in another language, write it in that language — never paste the English sentence into an answer that is not in English.',
    to: 'and ALWAYS close with an explicit note: "I\'m not a doctor/lawyer/accountant — for your specific situation, consult a professional."',
    expect: SILENT,
  },
  {
    // AND THE MIRROR, which no live run caught because every run was
    // Greek: the EL block hands a Greek sentence to chat, records/ask,
    // mission-agents and reflection — all of which tell the model to
    // answer in the language the USER wrote in. An English-speaking chat
    // user is the one who would have been handed "Δεν είμαι γιατρός".
    name: "...and the Greek one does too",
    file: CONDUCT,
    from: 'κλείσε ΠΑΝΤΑ με ρητή σύσταση ΓΡΑΜΜΕΝΗ ΣΤΗΝ ΙΔΙΑ ΓΛΩΣΣΑ με την υπόλοιπη απάντησή σου. Στα ελληνικά η σύσταση είναι: "Δεν είμαι γιατρός/δικηγόρος/λογιστής — για τη δική σου περίπτωση συμβουλέψου ειδικό." Αν απαντάς σε άλλη γλώσσα, γράψε τη σύσταση σε εκείνη τη γλώσσα — ποτέ μην αντιγράψεις την ελληνική πρόταση σε απάντηση που δεν είναι στα ελληνικά.',
    to: 'κλείσε ΠΑΝΤΑ με ρητή σύσταση: "Δεν είμαι γιατρός/δικηγόρος/λογιστής — για τη δική σου περίπτωση συμβουλέψου ειδικό."',
    expect: SILENT,
  },
  {
    // THE VACUITY THIS FILE ACTUALLY SHIPPED FOR ONE RUN. An 80-character
    // window between the cue and the quote stopped matching as soon as
    // the fix inserted ~100 characters of language rule — so the block
    // that had just been repaired fell out of the detector, and section 2
    // was green because it was looking at nothing.
    name: "the detector's window shrinks until it loses the block it just passed",
    file: GATE,
    from: '|say exactly|note reads|note:|κλείσε[^.]{0,40}με|σύσταση:)[^"]{0,220}$/i;',
    to: '|say exactly|note:|κλείσε[^.]{0,40}με|σύσταση:)[^"]{0,80}$/i;',
    expect: DETECTED,
  },
  {
    // THE OTHER HALF OF THAT: a detector that flags everything is as
    // useless as one that flags nothing, and its findings train the
    // reader to skip the gate. `"I understand how you feel"` is a phrase
    // the crisis block tells the model NEVER to say.
    name: "the detector stops excluding phrases the prompt FORBIDS",
    file: GATE,
    from: "    return ECHO_CUE.test(before) && !FORBID_CUE.test(before);",
    to: "    return /\"/.test(before) || ECHO_CUE.test(before);",
    expect: SILENT,
  },
];

function runGate() {
  try {
    execFileSync(process.execPath, [GATE], { encoding: "utf8", stdio: "pipe" });
    return { green: true, failed: [] };
  } catch (e) {
    const out = String(e.stdout ?? "") + String(e.stderr ?? "");
    return { green: false, failed: [...out.matchAll(/^ {2}FAIL {2}(.+)$/gm)].map((m) => m[1].trim()) };
  }
}

console.log("conduct-language mutations\n");

const TARGETS = [...new Set(MUTANTS.map((m) => m.file))];
const originals = new Map(TARGETS.map((f) => [f, readFileSync(f, "utf8")]));
const restoreAll = () => {
  for (const [file, text] of originals) writeFileSync(file, text);
};

let caught = 0;
const missed = [];
try {
  const baseline = runGate();
  if (!baseline.green) {
    console.log("BASELINE IS ALREADY RED — fix the gate before measuring it.");
    console.log(baseline.failed.map((f) => `  ${f}`).join("\n"));
    process.exit(1);
  }

  for (const m of MUTANTS) {
    if (!originals.get(m.file).includes(m.from)) {
      missed.push({ ...m, why: `the mutation target no longer exists in ${m.file}` });
      console.log(`  STALE   ${m.name}`);
      continue;
    }
    writeFileSync(m.file, originals.get(m.file).replace(m.from, m.to));
    let result;
    try {
      result = runGate();
    } finally {
      restoreAll();
    }
    if (result.green) {
      missed.push({ ...m, why: "the gate stayed green — nothing here is load-bearing" });
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
console.log("A sentence handed over without its language, in either direction, is red.");
