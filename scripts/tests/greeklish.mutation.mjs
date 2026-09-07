#!/usr/bin/env node
/*
 * CAN greeklish.test.mjs SEE THE FOLD GO BACK TO ONE PLACE?
 *
 * The fold itself is easy to test. What this suite is for is the demand
 * that made the item worth doing: SIX surfaces, one implementation. Five
 * of the mutations below unwire one surface each, because a feature that
 * works in ⌘K and nowhere else is the failure, not a partial success.
 *
 * The rest break the fold in the two directions it can break: reading too
 * little (an ambiguous letter resolved to one meaning) and reading too
 * much (a stem allowed to swallow a whole word, or a Greek string treated
 * as greeklish).
 *
 * Run: node scripts/tests/greeklish.mutation.mjs
 */
import { readFileSync } from "node:fs";
import { writeFileSync } from "./lib/sidecar-write.mjs";
import { execFileSync } from "node:child_process";

const GATE = "scripts/tests/greeklish.test.mjs";
const U = "src/lib/text/unicode-patterns.ts";
const SEARCH = "src/lib/text/search-match.ts";
const KB = "src/lib/support/knowledge-base.ts";
const REL = "src/lib/ai/module-relevance.ts";
const RULES = "src/lib/trading/rules.ts";
const NEG = "src/lib/website-negative-instructions.ts";

const WIRED = "every text-matching surface calls the shared implementation";
const CORPUS = "every spelling reaches its Greek word";

const MUTANTS = [
  // ---- the five surfaces, unwired one at a time ----
  {
    name: "⌘K search stops asking about greeklish",
    file: SEARCH,
    from: "  return textHasGreeklishTerm(q,",
    to: "  return false && textHasGreeklishTerm(q,",
    expect: "a Latin query finds a Greek row",
  },
  {
    name: "the canned answers stop asking",
    file: KB,
    from: "textHasGreeklishTerm(n, [trigger])",
    to: "false",
    expect: WIRED,
  },
  {
    name: "the module vocabulary stops asking",
    file: REL,
    from: "} else if (textHasGreeklishTerm(foldedQuestion, [term])) {",
    to: "} else if (false) {",
    expect: WIRED,
  },
  {
    name: "the trading-rule parser stops asking",
    file: RULES,
    from: "|| textHasGreeklishTerm(folded, spellings)",
    to: "",
    also: [
      { from: '|| textHasGreeklishTerm(folded, ["ρισκο"])', to: "" },
      { from: '|| textHasGreeklishTerm(folded, ["μονο"])', to: "" },
    ],
    expect: WIRED,
  },
  {
    name: "the website brief stops asking",
    file: NEG,
    from: "textHasGreeklishStem(text, stems)",
    to: "false",
    also: [{ from: "textHasGreeklishTerm(text, GREEKLISH_NEGATION_CUES)", to: "false" }],
    expect: WIRED,
  },

  // ---- the fold, read too little ----
  {
    name: "x resolves to chi only, so the word for 'I know' is lost",
    file: U,
    from: '  x: ["x", "3"],',
    to: '  x: ["x"],',
    expect: CORPUS,
  },
  {
    name: "h resolves to eta only, so 'hara' stops being joy",
    file: U,
    from: '  h: ["i", "x"],',
    to: '  h: ["i"],',
    expect: CORPUS,
  },
  {
    name: "u stops being the theta key",
    file: U,
    from: '  u: ["8", "i"],',
    to: '  u: ["i"],',
    expect: "u is read as BOTH theta and the vowel",
  },
  {
    name: "the digraphs go, so th and ps are read letter by letter",
    file: U,
    from: '  ["th", ["8"]],',
    to: "",
    expect: CORPUS,
  },
  {
    name: "omega stops being the w key",
    file: U,
    from: '  w: ["o"],',
    to: '  w: ["v"],',
    expect: CORPUS,
  },
  {
    // THE BUG THIS FILE ACTUALLY SHIPPED FOR ONE DRAFT: the digraph
    // marker was a space, and dropping it destroyed the real word
    // boundaries too, so a two-word trigger could never match.
    name: "the digraph marker goes back to being a space",
    file: U,
    from: 'const MARK = "\\u0000";',
    to: 'const MARK = " ";',
    expect: "a two-word trigger needs BOTH its words",
  },

  // ---- the fold, read too much ----
  {
    name: "a Greek string is allowed to be read as greeklish",
    file: U,
    from: "  if (!t || GREEK_LETTER_PATTERN.test(t)) return false;\n  // A TERM CAN BE A PHRASE",
    to: "  if (!t) return false;\n  // A TERM CAN BE A PHRASE",
    expect: "refuses a text that is already Greek",
  },
  {
    name: "the branch cap is removed, so an ambiguous word explodes",
    file: U,
    from: "const MAX_GREEKLISH_BRANCHES = 16;",
    to: "const MAX_GREEKLISH_BRANCHES = 100000;",
    expect: "the branch count is bounded",
  },
  {
    name: "a stem may swallow a word of any length",
    file: U,
    from: "if (candidate.startsWith(stem) && candidate.length <= stem.length + MAX_INFLECTION) return true;",
    to: "if (candidate.startsWith(stem)) return true;",
    expect: "a stem cannot swallow a much longer word",
  },
  {
    // AIMED AT THE FLOOR THAT IS REAL. A first version of this mutation
    // removed a length check on the two INPUTS, and the gate stayed green
    // because that guard was inert — nothing two characters long can
    // produce a three-character skeleton. The input check is gone; this
    // is the one that does the work.
    name: "the three-character floor on the skeleton goes",
    file: U,
    from: "  if (target.length < 3) return false;",
    to: "  if (target.length < 1) return false;",
    expect: "a skeleton under three characters matches nothing",
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

console.log("greeklish mutations\n");

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
    const stale = [m.from, ...(m.also ?? []).map((e) => e.from)].filter(
      (f) => !originals.get(m.file).includes(f)
    );
    if (stale.length > 0) {
      missed.push({ ...m, why: `no longer in ${m.file}: ${stale[0].slice(0, 60)}` });
      console.log(`  STALE   ${m.name}`);
      continue;
    }
    let mutated = originals.get(m.file).replace(m.from, m.to);
    for (const extra of m.also ?? []) mutated = mutated.replace(extra.from, extra.to);
    writeFileSync(m.file, mutated);
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
      missed.push({ ...m, why: `red on "${result.failed.slice(0, 2).join('", "')}" — nothing matching "${m.expect}"` });
      console.log(`  WRONG   ${m.name}\n          -> red on: ${result.failed.slice(0, 2).join(" | ")}`);
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
console.log("A fold wired at one place, and a fold that reads too much, are both red.");
