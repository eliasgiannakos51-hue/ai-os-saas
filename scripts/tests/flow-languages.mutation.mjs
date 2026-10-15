#!/usr/bin/env node
/*
 * CAN flows.test.mjs §7 SEE THE PLANNER GO BACK TO READING TWO
 * LANGUAGES?
 *
 * Each mutant takes away one of the four things that made the other
 * eight work: the Chinese and Japanese cues, the words that are not
 * English or Greek, the Latin stems that read a conjugated verb, and
 * the containment match that is the only way to find a word in a
 * script with no spaces.
 *
 * Run: node scripts/tests/flow-languages.mutation.mjs
 */
import { runMutations } from "./lib/mutation-runner.mjs";

const GATE = "scripts/tests/flows.test.mjs";
const PLAN = "src/lib/flows/plan.ts";

const MUTANTS = [
  {
    name: "scripts without spaces are matched by boundary, so never",
    file: PLAN,
    from: "  if (cue.cjk.some((c) => folded.includes(c))) return true;",
    to: "  if (cue.cjk.some((c) => folded === c)) return true;",
    expect: "every one of the sixty is read",
  },
  {
    name: "a conjugated verb stops being read",
    file: PLAN,
    from: '    roots: ["tradu", "ubersetz", "translat"],',
    to: "    roots: [],",
    expect: "every one of the sixty is read",
  },
  {
    name: "the Arabic word for a picture goes",
    file: PLAN,
    from: '      "صورة", "صور", "رسم",\n',
    to: "",
    expect: "every one of the sixty is read",
  },
  {
    name: "the German word for a chart goes",
    file: PLAN,
    from: '      "diagramm", "diagramme", "tabellenkalkulation",\n',
    to: "",
    expect: "every one of the sixty is read",
  },
  {
    // The other direction: a cue list that reads everything would pass
    // the sixty and refuse every real flow.
    name: "the game cue matches any letter at all",
    file: PLAN,
    from: '    stems: ["παιχνιδ"],\n    roots: [],',
    to: '    stems: ["α", "e", "o"],\n    roots: [],',
    expect: "a sentence that names none of the six gets none of them",
  },
];

runMutations({ name: "flow-languages", gate: GATE, targets: [PLAN], mutants: MUTANTS });
