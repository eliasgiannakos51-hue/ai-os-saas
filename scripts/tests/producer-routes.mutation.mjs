#!/usr/bin/env node
/*
 * CAN producer-routes.test.mjs TELL A ROUTER FROM A CLAIM OF ONE?
 *
 * The gate's centre is a measurement — thirty phrases in four scripts —
 * and a measurement is only worth what its failures cost. Each mutant
 * below breaks ONE script, ONE mechanism or ONE half of the emitter/reader
 * agreement, and the gate has to go red on the clause that names it.
 *
 * The two that matter most are the ones this repository has shipped
 * before: a boundary applied to a script that has none (Chinese), and a
 * transliteration that cannot reach a letter (the phi in greeklish, which
 * was a REAL defect in lib/text/unicode-patterns.ts until this round —
 * see the af/ef entry there).
 *
 * Run: node scripts/tests/producer-routes.mutation.mjs
 */
import { readFileSync } from "node:fs";
import { writeFileSync } from "./lib/sidecar-write.mjs";
import { execFileSync } from "node:child_process";

const GATE = "scripts/tests/producer-routes.test.mjs";
const ROUTES = "src/lib/create-studio/producer-routes.ts";
const PATTERNS = "src/lib/text/unicode-patterns.ts";
const POSTS_PAGE = "src/app/dashboard/posts/page.tsx";

const TARGETS = [GATE, ROUTES, PATTERNS, POSTS_PAGE];

const MUTANTS = [
  {
    // THE DEFECT THIS ROUND FOUND, PUT BACK. With only the αυ reading,
    // every Greek word with a phi after an alpha is unreachable from an
    // English keyboard: "diafanies", "grafeio", "kafe".
    name: "greeklish loses the phi again (af -> av only)",
    file: PATTERNS,
    from: '["af", ["av", "af"]],',
    to: '["af", ["av"]],',
    expect: "phrases route to the right producer",
  },
  {
    name: "Chinese is matched with a word boundary it does not have",
    file: ROUTES,
    from: "    if (!cue) cue = unspaced.find((c) => folded.includes(c)) ?? null;",
    to: "    if (!cue) cue = null;",
    expect: "every language bucket is carried",
  },
  {
    name: "a dash stops being a space, so e-shop is one token",
    file: ROUTES,
    from: 'const folded = foldForMatch(text).replace(DASHES, " ");',
    to: "const folded = foldForMatch(text);",
    expect: "phrases route to the right producer",
  },
  {
    name: "the greeklish reader is dropped",
    file: ROUTES,
    from: "    if (!cue && spec.greek.length > 0 && textHasGreeklishStem(text, spec.greek)) {",
    to: "    if (false && spec.greek.length > 0 && textHasGreeklishStem(text, spec.greek)) {",
    expect: "every language bucket is carried",
  },
  {
    name: "two producers in one sentence picks the first instead of asking",
    file: ROUTES,
    from: '  if (hits.length > 1) return { kind: "ambiguous", producers: hits.map((h) => h.key) };',
    to: "  if (hits.length > 1) hits.length = 1;",
    expect: "it says ambiguous rather than picking one",
  },
  {
    name: "the router answers a plain tracker entry too",
    file: ROUTES,
    from: '    const spaced = spec.cues.filter((c) => !NO_SPACE_SCRIPT.test(c));',
    to: '    const spaced = spec.cues.filter((c) => !NO_SPACE_SCRIPT.test(c)).concat(key === "posts" ? ["credits"] : []);',
    expect: "none of the 5 non-requests matches a producer",
  },
  {
    name: "a destination invents a second name",
    file: ROUTES,
    from: '    destinationKey: "sidebar.items.posts",',
    to: '    destinationKey: "posts.title",',
    expect: "no destination invents a second name",
  },
  {
    name: "the brief is emitted and the page stops reading it",
    file: POSTS_PAGE,
    from: "initialDescription={readExampleParam(searchParams.brief)}",
    to: "initialDescription={undefined}",
    expect: "posts/page.tsx really reads searchParams.brief",
  },
  {
    name: "the brief stops being clamped",
    file: ROUTES,
    from: "  const trimmed = readExampleParam(String(brief ?? \"\"));",
    to: "  const trimmed = String(brief ?? \"\").trim();",
    expect: "a brief is clamped at the shared ceiling",
  },
  {
    name: "an ASCII word boundary is applied to a person's text",
    file: ROUTES,
    from: "const DASHES = /\\p{Pd}/gu;",
    to: "const DASHES = /\\p{Pd}/gu;\nconst UNUSED_ASCII = /\\bwebsite\\b/;",
    expect: "no ASCII word boundary is applied to a person's text",
  },
  {
    name: "a cue is written with an accent the fold would have removed",
    file: ROUTES,
    from: '      "research", "deep research", "market research", "investigacion",',
    to: '      "research", "deep research", "market research", "investigación",',
    expect: "every cue is written folded",
  },
  {
    // THE GATE GOING BLIND. Thirty phrases is the whole evidence; five of
    // them agreeing proves nothing about the other twenty-five.
    name: "the gate measures five phrases and calls it thirty",
    file: GATE,
    from: "for (const [lang, text, want] of PHRASES) {",
    to: "for (const [lang, text, want] of PHRASES.slice(0, 5)) {",
    expect: "phrases route to the right producer",
  },
];

function runGate() {
  try {
    execFileSync(process.execPath, [GATE], { encoding: "utf8", stdio: "pipe" });
    return { green: true, failed: [] };
  } catch (e) {
    const out = String(e.stdout ?? "") + String(e.stderr ?? "");
    const failed = [...out.matchAll(/^ {2}FAIL {2}(.+)$/gm)].map((m) => m[1].trim());
    return { green: false, failed: failed.length ? failed : ["(the gate exited non-zero without a FAIL line)"] };
  }
}

console.log("producer routes mutations\n");

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
    console.log(`\nBASELINE IS RED — no mutation result below would mean anything.\n  ${base.failed.join("\n  ")}`);
    process.exit(1);
  }

  for (const m of MUTANTS) {
    const edits = m.edits ?? [{ file: m.file, from: m.from, to: m.to }];
    const byFile = new Map();
    const stale = [];
    for (const e of edits) {
      const current = byFile.get(e.file) ?? originals.get(e.file);
      if (current === undefined || !current.includes(e.from)) { stale.push(e); break; }
      byFile.set(e.file, current.replace(e.from, e.to));
    }
    if (stale.length > 0) {
      missed.push({ ...m, why: `the mutation target no longer exists in ${stale.map((e) => e.file).join(", ")}` });
      console.log(`  STALE   ${m.name}`);
      continue;
    }
    if ([...byFile.entries()].every(([file, text]) => text === originals.get(file))) {
      missed.push({ ...m, why: "the mutation left every file byte-identical" });
      console.log(`  NO-OP   ${m.name}`);
      continue;
    }
    for (const [file, text] of byFile) writeFileSync(file, text);
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
      missed.push({ ...m, why: `it went red, but on "${result.failed.join('", "')}" — nothing matching "${m.expect}"` });
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
console.log(after.green ? "\nbaseline: the gate is green again on the restored tree" : "\nBASELINE IS RED — a mutation was not restored. Check `git diff`.");
console.log(`\n${caught} of ${MUTANTS.length} mutations caught.`);
if (missed.length > 0 || !after.green) {
  if (missed.length > 0) {
    console.log("\nHOLES:");
    for (const m of missed) console.log(`  - ${m.name}\n    ${m.why}`);
  }
  process.exit(1);
}
console.log("Every script, every mechanism and both halves of the link are load-bearing.");
