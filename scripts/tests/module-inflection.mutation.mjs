#!/usr/bin/env node
/*
 * WOULD "παρουσίαση πωλήσεων" REACH SALES AGAIN?
 *
 * Run: node scripts/tests/module-inflection.mutation.mjs
 *
 * The defect is silent: a brief that matches nothing does not fail, it
 * quietly falls back to registry order and the generator is handed
 * whichever eight modules come first. The site still comes out. It is
 * simply about a business the model had to imagine, and nothing
 * anywhere says the account's own rows were not the ones read.
 *
 * FIVE MUTANTS. Three break the generator in each of the ways its own
 * first two drafts broke — no folding, the wrong alphabet in the
 * suffixes, the forms generated and then dropped. One breaks the
 * promise that nothing gets worse. One makes it match everything, which
 * looks exactly like working.
 */
import { readFileSync } from "node:fs";
import { writeFileSync } from "./lib/sidecar-write.mjs";
import { execFileSync } from "node:child_process";

const GATE = "scripts/tests/module-inflection.test.mjs";
const SYN = "src/lib/ai/module-synonyms.ts";

const MUTANTS = [
  {
    // DRAFT ONE'S BUG: the rules are applied to the accented word, so
    // "ανταγωνιστές" (tonos on the epsilon) produces nothing while
    // "προϊόντα" works. Every accented plural falls through in silence.
    name: "the suffix rules see accents again",
    file: SYN,
    from: "  const word = foldForMatch(term.trim());",
    to: "  const word = term.trim();",
    expect: "reaches competitors",
  },
  {
    // DRAFT TWO'S BUG: the endings written in the unfolded alphabet.
    // foldForMatch normalises final sigma, so /εις$/ matches nothing
    // that ever reaches it.
    name: "the endings are written in the alphabet the fold does not produce",
    file: SYN,
    from: '    [/εισ$/, "εων"],',
    to: '    [/εις$/, "εων"],',
    expect: "reaches sales",
  },
  {
    // GENERATED AND DROPPED. The function is perfect and its output
    // never joins the vocabulary.
    name: "the generated forms never reach the vocabulary",
    file: SYN,
    from: "  const inflected = m.primary.flatMap((term) => greekPluralForms(term));",
    to: "  const inflected = [];",
    expect: "still reaches its own module",
  },
  {
    // THE PROMISE THAT NOTHING GETS WORSE. Substituting rather than
    // appending drops every nominative that used to match.
    name: "the plurals replace the words they came from",
    file: SYN,
    from: "  return [...new Set([...m.primary, ...m.verbs, ...inflected])];",
    to: "  return [...new Set([...inflected, ...m.verbs])];",
    expect: "survives the generation",
  },
  {
    // A GENERATOR THAT SAYS YES TO EVERYTHING looks exactly like a
    // working one — the shape the first LITERAL detector had, where 264
    // of 275 matched and the interesting case could never happen.
    name: "every word gets a plural, Greek or not",
    file: SYN,
    from: "  if (!GREEK_WORD.test(word)) return [];",
    to: '  if (!GREEK_WORD.test(word)) return [word + "ων"];',
    // Caught by the Latin-word check rather than by the size ratio: 33
    // generated forms becoming 1,246 is still under a quarter of the
    // list, so the ratio alone would have let it through. Naming the
    // check that actually trips is the point of `expect`.
    expect: "a Latin word is left alone",
  },
];

function runGate() {
  try {
    execFileSync(process.execPath, [GATE], { encoding: "utf8", stdio: "pipe", timeout: 300_000 });
    return { green: true, failed: [] };
  } catch (e) {
    const out = String(e.stdout ?? "") + String(e.stderr ?? "");
    return { green: false, failed: [...out.matchAll(/^ {2}FAIL {2}(.+)$/gm)].map((m) => m[1].trim()) };
  }
}

console.log("module-inflection mutations\n");

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
console.log("A Greek brief that reaches no module of its own goes red here first.");
