#!/usr/bin/env node
/*
 * WOULD A SPOKEN SENTENCE STILL WAIT FOR YES?
 *
 * Run: node scripts/tests/voice-command.mutation.mjs
 *
 * Each defect below is a small edit that reads like an improvement -
 * "skip the extra click", "one less state", "the photo is a detail" - and
 * each one lets a transcript spend credits or file an entry that nobody
 * read first. The gate must go red on the clause that names it.
 */
import { readFileSync } from "node:fs";
import { writeFileSync } from "./lib/sidecar-write.mjs";
import { execFileSync } from "node:child_process";

const GATE = "scripts/tests/voice-command.test.mjs";
const VC = "src/lib/voice/voice-command.ts";
const CHAT = "src/components/create/create-chat.tsx";
const ROUTES = "src/lib/create-studio/producer-routes.ts";
const AMB = "src/lib/ai/ambiguity.ts";

const MUTANTS = [
  {
    // THE EXTRA CLICK IS REMOVED: hearing is treated as agreeing.
    name: "a transcript confirms itself",
    file: VC,
    from: "      return { kind: \"heard\", transcript, plan };",
    to: "      return { kind: \"confirmed\", plan };",
    expect: "TRANSCRIBED never confirms",
  },
  {
    // YES WITH NOTHING HEARD still produces an action to run.
    name: "CONFIRM confirms from any state",
    file: VC,
    from: "      return state.kind === \"heard\" ? { kind: \"confirmed\", plan: state.plan } : state;",
    to: "      return { kind: \"confirmed\", plan: state.kind === \"heard\" ? state.plan : { kind: \"classify\", brief: \"\" } };",
    expect: "CONFIRM does nothing without something heard",
  },
  {
    // THE PHOTO IS A DETAIL: the text alone routes, and the picture is dropped.
    name: "a spoken sentence ignores the attached photo",
    file: VC,
    from: "event.withImages ? { kind: \"classify\", brief: transcript } : preflight(transcript)",
    to: "preflight(transcript)",
    expect: "the photo is not dropped",
  },
  {
    // THE MICROPHONE SENDS STRAIGHT AWAY - the shape the owner's rule forbids.
    name: "the microphone sends the transcript without asking",
    file: CHAT,
    from: "setVoice((v) => voiceStep(v, { type: \"TRANSCRIBED\", transcript: combined, withImages: imageFiles.length > 0 }));",
    to: "void sendToClassifier(combined);",
    expect: "the microphone's handler",
  },
  {
    // THE CARD STOPS QUOTING: Yes is asked for without showing what was heard.
    name: "the asking card no longer shows what it heard",
    file: CHAT,
    from: "        <VoiceSendConfirm\n          heard={voice.transcript}",
    to: "        <VoiceSendConfirm\n          heard=\"\"",
    expect: "every card from the microphone says what it heard",
  },
  {
    // "σάιτ" FORGOTTEN: the most common spoken request reaches no tool.
    name: "the router forgets how Whisper spells site in Greek",
    file: ROUTES,
    from: "stems: [\"ιστοσελιδ\", \"ιστοτοπ\", \"καταστημ\", \"σαιτ\"],",
    to: "stems: [\"ιστοσελιδ\", \"ιστοτοπ\", \"καταστημ\"],",
    expect: "σάιτ",
  },
  {
    // A SECOND CALLER SKIPS THE DRAFT, with no card of its own to ask.
    name: "the chat composer drops the transcript dialog",
    file: "src/components/chat/chat-composer.tsx",
    from: "<VoiceInput",
    to: "<VoiceInput review=\"card\"",
    expect: "only the Home field skips the transcript dialog",
  },
  {
    // THE APOSTROPHE IS A QUOTE AGAIN: "κάν' το" stops being a question.
    name: "an elision mark reads as a quotation",
    file: AMB,
    from: "      /(^|[\\s(])'[^'\\n]+'(?=$|[\\s.,!?;:)])/.test(raw) ||",
    to: "      /'/.test(raw) ||",
    expect: "κάν' το",
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

console.log("voice-command mutations\n");
const TARGETS = [...new Set(MUTANTS.map((m) => m.file))];
const originals = new Map(TARGETS.map((f) => [f, readFileSync(f, "utf8")]));
const restoreAll = () => { for (const [file, text] of originals) writeFileSync(file, text); };

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
    try { result = runGate(); } finally { restoreAll(); }
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
console.log(after.green ? "\nbaseline: the gate is green again on the restored tree" : "\nBASELINE IS RED — a mutation was not restored. Check `git diff`.");
console.log(`\n${caught} of ${MUTANTS.length} mutations caught.`);
if (missed.length > 0 || !after.green) {
  if (missed.length > 0) {
    console.log("\nHOLES:");
    for (const m of missed) console.log(`  - ${m.name}\n    ${m.why}`);
  }
  process.exit(1);
}
console.log("A transcript that would act without a Yes goes red here first.");
