#!/usr/bin/env node
/*
 * WHERE VOICE ACTUALLY IS, AND WHAT IT SAYS WHEN HALF OF IT IS OFF.
 *
 * scripts/tests/voice.test.mjs already proves the ARITHMETIC and the
 * ORB — 191 checks over pricing, margin, minute ledgers, plan
 * overrides, the compositor-only animation, reduced motion, the ten
 * locales. Every one of those is about voice once you have found it.
 *
 * This is about finding it, and about the state nobody had asked
 * about — V4 re-audit #2's last question, verbatim: "Τι σιωπά χωρίς
 * ELEVENLABS — το ΛΕΕΙ;"
 *
 * ------------------------------------------------------------------
 * THE ANSWER WAS NO, AND THE SHAPE OF THE BUG IS WORTH RECORDING
 * ------------------------------------------------------------------
 *
 * The two provider keys are independent. OPENAI_API_KEY drives
 * transcription (Whisper); ELEVENLABS_API_KEY drives speech. A
 * deployment with the first and not the second — the likely half-set-up
 * state, not an edge case — got:
 *
 *   every microphone working, everywhere;
 *   every "Listen" button silently not rendering;
 *   and the settings screen showing the usage bar and BOTH PRICES,
 *   including "Having it read to you — N credits a minute", for
 *   something that could not read anything.
 *
 * The cause was one boolean: `configured = transcribeAvailable ||
 * speakAvailable || included`. An OR over two independent keys can only
 * answer "is ANY of this on?", and the screen had no other question. So
 * the one surface that exists to explain voice quoted a price for a
 * dead feature, and the only other signal was the absence of a button,
 * which is not a signal.
 *
 * A quoted price is worse than silence. Silence is at least not a claim.
 *
 * ------------------------------------------------------------------
 * WHY THE REACH CHECK IS A REGISTRY AND NOT A SWEEP
 * ------------------------------------------------------------------
 *
 * "A microphone on every input" cannot be decided statically, and
 * pretending otherwise would be the more impressive-looking mistake:
 * whether a <textarea> wants dictation depends on whether a person
 * types SENTENCES into it. coding-workspace.tsx's box is font-mono and
 * serves five operations, four of which take source code. The onboarding
 * paste box exists to receive text that already exists somewhere else.
 * No regex knows that.
 *
 * So the list is written down, both halves of it, each with its reason —
 * MIC_REQUIRED goes red if an input LOSES its microphone, NO_MIC goes
 * red if a file on it quietly gains one, which would mean the argument
 * for excluding it had stopped being true and nobody said so.
 *
 * Run: node scripts/tests/voice-reach.test.mjs
 */
import { readFileSync, existsSync, readdirSync } from "node:fs";

let pass = 0;
const failures = [];
function check(name, cond, detail) {
  if (cond) { pass++; console.log(`  PASS  ${name}`); }
  else { failures.push(name); console.log(`  FAIL  ${name}${detail ? "\n        " + detail : ""}`); }
}
const LOCALES = ["ar", "de", "el", "en", "es", "fr", "it", "ja", "pt", "zh"];
const msg = Object.fromEntries(LOCALES.map((l) => [l, JSON.parse(readFileSync(`messages/${l}.json`, "utf8"))]));
// EVERY "in all ten" BELOW IS RELATIVE TO THIS ARRAY. Shorten it to
// ["en"] and each of them still reports a perfect score, as "(1/1)",
// with nine languages unchecked — a gate that has stopped working and
// announces it in a number that reads like a pass. Found by mutating
// legal-pages.test.mjs, which had the identical hole; the same floor
// belongs here.
const localeFiles = readdirSync("messages").filter((f) => f.endsWith(".json"));
const at = (root, dotted) => dotted.split(".").reduce((n, k) => (n == null ? undefined : n[k]), root);
// COMMENTS ARE NOT CODE, and in this repository that is a lesson with a
// scar: a gate has been defeated more than once by prose containing the
// literal it greps for. `{/* <VoiceInput ... */}` left behind by
// somebody mid-refactor would otherwise count as a rendered microphone.
const stripComments = (src) =>
  src
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, "")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/[^\n]*/g, "$1");
const read = (f) => (existsSync(f) ? stripComments(readFileSync(f, "utf8")) : null);

// ---------------------------------------------------------------------
console.log("== 0. the sweep is sweeping ten languages ==");
// ---------------------------------------------------------------------
check(
  `the sweep covers every locale file on disk (${LOCALES.length} vs ${localeFiles.length})`,
  localeFiles.length >= 10 && LOCALES.length === localeFiles.length,
  `on disk: ${localeFiles.join(", ")}`
);
check("…and zh and ar are among them", LOCALES.includes("zh") && LOCALES.includes("ar"));
// THE FLOOR ON LOCALES ITSELF. Every `gone` below is
// LOCALES.filter(...) asserted empty, and an empty LOCALES makes all of
// them vacuously true. The check above floors the FILES ON DISK, which
// is a different array — scripts/tests/gate-vacuity.test.mjs was right
// to keep asking.
check(`the locale sweep is ten wide (${LOCALES.length})`, LOCALES.length >= 10);

// ---------------------------------------------------------------------
console.log("\n== 1. every input a person types SENTENCES into takes a voice ==");
// ---------------------------------------------------------------------
const MIC_REQUIRED = [
  "src/components/chat/chat-composer.tsx",
  "src/components/create/create-chat.tsx",
  "src/components/research/research-workspace.tsx",
  "src/components/agents/agents-workspace.tsx",
  "src/components/website-builder/website-builder-workspace.tsx",
  "src/components/files/files-workspace.tsx",
  "src/components/mission/mission-form.tsx",
  // One file, every module's add form — so this single entry is the
  // microphone on twenty-odd screens.
  "src/components/modules/generic-add-form.tsx",
  // The two V4 re-audit #2 added. Both are a sentence somebody types to
  // ask a question, which is the same shape as the seven above.
  "src/components/records/ask-ai-modal.tsx",
  "src/components/data-analysis/analysis-workspace.tsx",
];
// `<VoiceInput`, NOT `VoiceInput`. Found by mutation: deleting the
// rendered element from ask-ai-modal.tsx left the gate GREEN, because
// the import at the top of the file still matched. A file that imports
// a control and never renders it has exactly the bug this check exists
// to catch, and the loose pattern called it a pass.
const RENDERS_MIC = /<VoiceInput\b/;
const missing = MIC_REQUIRED.filter((f) => !RENDERS_MIC.test(read(f) ?? ""));
check(
  `every sentence input renders VoiceInput (${MIC_REQUIRED.length - missing.length}/${MIC_REQUIRED.length})`,
  missing.length === 0,
  missing.join(", ")
);
check("the list is not empty", MIC_REQUIRED.length >= 10);
check(
  "every file on the list still exists",
  MIC_REQUIRED.every((f) => read(f) !== null),
  MIC_REQUIRED.filter((f) => read(f) === null).join(", ")
);

const NO_MIC = new Map([
  [
    "src/components/coding/coding-workspace.tsx",
    "one font-mono box serves five operations and four of them take SOURCE CODE; a microphone there would be right one time in five",
  ],
  [
    "src/components/onboarding/onboarding-flow.tsx",
    "the paste box exists to receive text that already exists somewhere else — dictating a spreadsheet's worth of rows is not the use case it was built for",
  ],
  [
    "src/components/text-actions/text-actions-textarea.tsx",
    "a drop-in replacement for a plain <textarea>, rendered INSIDE its hosts; generic-add-form.tsx already carries the microphone, so one here would be a second button on the same field",
  ],
  [
    "src/components/modules/generic-record-detail.tsx",
    "editing a row that already exists, not composing a new one",
  ],
  ["src/components/ideas/idea-row.tsx", "the same: an inline edit of existing text"],
]);
const gained = [...NO_MIC.keys()].filter((f) => RENDERS_MIC.test(read(f) ?? ""));
check(
  "no excluded input quietly gained a microphone",
  gained.length === 0,
  `${gained.join(", ")} — if that is right, move it to MIC_REQUIRED and say why`
);
check(
  "every exclusion still names a file that exists",
  [...NO_MIC.keys()].every((f) => read(f) !== null),
  [...NO_MIC.keys()].filter((f) => read(f) === null).join(", ")
);

// ---------------------------------------------------------------------
console.log("\n== 2. and it can be read back where an answer is long ==");
// ---------------------------------------------------------------------
// The brief names three: chat, research, agents. Those are the three
// places this product produces something long enough that hearing it
// beats reading it.
const LISTEN_SURFACES = [
  "src/components/chat/chat-workspace.tsx",
  "src/components/research/research-workspace.tsx",
  "src/components/agents/agents-workspace.tsx",
];
// `<VoicePlayer`, for the same reason, and because /VoicePlayer/ also
// matches VoicePlayerX — a rename that broke every call site would have
// passed.
const noListen = LISTEN_SURFACES.filter((f) => !/<VoicePlayer\b/.test(read(f) ?? ""));
check(
  `Listen is on all three (${LISTEN_SURFACES.length - noListen.length}/3)`,
  noListen.length === 0,
  noListen.join(", ")
);

// ---------------------------------------------------------------------
console.log("\n== 3. the price is on the control, BEFORE it is pressed ==");
// ---------------------------------------------------------------------
const input = read("src/components/voice/voice-input.tsx") ?? "";
const player = read("src/components/voice/voice-player.tsx") ?? "";
check(
  "the microphone shows its rate before recording",
  /costPerMinute/.test(input) && /permission\.cost/.test(input)
);
check(
  "Listen carries the estimate for THIS text, not a rate",
  /listenFor/.test(player) && /creditsPerMinute\.speak/.test(player),
  "a per-minute rate on a button that plays one specific answer is not a price the reader can act on"
);
for (const dotted of ["voice.costPerMinute", "voice.listenFor", "voice.permission.cost"]) {
  const gone = LOCALES.filter((l) => typeof at(msg[l], dotted) !== "string");
  check(`${dotted} in all ten (${LOCALES.length - gone.length}/10)`, gone.length === 0, gone.join(", "));
}

// ---------------------------------------------------------------------
console.log("\n== 4. the orb is fed REAL audio, not a loop that looks busy ==");
// ---------------------------------------------------------------------
const level = read("src/components/voice/use-audio-level.ts") ?? "";
// CALLS, NOT MENTIONS. use-audio-level.ts names getByteTimeDomainData
// twice — once in a comment explaining a TypeScript 5.7 buffer-typing
// quirk, and once where it actually reads the samples. A bare
// /getByteTimeDomainData/ is satisfied by the comment alone, so a file
// that had lost the call entirely would still pass. This repository has
// been bitten by a comment defeating its own gate more than once.
check("it opens an AnalyserNode", /\.createAnalyser\(\)/.test(level));
check("…and reads actual samples from it", /\.getByteTimeDomainData\(/.test(level));
check(
  "…from the microphone stream AND from the audio element",
  /\.createMediaStreamSource\(/.test(level) && /\.createMediaElementSource\(/.test(level),
  "speaking is measured from the audio that is playing, not faked while listening is real"
);
check(
  "the amplitude is computed by frameRms over those samples",
  /frameRms\(/.test(level),
  "a hard-coded or random level would animate identically and mean nothing"
);
// THE LINK, NOT A MENTION OF IT. This check used to be
// /useAudioLevel|levelRef|amplitude/ against voice-orb.tsx, and it
// matched nothing but PROSE — the orb names useAudioLevel only in a
// comment explaining why the prop is a function. Stripping comments
// turned it red, which is how it was found: the check had never been
// looking at code at all.
//
// The real chain is three links, and each is asserted: the orb takes a
// readLevel function, it CALLS it inside its frame loop, and the two
// components that render an orb feed it from useAudioLevel's result.
const orb = read("src/components/voice/voice-orb.tsx") ?? "";
check("the orb takes a level reader", /readLevel:\s*\(\)\s*=>\s*number/.test(orb));
check(
  "…and calls it every frame, into orbFrame",
  /orbFrame\([^)]*readLevel\(\)/.test(orb),
  "a prop that is accepted and never read animates nothing"
);
const orbHosts = ["src/components/voice/voice-input.tsx", "src/components/voice/voice-conversation.tsx"];
const unfed = orbHosts.filter((f) => {
  const src = read(f) ?? "";
  return !/useAudioLevel\(/.test(src) || !/readLevel=\{/.test(src);
});
check(
  `every component that renders an orb feeds it real audio (${orbHosts.length - unfed.length}/${orbHosts.length})`,
  unfed.length === 0,
  unfed.join(", ")
);

// ---------------------------------------------------------------------
console.log("\n== 5. half-configured SAYS SO, per direction ==");
// ---------------------------------------------------------------------
const availability = read("src/components/voice/voice-availability.tsx") ?? "";
check(
  "availability exposes each provider's configuration on its own",
  /configured:\s*\{\s*transcribe:\s*boolean;\s*speak:\s*boolean\s*\}/.test(availability),
  "folded into one boolean, the settings screen can only ask 'is ANY of this on?'"
);
check(
  "…read from the route's per-direction answer",
  /data\.configured\?\.transcribe === true/.test(availability) &&
    /data\.configured\?\.speak === true/.test(availability)
);

const settings = read("src/components/settings/voice-settings.tsx") ?? "";
check(
  "an unconfigured direction is styled as a warning, not as a price",
  /v\.configured\.transcribe \? "text-sm text-foreground" : "text-xs text-amber/.test(settings) ||
    /v\.configured\.transcribe$/m.test(settings)
);
// THE PRICE MUST BE THE CONSEQUENT OF THE TEST, not merely in the same
// file as it. Mutation again: deleting the conditional and printing the
// price unconditionally left `v.configured.speak` present in the banner
// below, so a check for the bare identifier stayed green over exactly
// the bug it was written for.
check(
  "settings prices speech only when speech is set up",
  /v\.configured\.speak\s*\n?\s*\?\s*t\("perMinute"/.test(settings),
  "this is the check that failed: both prices rendered whenever EITHER key was present"
);
check(
  "…and prices transcription the same way",
  /v\.configured\.transcribe\s*\n?\s*\?\s*t\("perMinute"/.test(settings)
);
check(
  "…and it names which half is off, rather than only omitting a price",
  /speakNotConfigured/.test(settings) && /transcribeNotConfigured/.test(settings)
);
for (const dotted of [
  "voice.settings.directionNotConfigured",
  "voice.settings.speakNotConfigured",
  "voice.settings.transcribeNotConfigured",
  "voice.settings.notConfigured",
]) {
  const gone = LOCALES.filter((l) => typeof at(msg[l], dotted) !== "string" || !at(msg[l], dotted).trim());
  check(`${dotted} in all ten (${LOCALES.length - gone.length}/10)`, gone.length === 0, gone.join(", "));
}
// zh and ar by name: ten English strings satisfy the sweep above.
for (const locale of ["zh", "ar"]) {
  check(
    `voice.settings.speakNotConfigured in ${locale} is not the English string`,
    at(msg[locale], "voice.settings.speakNotConfigured") !== at(msg.en, "voice.settings.speakNotConfigured")
  );
}

// The controls themselves must still refuse to render, which is the
// other half of the promise — a microphone that appears and then fails
// is what the availability provider exists to prevent.
check(
  "the microphone refuses to render when transcription is unavailable",
  /transcribeAvailable/.test(input)
);
check("Listen refuses to render when speech is unavailable", /speakAvailable/.test(player));

console.log(`\n${failures.length === 0 ? "OK" : "FAILED"}: ${pass} passed, ${failures.length} failed`);
if (failures.length) for (const f of failures) console.log(`  - ${f}`);
process.exit(failures.length === 0 ? 0 : 1);
