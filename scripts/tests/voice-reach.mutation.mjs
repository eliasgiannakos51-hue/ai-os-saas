#!/usr/bin/env node
/*
 * CAN voice-reach.test.mjs TELL A REACHABLE FEATURE FROM AN ABSENT ONE?
 *
 * The gate it checks was written for two findings that every existing
 * check passed through: two question boxes with no microphone, and a
 * settings screen quoting a per-minute price for speech on a deployment
 * with no ELEVENLABS_API_KEY. Both were invisible because the things
 * that would have shown them — a missing button, an OR over two
 * independent keys — look exactly like working software.
 *
 * A gate for an ABSENCE passes whether or not it is wired to anything,
 * so the mutants are the two findings put back, plus the ways the gate
 * itself could go quiet.
 *
 * Run: node scripts/tests/voice-reach.mutation.mjs
 */
import { readFileSync } from "node:fs";
import { writeFileSync } from "./lib/sidecar-write.mjs";
import { execFileSync } from "node:child_process";

const GATE = "scripts/tests/voice-reach.test.mjs";
const ASK = "src/components/records/ask-ai-modal.tsx";
const ANALYSIS = "src/components/data-analysis/analysis-workspace.tsx";
const SETTINGS = "src/components/settings/voice-settings.tsx";
const AVAIL = "src/components/voice/voice-availability.tsx";
const LEVEL = "src/components/voice/use-audio-level.ts";
const PLAYER = "src/components/voice/voice-player.tsx";
const AGENTS = "src/components/agents/agents-workspace.tsx";
const CODING = "src/components/coding/coding-workspace.tsx";
const ZH = "messages/zh.json";
const AR = "messages/ar.json";

const TARGETS = [GATE, ASK, ANALYSIS, SETTINGS, AVAIL, LEVEL, PLAYER, AGENTS, CODING, ZH, AR];

const MUTANTS = [
  // ---- the two findings, put back ------------------------------------
  {
    name: "Ask my records loses its microphone again",
    file: ASK,
    from: '                <VoiceInput\n                  compact',
    to: '                <span\n                  data-was="VoiceInpu"',
    expect: "every sentence input renders VoiceInput",
  },
  {
    name: "the data question box loses its microphone again",
    file: ANALYSIS,
    from: "              <VoiceInput\n                compact",
    to: '              <span\n                data-was="VoiceInpu"',
    expect: "every sentence input renders VoiceInput",
  },
  {
    // THE ELEVENLABS FINDING. A price for a feature that cannot run.
    name: "settings prices speech whether or not speech is set up",
    file: SETTINGS,
    from: "                {v.configured.speak\n                  ? t(\"perMinute\", { credits: v.creditsPerMinute.speak })\n                  : t(\"directionNotConfigured\")}",
    to: '                {t("perMinute", { credits: v.creditsPerMinute.speak })}',
    expect: "settings prices speech only when speech is set up",
  },
  {
    name: "…and stops naming which half is off",
    file: SETTINGS,
    from: "                  ? t(\"speakNotConfigured\")",
    to: '                  ? t("notConfigured")',
    expect: "names which half is off",
  },
  {
    name: "availability folds the two keys back into one answer",
    file: AVAIL,
    from: "  configured: { transcribe: boolean; speak: boolean };",
    to: "  configuredEither: boolean;",
    expect: "availability exposes each provider's configuration on its own",
  },

  // ---- the reach, in the other direction ------------------------------
  {
    name: "Listen disappears from agents",
    file: AGENTS,
    from: "<VoicePlayer",
    to: "<VoicePlayerRenamed",
    // BOTH of them: this file renders it twice.
    all: true,
    expect: "Listen is on all three",
  },
  {
    // An excluded file gaining a microphone means the argument for
    // excluding it stopped being true and nobody said so.
    // A RENDERED one. The first version of this mutant added a string
    // constant containing the word, which the gate correctly ignored —
    // it looks for `<VoiceInput`, not for the identifier.
    name: "an excluded input quietly gains a microphone",
    file: CODING,
    from: "        <textarea",
    to: "        <VoiceInput compact onTranscript={() => {}} />\n        <textarea",
    expect: "no excluded input quietly gained a microphone",
  },

  // ---- the orb's amplitude is real ------------------------------------
  {
    // THE CALL, not the comment above it. The first version of this
    // mutant replaced the mention in the TypeScript-buffer note and left
    // the real read untouched, so the gate stayed green over unchanged
    // code and this was filed as a survivor. It was a bad mutant, and it
    // still found something: the gate's pattern accepted the comment,
    // and now requires the call.
    name: "the level stops reading samples and could be anything",
    file: LEVEL,
    from: "node.getByteTimeDomainData(buffer);",
    to: "buffer.fill(128);",
    expect: "reads actual samples",
  },
  {
    name: "Listen goes back to quoting a rate instead of this clip's cost",
    file: PLAYER,
    from: "listenFor",
    to: "costPerMinute",
    expect: "Listen carries the estimate for THIS text",
  },

  // ---- the translations, zh AND ar -------------------------------------
  {
    name: "a zh voice string is replaced by its English source",
    file: ZH,
    from: '      "speakNotConfigured": "本部署未配置朗读功能，因此“收听”按钮不会出现。语音输入可正常使用。",',
    to: '      "speakNotConfigured": "Having answers read to you is not set up on this deployment, so the Listen buttons do not appear. Speaking to it works normally.",',
    expect: "in zh is not the English string",
  },
  {
    name: "an ar voice string is emptied",
    file: AR,
    from: '      "directionNotConfigured": "غير مُهيَّأ في هذا النشر",',
    to: '      "directionNotConfigured": "",',
    expect: "voice.settings.directionNotConfigured in all ten",
  },
  {
    name: "the ar speak sentence is replaced by its English source",
    file: AR,
    from: '      "speakNotConfigured": "قراءة الإجابات غير مُهيَّأة في هذا النشر، لذا لا تظهر أزرار الاستماع. أما التحدث إليه فيعمل كالمعتاد.",',
    to: '      "speakNotConfigured": "Having answers read to you is not set up on this deployment, so the Listen buttons do not appear. Speaking to it works normally.",',
    expect: "in ar is not the English string",
  },

  // ---- the gate's own instruments --------------------------------------
  {
    // The hole found by mutating legal-pages.test.mjs, checked for here
    // rather than assumed absent.
    name: "the sweep quietly shrinks to English only",
    file: GATE,
    from: 'const LOCALES = ["ar", "de", "el", "en", "es", "fr", "it", "ja", "pt", "zh"];',
    to: 'const LOCALES = ["en"];',
    expect: "the sweep covers every locale file on disk",
  },
  {
    // An empty registry makes every "reach" check pass by looking at
    // nothing at all.
    // The REGISTRY, not the derived list. Emptying `missing` leaves
    // MIC_REQUIRED.length at ten, so the floor never fires — which is
    // what the first version of this mutant did, and it was reported as
    // a survivor when the gate was behaving correctly.
    name: "the list of inputs that must have a microphone is emptied",
    file: GATE,
    from: 'const MIC_REQUIRED = [\n  "src/components/chat/chat-composer.tsx",',
    to: "const MIC_REQUIRED = [\n  // emptied",
    expect: "the list is not empty",
  },
  {
    name: "the file reader silently returns nothing",
    file: GATE,
    from: 'const read = (f) => (existsSync(f) ? stripComments(readFileSync(f, "utf8")) : null);',
    to: "const read = () => null;",
    expect: "every file on the list still exists",
  },
];

const MAX_BUFFER = 32 * 1024 * 1024;
function runGate() {
  try {
    execFileSync(process.execPath, [GATE], { encoding: "utf8", stdio: "pipe", maxBuffer: MAX_BUFFER });
    return { green: true, failed: [] };
  } catch (e) {
    const out = String(e.stdout ?? "") + String(e.stderr ?? "");
    const failed = [...out.matchAll(/^ {2}- (.+)$/gm)].map((m) => m[1]);
    if (failed.length === 0 && (e.code === "ENOBUFS" || e.killed)) {
      return { green: false, failed: [`<the gate was killed: ${e.code ?? "signal " + e.signal}>`] };
    }
    return { green: false, failed };
  }
}

console.log("voice-reach mutations\n");
const originals = new Map(TARGETS.map((f) => [f, readFileSync(f, "utf8")]));
const restoreAll = () => { for (const [file, text] of originals) writeFileSync(file, text); };

let caught = 0;
const missed = [];
try {
  const base = runGate();
  console.log(`baseline: the gate is ${base.green ? "GREEN" : "RED"} on the unmutated tree`);
  if (!base.green) {
    console.log(`\nBASELINE IS RED — no result below would mean anything.\n  ${base.failed.join("\n  ")}`);
    process.exit(1);
  }
  for (const m of MUTANTS) {
    const edits = m.edits ?? [{ file: m.file, from: m.from, to: m.to, all: m.all }];
    const stale = edits.filter((e) => !originals.get(e.file).includes(e.from));
    if (stale.length > 0) {
      missed.push({ ...m, why: `the mutation target no longer exists in ${stale.map((e) => e.file).join(", ")}` });
      console.log(`  STALE   ${m.name}`);
      continue;
    }
    const byFile = new Map();
    for (const e of edits) {
      const current = byFile.get(e.file) ?? originals.get(e.file);
      // `all` REPLACES EVERY OCCURRENCE. Without it a mutant that
      // deletes "the" call site deletes only the FIRST — and
      // agents-workspace.tsx renders <VoicePlayer twice, so the gate
      // stayed correctly green over a file that still had one, and the
      // mutant was filed as a survivor of a check that works.
      byFile.set(e.file, e.all ? current.replaceAll(e.from, e.to) : current.replace(e.from, e.to));
    }
    if ([...byFile.entries()].every(([file, text]) => text === originals.get(file))) {
      missed.push({ ...m, why: "the mutation left every file byte-identical" });
      console.log(`  NO-OP   ${m.name}`);
      continue;
    }
    for (const [file, text] of byFile) writeFileSync(file, text);
    let result;
    try { result = runGate(); } finally { restoreAll(); }
    if (result.green) {
      missed.push({ ...m, why: "the gate stayed green — nothing here is load-bearing" });
      console.log(`  MISSED  ${m.name}`);
      continue;
    }
    const onTarget = result.failed.filter((f) => f.includes(m.expect));
    if (onTarget.length === 0) {
      missed.push({ ...m, why: `red, but on "${result.failed.join('", "')}" — nothing matching "${m.expect}"` });
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
console.log(after.green ? "\nbaseline: green again on the restored tree" : `\nTHE TREE DID NOT RESTORE:\n  ${after.failed.join("\n  ")}`);
console.log(`\n${caught}/${MUTANTS.length} caught`);
if (missed.length) { console.log("\nSurvivors:"); for (const m of missed) console.log(`  - ${m.name}\n      ${m.why}`); }
process.exit(missed.length === 0 && after.green ? 0 : 1);
