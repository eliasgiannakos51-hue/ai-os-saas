#!/usr/bin/env node
/*
 * CAN conversation-design.test.mjs SEE THE CONVERSATION DRIFT?
 *
 * The old icon back beside the answer, the writing answer not speeding
 * up, every old answer animating, the earth gone from the empty state,
 * and the field's controls moving back over the text.
 *
 * Run: node scripts/tests/conversation-design.mutation.mjs
 */
import { readFileSync } from "node:fs";
import { writeFileSync } from "./lib/sidecar-write.mjs";
import { execFileSync } from "node:child_process";

const GATE = "scripts/tests/conversation-design.test.mjs";
const WS = "src/components/chat/chat-workspace.tsx";
const COMPOSER = "src/components/chat/chat-composer.tsx";
const TARGETS = [GATE, WS, COMPOSER];

const MUTANTS = [
  {
    name: "the empty conversation is clipped at the top on a phone again",
    file: WS,
    from: '<div className="mx-auto flex min-h-full max-w-md flex-col items-center justify-center py-6 text-center">',
    to: '<div className="mx-auto flex h-full max-w-md flex-col items-center justify-center text-center">',
    expect: "rather than losing its top",
  },
  {
    name: "the answer's mark goes back to a chat icon",
    file: WS,
    from: '  return <Earth variant="small" px={32} working={working} still={still} className="mt-0.5 shrink-0" />;',
    to: '  return <span className="h-8 w-8" />;',
    expect: "the answer's mark is the small earth",
  },
  {
    name: "the answer being written does not speed up",
    file: WS,
    from: "                  <AssistantAvatar working />",
    to: "                  <AssistantAvatar />",
    expect: "the answer being written turns faster",
  },
  {
    name: "every old answer animates",
    file: WS,
    from: "<AssistantAvatar still={sending || msg.id !== lastAnswerId} />",
    to: "<AssistantAvatar />",
    expect: "older ones are drawn still",
  },
  {
    name: "the empty conversation loses its earth",
    file: WS,
    from: '              <Earth variant="small" px={64} />',
    to: "",
    expect: "the empty conversation opens with the earth too",
  },
  {
    name: "the microphone moves back to the right, over the text",
    file: COMPOSER,
    from: '        <div className="absolute bottom-2 start-2">',
    to: '        <div className="absolute bottom-2 end-14">',
    expect: "voice bottom-left",
  },
  {
    name: "the controls lose their own row",
    file: COMPOSER,
    from: " pb-14 pt-3.5 ",
    to: " py-3.5 pe-[7.5rem] ",
    expect: "the text never runs under the controls",
  },
];

function runGate() {
  try {
    execFileSync(process.execPath, [GATE], { encoding: "utf8", stdio: "pipe", timeout: 60_000 });
    return { green: true, failed: [] };
  } catch (e) {
    const out = String(e.stdout ?? "") + String(e.stderr ?? "");
    return {
      green: false,
      failed: [...out.matchAll(/^ {2}FAIL {2}(.+)$/gm)].map((m) => m[1].trim()),
    };
  }
}

console.log("conversation-design mutations\n");

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
      missed.push({ ...m, why: `red on "${result.failed.slice(0, 4).join('", "')}" — nothing matching "${m.expect}"` });
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
