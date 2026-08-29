#!/usr/bin/env node
/*
 * CAN chat-scroll-race.test.mjs SEE THE RACE COME BACK?
 *
 * The bug this guards was reported, fixed in V3, and reported AGAIN — so
 * the interesting question is not whether the rule is right today but
 * whether anything notices when it stops being.
 *
 * Six mutations, six dimensions. The first is the pre-fix rule itself,
 * put back exactly: `sticking ? "scroll"`, which answers "scroll" to a
 * reader who has already wheeled away and whose scroll event has not been
 * delivered yet.
 *
 *   1. the measurement is dropped and the flag decides again
 *   2. ...or the flag wins when the two disagree
 *   3. growth starts counting as movement, so following never resumes
 *   4. the sub-pixel tolerance goes, so layout drift stops the follow
 *   5. follow() stores the unclamped scrollHeight it asked for
 *   6. a streaming surface stops attaching onScroll
 *
 * Run: node scripts/tests/chat-scroll-race.mutation.mjs
 */
import { readFileSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";

const GATE = "scripts/tests/chat-scroll-race.test.mjs";
const DECISION = "src/lib/chat/follow-decision.ts";
const HOOK = "src/hooks/use-stick-to-bottom.ts";
const STUDIO = "src/components/create/studio-chat.tsx";
const TARGETS = [GATE, DECISION, HOOK, STUDIO];

const MUTANTS = [
  {
    // THE PRE-FIX RULE, VERBATIM.
    name: "the flag decides again, as it did before the fix",
    file: DECISION,
    from: "  if (movedByHuman) {",
    to: "  if (false && movedByHuman) {",
    expect: "mid-stream wheel",
  },
  {
    name: "the flag wins when it and the DOM disagree",
    file: DECISION,
    from: "  if (movedByHuman) {\n    // Measured, not remembered.",
    to: "  if (sticking) return \"scroll\";\n  if (movedByHuman) {\n    // Measured, not remembered.",
    expect: "mid-stream wheel",
  },
  {
    // Growth raises scrollHeight and leaves scrollTop alone. If that
    // counted as movement, every reply would stop auto-scrolling — a fix
    // worse than the bug.
    name: "growth starts counting as the reader moving",
    file: DECISION,
    from: "  const movedByHuman = lastSetTop !== null && Math.abs(scrollTop - lastSetTop) > 1;",
    to: "  const movedByHuman = lastSetTop !== null;",
    expect: "content grows while the reader is at the bottom",
  },
  {
    name: "the sub-pixel tolerance is removed",
    file: DECISION,
    from: "Math.abs(scrollTop - lastSetTop) > 1;",
    to: "Math.abs(scrollTop - lastSetTop) > 0;",
    expect: "half a pixel of drift is not a reader",
  },
  {
    // scrollTop is clamped to scrollHeight - clientHeight. Storing the
    // unclamped number makes every later call see a mismatch and read the
    // hook's own scroll as the reader's.
    name: "follow() records what it asked for instead of what it got",
    file: HOOK,
    from: "      lastSetTopRef.current = el.scrollTop;\n      stickRef.current = true;",
    to: "      lastSetTopRef.current = el.scrollHeight;\n      stickRef.current = true;",
    expect: "follow() reads the clamped position back",
  },
  {
    name: "a streaming surface stops reporting where the reader is",
    file: STUDIO,
    from: "onScroll={onScroll}",
    to: "",
    expect: "attaches onScroll to the container it scrolls",
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
      body: out,
    };
  }
}

console.log("chat-scroll-race mutations\n");

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
    const onTarget =
      result.failed.some((f) => f.includes(m.expect)) || (result.body ?? "").includes(m.expect);
    if (!onTarget) {
      missed.push({
        ...m,
        why: `red on "${result.failed.slice(0, 3).join('", "')}" — nothing matching "${m.expect}"`,
      });
      console.log(`  WRONG   ${m.name}\n          -> ${result.failed.slice(0, 3).join(" | ")}`);
      continue;
    }
    caught++;
    console.log(`  CAUGHT  ${m.name}`);
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
console.log("Every clause of chat-scroll-race.test.mjs is load-bearing.");
