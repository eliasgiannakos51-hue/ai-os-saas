#!/usr/bin/env node
/*
 * CAN one-sentence.test.mjs SEE THE PRODUCT DESCRIBING ITSELF TWICE?
 *
 * The bug was not a missing sentence — it was three different ones. So
 * the mutations are the ways a second description comes back: a surface
 * quietly dropping it, the old landing hero returning to the catalogue,
 * one locale left holding the English text, the greeting climbing back
 * above the promise, and the sentence growing into a paragraph.
 *
 * The instruments are mutated too: the surface list going empty, and the
 * locale list shrinking to English.
 *
 * Run: node scripts/tests/one-sentence.mutation.mjs
 */
import { readFileSync } from "node:fs";
// writeFileSync from the sidecar helper, not node:fs — a run killed
// mid-mutation has no finally, and the sidecar is what heals the tree on
// the next run. Convention introduced on main after this suite was
// written; scripts/tests/mutation-sidecar.test.mjs enforces it.
import { writeFileSync } from "./lib/sidecar-write.mjs";
import { execFileSync } from "node:child_process";

const GATE = "scripts/tests/one-sentence.test.mjs";
const REGISTRY = "src/lib/i18n/one-sentence.ts";
const LANDING = "src/app/page.tsx";
const GREETING = "src/components/overview/greeting-header.tsx";
const ONBOARDING = "src/components/onboarding/onboarding-flow.tsx";
const EN = "messages/en.json";
const EL = "messages/el.json";
const TARGETS = [GATE, REGISTRY, LANDING, GREETING, ONBOARDING, EN, EL];

const MUTANTS = [
  {
    name: "onboarding stops showing it, and opens with a question again",
    file: ONBOARDING,
    from: '<p className="mb-3 text-sm font-medium text-foreground">{tPromise("oneSentence")}</p>',
    to: "",
    expect: "every declared surface renders the sentence",
  },
  {
    name: "the landing page grows a hero of its own again",
    file: LANDING,
    from: '{tPromiseHero("oneSentence")}',
    to: '{t("hero")}',
    expect: "the landing page no longer renders a hero of its own",
  },
  {
    name: "the old landing hero comes back to the catalogue",
    file: EN,
    from: '"landing": {',
    to: '"landing": {\n      "hero": "Your business, organized — with AI that actually helps.",',
    expect: "the old landing hero key is gone from every locale",
  },
  {
    name: "the greeting climbs back above the promise",
    file: GREETING,
    from: '      <p className="text-sm font-medium text-foreground sm:text-base">\n        {tPromise("oneSentence")}\n      </p>',
    to: '      <p className="text-sm text-muted">{greeting.text}</p>',
    expect: "every declared surface renders the sentence",
  },
  {
    name: "Greek is left holding the English sentence",
    file: EL,
    from: '"oneSentence": "Η AI που ξέρει ήδη τη δουλειά σου. Ρώτα την οτιδήποτε."',
    to: '"oneSentence": "The AI that already knows your work. Ask it anything."',
    expect: "no locale is left holding the English text",
  },
  {
    name: "the sentence becomes a paragraph",
    file: EN,
    from: '"oneSentence": "The AI that already knows your work. Ask it anything."',
    to: '"oneSentence": "Track ideas, finance, trading, research and decisions in one place, with an assistant that reads all of it."',
    expect: "the English sentence is",
  },
  {
    name: "a locale loses the key entirely",
    file: EL,
    from: '"promise": {',
    to: '"promiseX": {',
    expect: "el:",
  },

  // ---- the instruments ----------------------------------------------
  {
    name: "the surface list goes empty",
    file: REGISTRY,
    from: "export const ONE_SENTENCE_SURFACES: readonly { file: string; when: string }[] = [",
    // A REAL EMPTY LIST. The first version of this mutant wrote
    // `= [].concat([`, which concatenates the three real entries and
    // changes nothing — the suite reported it as a hole, correctly.
    to: "export const ONE_SENTENCE_SURFACES: readonly { file: string; when: string }[] = [];\nconst UNUSED_SURFACES: readonly { file: string; when: string }[] = [",
    expect: "three surfaces are declared",
  },
  {
    name: "the key points at something that does not exist",
    file: REGISTRY,
    from: 'export const ONE_SENTENCE_KEY = "promise.oneSentence";',
    to: 'export const ONE_SENTENCE_KEY = "promise.tagline";',
    expect: "en:",
  },
];

function runGate() {
  try {
    execFileSync(process.execPath, [GATE], { encoding: "utf8", stdio: "pipe" });
    return { green: true, failed: [] };
  } catch (e) {
    const out = String(e.stdout ?? "") + String(e.stderr ?? "");
    return {
      green: false,
      failed: [...out.matchAll(/^ {2}FAIL {2}(.+)$/gm)].map((m) => m[1].trim()),
    };
  }
}

console.log("one-sentence mutations\n");
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
    console.log(`\nBASELINE IS RED.\n  ${base.failed.join("\n  ")}`);
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
      missed.push({
        ...m,
        why: `red on "${result.failed.slice(0, 4).join('", "')}" — nothing matching "${m.expect}"`,
      });
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
    : "\nBASELINE IS RED — a mutation was not restored. Check `git status`.",
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
