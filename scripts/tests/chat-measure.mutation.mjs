// EVERY CLAUSE OF chat-measure.test.mjs, BROKEN ON PURPOSE.
//
// The gate is cheap on purpose — it exists so the expensive one
// (chat-measure.prodtest.mjs: a real build, five widths, three
// languages) does not have to be run to catch a refactor that deletes a
// breakpoint. A cheap gate is only worth having if it can go red, and
// this file is what says it can.
//
// TWO OF THESE MUTATIONS ARE THE MISTAKES THIS GATE ALREADY MADE. It
// stripped comments out of the CSS and then read the TSX raw, so a check
// about `text-foreground/90` went red against the paragraph explaining
// that `text-foreground/90` is gone; and it anchored the "no card" check
// on a JSX comment that stripComments had already deleted, testing an
// empty string against a regex. Both are in the list below, because a
// mistake that is only fixed is a mistake that comes back.
//
// EVERY MUTATION IS AN EDIT OF REAL CODE, never an `if (false)`:
// scripts/check-mutation-markers.mjs fails on that literal, so such a
// mutation is "caught" by the marker gate without any behavioural check
// having looked at it.
//
// Run: node scripts/tests/chat-measure.mutation.mjs
import { readFileSync } from "node:fs";
import { writeFileSync } from "./lib/sidecar-write.mjs";
import { execFileSync } from "node:child_process";

const GATE = "scripts/tests/chat-measure.test.mjs";
const CSS = "src/app/globals.css";
const WORKSPACE = "src/components/chat/chat-workspace.tsx";

function gateIsGreen() {
  try {
    execFileSync("node", [GATE], { stdio: "pipe" });
    return true;
  } catch {
    return false;
  }
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
  // --- the rule itself ------------------------------------------------
  {
    name: "the widest breakpoint's cap is removed",
    file: CSS,
    from: "    font-size: 17px;\n    max-width: 61ch;",
    to: "    font-size: 17px;",
  },
  {
    name: "the caps stop ascending (the wide screen gets the shorter line)",
    file: CSS,
    from: "    font-size: 16px;\n    max-width: 61ch;",
    to: "    font-size: 16px;\n    max-width: 50ch;",
  },
  {
    name: "the font stops growing, so a wider screen is only emptier",
    file: CSS,
    from: "    font-size: 17px;\n    max-width: 61ch;",
    to: "    max-width: 61ch;",
  },
  {
    name: "a cap is pushed past 75 characters",
    file: CSS,
    from: "    max-width: 60ch;",
    to: "    max-width: 72ch;",
  },
  {
    name: "a cap is pulled under 60 characters",
    file: CSS,
    from: "    max-width: 60ch;",
    to: "    max-width: 40ch;",
  },
  {
    name: "the base rule stops filling the width, so mobile is no longer full-width",
    file: CSS,
    from: ".chat-measure {\n  width: 100%;\n  margin-inline: auto;\n  font-size: 15px;\n}",
    to: ".chat-measure {\n  margin-inline: auto;\n  font-size: 15px;\n}",
  },
  // --- the layout the rule is about ------------------------------------
  {
    name: "the composer goes back to its own width, drifting from the thread",
    file: WORKSPACE,
    from: '          <div className="chat-measure">',
    to: '          <div className="mx-auto max-w-2xl">',
  },
  {
    name: "the card comes back around the answer",
    file: WORKSPACE,
    from: '<div className="min-w-0 flex-1 text-foreground">\n                      <MessageContent content={msg.content}',
    to: '<div className="min-w-0 flex-1 rounded-2xl border border-border bg-panel px-4 py-2.5 text-foreground">\n                      <MessageContent content={msg.content}',
  },
  {
    name: "the answer's text is dimmed instead of the globe",
    file: WORKSPACE,
    from: '<div className="min-w-0 flex-1 text-foreground">\n                      <MessageContent content={msg.content}',
    to: '<div className="min-w-0 flex-1 text-foreground/90">\n                      <MessageContent content={msg.content}',
  },
  {
    name: "the person's turn loses its ground, so a question looks like an answer",
    file: WORKSPACE,
    from: 'border border-orange-500/30 bg-panel px-4 py-2.5 text-foreground',
    to: 'px-4 py-2.5 text-foreground',
  },
  {
    name: "the filled orange slab comes back",
    file: WORKSPACE,
    from: 'rounded-2xl rounded-tr-sm border border-orange-500/30 bg-panel px-4 py-2.5 text-foreground',
    to: 'rounded-2xl rounded-tr-sm bg-orange-500 px-4 py-2.5 text-sm text-black',
  },
  // --- the instrument's own clauses, both of which were wrong once -----
  {
    name: "the gate reads the TSX raw again, so a comment counts as code",
    file: GATE,
    from: 'const workspace = stripComments(readFileSync("src/components/chat/chat-workspace.tsx", "utf8"));',
    to: 'const workspace = readFileSync("src/components/chat/chat-workspace.tsx", "utf8");',
    // Reading raw does not by itself make a check fail — it makes the
    // "no card" check read a comment quoting the old classes. Section 4's
    // dimming check is what must catch it.
    expect: "section 4's dimming check, against the paragraph that explains the dimming is gone",
  },
  {
    name: "the CSS stripper is disabled, so the class's own comment satisfies the scan",
    file: GATE,
    from: "  return src.replace(/\\/\\*[\\s\\S]*?\\*\\//g, \"\");",
    to: "  return String(src);",
  },
  {
    name: "the answer-wrapper walk is anchored on a JSX comment again",
    file: GATE,
    from: '  const at = workspace.indexOf("<MessageContent content={msg.content}");',
    to: '  const at = workspace.indexOf("{/* EU AI Act");',
  },
  {
    name: "the measured ch-to-character ratio is dropped back to 1",
    file: GATE,
    from: "const CHARS_PER_CH = { en: 1.22, el: 1.11 };",
    to: "const CHARS_PER_CH = { en: 1, el: 1 };",
  },
];

console.log("chat-measure mutations\n");
if (!gateIsGreen()) {
  console.log("baseline: the gate is RED on the unmutated tree — fix that first.");
  process.exit(1);
}
console.log("baseline: the gate is GREEN on the unmutated tree");

let caught = 0;
const survivors = [];
// A STALE ANCHOR IS A FAILURE, NOT A NOTE. A survivor means the gate
// cannot see a real regression; a missed anchor means this file never
// tried, and a suite that silently skips half its mutations prints the
// same "all caught" as one that ran them.
const missed = [];

for (const m of MUTATIONS) {
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

  const red = !gateIsGreen();

  writeFileSync(m.file, before);

  if (red) {
    caught++;
    console.log(`  CAUGHT  ${m.name}${m.expect ? `\n          -> by ${m.expect}` : ""}`);
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

console.log(`${caught} of ${MUTATIONS.length} mutations caught.`);
if (missed.length > 0) {
  console.log("\nMISSED ANCHORS (these mutations never ran):");
  for (const s of missed) console.log(`  - ${s}`);
}
if (survivors.length > 0) {
  console.log("\nSURVIVORS:");
  for (const s of survivors) console.log(`  - ${s}`);
}
if (missed.length > 0 || survivors.length > 0) process.exit(1);
console.log("Every clause of chat-measure.test.mjs is load-bearing.");
