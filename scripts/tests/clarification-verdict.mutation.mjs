#!/usr/bin/env node
/*
 * WOULD ANYBODY NOTICE IF THE MEASUREMENT STOPPED MEASURING?
 *
 * This is the shape the whole item is about, so it is the shape most
 * worth mutating. The feature works either way — a dropped verdict costs
 * no user anything, breaks no screen, fails no other gate. It just
 * quietly returns the product to the state V5 #6 shipped in: two thirds
 * built, and no way to say whether the third was working.
 *
 * The last two are the ones to read. A question asked AFTER the credits
 * are held still looks correct on screen — the person sees the same
 * question — and it cost them a hold to be asked. And a chat that asks
 * on every message rather than only the first is the version of this
 * feature that gets switched off.
 *
 * Run: node scripts/tests/clarification-verdict.mutation.mjs
 */
import { readFileSync } from "node:fs";
import { writeFileSync } from "./lib/sidecar-write.mjs";
import { execFileSync } from "node:child_process";

const GATE = "scripts/tests/clarification-verdict.test.mjs";
const AMBIGUITY = "src/lib/ai/ambiguity.ts";
const CLARIFICATION = "src/lib/clarification.ts";
const CLIENT = "src/lib/clarification-client.ts";
const SITE = "src/app/api/websites/generate/route.ts";
const CHAT = "src/app/api/chat/route.ts";
const UI = "src/components/chat/chat-workspace.tsx";
const TARGETS = [GATE, AMBIGUITY, CLARIFICATION, CLIENT, SITE, CHAT, UI];


/**
 * The two blocks, in the order they are in, and the same two reversed.
 *
 * Returns `{ from: "", to: "" }` when either delimiter has moved, which
 * the runner reports as STALE — the right outcome for a mutation whose
 * target it can no longer find, and better than silently mutating half
 * of one block.
 */
function swapChatBlocks() {
  const src = readFileSync(CHAT, "utf8");
  const CHECK_START = "        // ================================================================\n        // STOP AND ASK, BEFORE ANYTHING IS HELD";
  const RESERVE_START = '        let reservationId = "";';
  const RESERVE_END = "          reservationId = reservation.reservationId;\n        }\n";
  const a = src.indexOf(CHECK_START);
  const b = src.indexOf(RESERVE_START);
  const c = src.indexOf(RESERVE_END, b);
  if (a < 0 || b < 0 || c < 0 || b < a) return { from: "", to: "" };
  const check = src.slice(a, b);
  const reserve = src.slice(b, c + RESERVE_END.length);
  return { from: check + reserve, to: reserve + check };
}

const MUTANTS = [
  {
    // 1. THE VERDICT IS DROPPED AGAIN, on the path that produces it for
    // free — which is the common one, so the log fills with nothing but
    // the requests the free reader could not decide and the rate reads
    // 100% for ever. This is exactly the state V5 #6 shipped in.
    name: "the free short-circuit stops carrying its verdict",
    file: CLARIFICATION,
    from: "    return { needsClarification: false, verdict: assessment.verdict, paidCheck: false };",
    to: "    return { needsClarification: false, verdict: assessment.verdict, paidCheck: true };",
    expect: "the free short-circuit reports paidCheck false",
  },
  {
    // 2. A BROKEN PAID CALL IS COUNTED AS A FREE DECISION. The tool came
    // back malformed, the tokens were spent, and the row says the free
    // reader settled it — the one direction this measurement must never
    // be wrong in, because it flatters the thing being measured.
    name: "a malformed tool response is recorded as if nothing was spent",
    file: CLARIFICATION,
    from: 'if (!toolUse) return { needsClarification: false, verdict: assessment.verdict, paidCheck: true };',
    to: 'if (!toolUse) return { needsClarification: false, verdict: assessment.verdict, paidCheck: false };',
    expect: "a malformed tool response reports paidCheck TRUE",
  },
  {
    // 3. THE POLICY IS RESTATED INSTEAD OF ASKED FOR. Same behaviour
    // today, two places to change tomorrow — and the last time this
    // repository had two copies of it, one of them said only `unsure`
    // pays and was asserted by three green checks.
    name: "the spending condition is copied back into clarification.ts",
    file: CLARIFICATION,
    from: "if (!willSpendOnQuestion(assessment)) {",
    to: 'if (assessment.verdict === "clear") {',
    expect: "clarification.ts asks rather than restating the condition",
  },
  {
    // 4. ASKED BECOMES PAID. A check that ran and concluded "no question
    // needed" would be counted as an interruption, and the number the
    // owner reads as "how often we interrupt people" would be wrong
    // upward — reporting a product worse than it is, which is its own
    // kind of lie.
    name: "the builder reports a paid check as a question asked",
    file: CLIENT,
    from: "    clarification_asked: decision.needsClarification,",
    to: "    clarification_asked: decision.paidCheck,",
    expect: "a paid check that asked nothing is paid and not asked",
  },
  {
    // 5. THE DENOMINATOR GOES. The `clear` path spends nothing, the early
    // return fires, and no row is written — so every row in the log is a
    // failure of the free reader and the ratio has nothing under it.
    name: "a costless verdict stops being settled",
    file: SITE,
    from: "      if (costs.callCount === 0 && !hasVerdict) return;",
    to: "      if (costs.callCount === 0) return;",
    expect: "a verdict is settled even when nothing was spent",
  },
  {
    // 6. THE QUESTION MOVES BEHIND THE RESERVATION. On screen it looks
    // identical; the difference is that the person paid a hold to be
    // asked a question instead of being answered.
    //
    // THIS ONE IS COMPUTED, NOT TYPED, and that is the only honest way to
    // write it. The clause it targets compares two POSITIONS in the file,
    // so only a mutation that genuinely reorders the code exercises it —
    // a first draft prefixed the guard with `false &&`, which disables
    // the check without moving it, and the gate stayed green. Correctly:
    // the clause says "before", and `false &&` is a different defect
    // (mutation 7 covers that shape). So the two blocks are read out of
    // the file and swapped.
    name: "chat asks after the credits are held",
    file: CHAT,
    ...swapChatBlocks(),
    expect: "the check happens BEFORE the reservation",
  },
  {
    // 7. EVERY MESSAGE IS INTERRUPTED, not just the first. This is the
    // version of the feature that gets turned off within a week, and no
    // other gate in the repository would notice it.
    name: "chat interrupts mid-conversation too",
    file: CHAT,
    from: "history.length === 0 && !isFreeMessage && !skipClarification",
    to: "!isFreeMessage && !skipClarification",
    expect: "only the opening message is ever interrupted",
  },
  {
    // 8. SKIP STOPS SKIPPING. The person presses "answer it anyway", the
    // same text goes back with no flag, the conversation still has no
    // history, and they meet the identical question again.
    name: "the skip button resends without turning the check off",
    file: UI,
    from: "void handleSend(clarify.text, { skipClarification: true })",
    to: "void handleSend(clarify.text)",
    expect: "skip resends with the check turned off",
  },
];

function runGate() {
  try {
    execFileSync(process.execPath, [GATE], { encoding: "utf8", stdio: "pipe", timeout: 600_000 });
    return { green: true, failed: [] };
  } catch (e) {
    const out = String(e.stdout ?? "") + String(e.stderr ?? "");
    return { green: false, failed: [...out.matchAll(/^ {2}FAIL {2}(.+)$/gm)].map((m) => m[1].trim()) };
  }
}

console.log("clarification-verdict mutations\n");

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
