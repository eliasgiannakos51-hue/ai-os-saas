#!/usr/bin/env node
/*
 * CAN chat-stop.test.mjs SEE A STOPPED REPLY BEING CHARGED IN FULL?
 *
 * Seven mutations, each one of the ways "charge only what was produced"
 * quietly stops being true:
 *
 *   1. the output side is taken from the snapshot's placeholder   (lib)
 *   2. NaN in the snapshot becomes NaN on the cost row             (lib)
 *   3. the stream's cancel() no longer stops anything              (route)
 *   4. a stop before the first word keeps the hold                 (route)
 *   5. the partial reply is settled but never saved                (route)
 *   6. the client's abort is reported as a network error           (client)
 *   7. the composer never renders a stop button                    (client)
 *
 * Run: node scripts/tests/chat-stop.mutation.mjs
 */
import { readFileSync } from "node:fs";
import { writeFileSync } from "./lib/sidecar-write.mjs";
import { execFileSync } from "node:child_process";

const GATE = "scripts/tests/chat-stop.test.mjs";
const LIB = "src/lib/chat/partial-usage.ts";
const ROUTE = "src/app/api/chat/route.ts";
const WORKSPACE = "src/components/chat/chat-workspace.tsx";
const COMPOSER = "src/components/chat/chat-composer.tsx";
const TARGETS = [GATE, LIB, ROUTE, WORKSPACE, COMPOSER];

const MUTANTS = [
  {
    name: "the output side is read from the snapshot instead of the count",
    file: LIB,
    from: "    output_tokens: finite(outputTokens),",
    to: "    output_tokens: finite(snapshot?.output_tokens),",
    expect: "the output side is the COUNTED figure",
  },
  {
    name: "a non-number in the snapshot passes straight through",
    file: LIB,
    from: "const finite = (v: unknown): number =>\n  typeof v === \"number\" && Number.isFinite(v) && v > 0 ? Math.round(v) : 0;",
    to: "const finite = (v: unknown): number => (typeof v === \"number\" ? v : 0);",
    expect: "NaN anywhere becomes 0",
  },
  {
    name: "the stream's cancel() no longer requests a stop",
    file: ROUTE,
    from: "      cancel() {\n        requestStop();\n      },",
    to: "      cancel() {\n        /* nothing */\n      },",
    expect: "and so does the stream's cancel()",
  },
  {
    name: "a stop before the first word keeps the hold",
    file: ROUTE,
    from: "                await releaseReservation(user.id, reservationId);\n                if (isFreeMessage) await releaseFreeChatMessage(user.id);\n                safeClose(controller);\n                return;",
    to: "                safeClose(controller);\n                return;",
    expect: "a stop before the first word releases the hold",
  },
  {
    name: "the partial reply is settled but never saved",
    file: ROUTE,
    from: "  const { error: partialSaveError } = await supabase.from(\"chat_messages\").insert({\n    conversation_id: conversationId,\n    user_id: userId,\n    role: \"assistant\",\n    content: assistantText,\n  });",
    to: "  const partialSaveError = null;",
    expect: "what was written is saved",
  },
  {
    name: "the client reports its own abort as a dropped connection",
    file: WORKSPACE,
    from: "      if (controller.signal.aborted) {\n        // Stopped by the reader, not by the network: not an error. The\n        // partial reply above is kept; the server settles for it and\n        // the balance is read back once it has.\n        setStoppedNote(true);\n        setTimeout(() => void refreshCredits(), 2500);\n      } else if (streamError) {",
    to: "      if (streamError) {",
    expect: "an abort is not reported as a dropped connection",
  },
  {
    name: "the composer never renders a stop button",
    file: COMPOSER,
    from: "        {sending && onStop ? (",
    to: "        {false ? (",
    expect: "the composer renders a stop button while sending",
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

console.log("chat-stop mutations\n");
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
    const onTarget = result.failed.filter((f) => f.includes(m.expect));
    if (onTarget.length === 0) {
      missed.push({ ...m, why: `the gate went red, but on "${result.failed.slice(0, 4).join('", "')}" — nothing matching "${m.expect}"` });
      console.log(`  WRONG   ${m.name}\n          -> red on: ${result.failed.slice(0, 4).join(" | ")}`);
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
console.log("Every clause in chat-stop.test.mjs is load-bearing.");
