#!/usr/bin/env node
/*
 * CAN THE VOICE GATE GO RED?
 *
 * Every defect this workstream can introduce is silent from inside the
 * product:
 *
 *   A MICROPHONE THAT OPENS ITSELF, or one that stays open after the UI
 *   says it stopped. The browser's recording dot is the only witness, and
 *   nobody screenshots it.
 *
 *   A PRICE THAT LOSES MONEY. Speech is billed per character by somebody
 *   else. A rate typed one order of magnitude low, or a margin that stops
 *   being applied, looks exactly like a working feature until the invoice.
 *
 *   AN ORB THAT COSTS A FRAME. Driving `width` or `box-shadow` off an
 *   audio signal at 60fps renders identically to driving `transform` —
 *   right up until the main thread is the thing being animated.
 *
 *   A CEILING THAT DOES NOT HOLD. Minutes counted after the provider call
 *   instead of before it, a limit read as unlimited, an allowance that
 *   goes negative.
 *
 *   A LOCALE WITH NO WORDS, which is invisible to the compiler because
 *   every one of these keys is built at runtime from a state name, a
 *   voice name or an error code.
 *
 * Run: node scripts/tests/voice.mutation.mjs
 */
import { readFileSync } from "node:fs";
import { writeFileSync } from "./lib/sidecar-write.mjs";
import { execFileSync } from "node:child_process";

const GATE = "scripts/tests/voice.test.mjs";
const CEILING_GATE = "scripts/tests/combined-ceiling.test.mjs";

const PRICING = "src/lib/voice/voice-pricing.ts";
const CONFIG = "src/lib/voice/voice-config.ts";
const VISUAL = "src/lib/voice/voice-visual.ts";
const RECORDER = "src/components/voice/use-recorder.ts";
const INPUT = "src/components/voice/voice-input.tsx";
const PLAYER = "src/components/voice/voice-player.tsx";
const CONVERSATION = "src/components/voice/voice-conversation.tsx";
const PROVIDERS = "src/lib/voice/voice-providers.ts";
const CSS = "src/app/globals.css";
const EN = "messages/en.json";
const EL = "messages/el.json";
const POLICY = "src/lib/billing/margin-policy.ts";
const SETTINGS = "src/components/settings/voice-settings.tsx";
const SETTINGS_PAGE = "src/app/dashboard/settings/page.tsx";

const MUTANTS = [
  // ------------------------------------------------------------------
  // THE MONEY.
  // ------------------------------------------------------------------
  {
    name: "the speech rate is typed one decimal place low",
    file: PRICING,
    from: "speakPer1kChars: 0.15,",
    to: "speakPer1kChars: 0.015,",
  },
  {
    name: "voiceCredits stops applying the margin and charges cost price",
    file: PRICING,
    from: "  return creditsForRealCostEur(usdToEur(usdCost, c), c, marginMultiplier);",
    to: "  return creditsForRealCostEur(usdToEur(usdCost, c), c, 1);",
  },
  {
    name: "a one-second clip is charged nothing, so short dictation is free work",
    file: PRICING,
    from: "  if (!Number.isFinite(seconds) || seconds <= 0) return 0;\n  return (seconds / 60) * VOICE_RATES_USD.transcribePerMinute;",
    to: "  if (!Number.isFinite(seconds) || seconds <= 5) return 0;\n  return (seconds / 60) * VOICE_RATES_USD.transcribePerMinute;",
  },
  {
    name: "a negative duration produces a negative cost, which is a refund somebody can mint",
    file: PRICING,
    from: "  if (!Number.isFinite(seconds) || seconds <= 0) return 0;\n  return (seconds / 60) * VOICE_RATES_USD.transcribePerMinute;",
    to: "  if (!Number.isFinite(seconds)) return 0;\n  return (seconds / 60) * VOICE_RATES_USD.transcribePerMinute;",
  },
  {
    name: "voice loses its margin-policy feature, so a per-plan override never reaches it",
    file: POLICY,
    from: 'voiceSpeak: "voice"',
    to: 'voiceSpeak: "chat"',
  },

  // ------------------------------------------------------------------
  // THE CEILING.
  // ------------------------------------------------------------------
  {
    name: "the free plan silently gains voice minutes it is not billed for",
    file: PRICING,
    from: "free: 0,",
    to: "free: 60,",
  },
  {
    name: "an out-of-range env override is taken instead of warned about",
    file: PRICING,
    from: "    if (!Number.isInteger(parsed) || parsed < 0) {",
    to: "    if (false) {",
  },
  {
    name: "an exhausted allowance reports negative seconds remaining",
    file: PRICING,
    from: "    remainingSeconds: Math.max(0, limitSeconds - Math.max(0, usedSeconds)),",
    to: "    remainingSeconds: limitSeconds - Math.max(0, usedSeconds),",
  },
  {
    name: "fitsInAllowance compares the wrong way round, so a clip that overruns is allowed",
    file: PRICING,
    from: "  return seconds > 0 && seconds <= allowance.remainingSeconds;",
    to: "  return seconds > 0 || seconds <= allowance.remainingSeconds;",
  },
  {
    name: "the minute table stops being classified as a capacity limit",
    file: "scripts/tests/combined-ceiling.test.mjs",
    from: "  DEFAULT_VOICE_MINUTE_LIMITS: {",
    to: "  DEFAULT_VOICE_MINUTE_LIMITS_RENAMED: {",
    gate: CEILING_GATE,
  },

  // ------------------------------------------------------------------
  // THE MICROPHONE.
  // ------------------------------------------------------------------
  {
    name: "the recorder leaves the tracks live after stopping, so the browser's dot stays on",
    file: RECORDER,
    from: '      releaseStream(media);\n      setStream(null);\n      recorderRef.current = null;\n      setState("idle");\n      if (blob.size === 0) {',
    to: '      setStream(null);\n      recorderRef.current = null;\n      setState("idle");\n      if (blob.size === 0) {',
  },
  {
    name: "the stream is released AFTER the callback, so the dot lingers through the upload",
    file: RECORDER,
    from: '      releaseStream(media);\n      setStream(null);\n      recorderRef.current = null;\n      setState("idle");',
    to: '      setStream(null);\n      recorderRef.current = null;\n      setState("idle");\n      queueMicrotask(() => releaseStream(media));',
  },
  {
    name: "the hard clip ceiling is removed, so a stuck tab streams a room until the browser closes",
    file: RECORDER,
    from: "    stopTimerRef.current = window.setTimeout(() => stop(), MAX_CLIP_SECONDS * 1000);",
    to: "    stopTimerRef.current = null;",
  },
  {
    name: "an effect starts recording on mount — the one thing the brief says never to do",
    file: RECORDER,
    from: "  useEffect(() => {\n    return () => {\n      cleanup();",
    to: "  useEffect(() => {\n    void start();\n    return () => {\n      cleanup();",
  },
  {
    // V4.6: the mic no longer vanishes — it is drawn inert, with the reason
    // in its title. The defect is now a mic that is LIVE without a
    // provider: pressing it would start a recording nothing can transcribe.
    name: "the microphone button renders LIVE with no transcription provider, so pressing it wastes somebody's breath",
    file: INPUT,
    from: "        disabled\n        aria-disabled=\"true\"\n        aria-label={`${t(\"startListening\")} — ${reason}`}",
    to: "        onClick={() => void start()}\n        aria-label={`${t(\"startListening\")} — ${reason}`}",
  },
  {
    name: "the explanation is skipped and the browser's bare permission prompt is the first thing seen",
    file: INPUT,
    from: "    if (!explainedRef.current) {\n      setExplaining(true);\n      return;\n    }",
    to: "    if (false) {\n      setExplaining(true);\n      return;\n    }",
  },
  {
    name: "the transcript is handed straight to the parent with no chance to correct it",
    file: INPUT,
    from: '        setDraft(String(data.text ?? ""));',
    to: '        onTranscript(String(data.text ?? ""));',
  },

  // ------------------------------------------------------------------
  // THE ORB.
  // ------------------------------------------------------------------
  {
    name: "the frame gains a width, so an audio signal drives layout at 60fps",
    file: VISUAL,
    from: "  return {\n    scale: pulseScale(state, amplitude),\n    halo: haloOpacity(state, amplitude),\n    rotation: rotationDegrees(state, elapsedMs),\n  };",
    to: "  return {\n    scale: pulseScale(state, amplitude),\n    halo: haloOpacity(state, amplitude),\n    rotation: rotationDegrees(state, elapsedMs),\n    width: 200 + amplitude * 40,\n  } as OrbFrame & { width: number };",
  },
  {
    name: "silence no longer produces scale exactly 1, so the globe visibly shrinks between words",
    file: VISUAL,
    from: "  listening: { min: 1, max: 1.28 },",
    to: "  listening: { min: 0.94, max: 1.28 },",
  },
  {
    name: "speaking and listening share a pulse ceiling AND a colour, so the two states look identical",
    edits: [
      {
        from: "  speaking: { min: 1, max: 1.16 },",
        to: "  speaking: { min: 1, max: 1.28 },",
      },
      {
        from: 'speaking: "--voice-speaking",',
        to: 'speaking: "--voice-listening",',
      },
    ],
    file: VISUAL,
  },
  {
    name: "reduced motion gets a moving globe anyway",
    file: VISUAL,
    from: "    scale: 1,\n    halo: (HALO_OPACITY[state] ?? HALO_OPACITY.idle).min,\n    rotation: 0,",
    to: "    scale: 1.1,\n    halo: (HALO_OPACITY[state] ?? HALO_OPACITY.idle).min,\n    rotation: 45,",
  },
  {
    name: "reduced motion makes listening look exactly like idle, so nobody can tell the mic is open",
    file: VISUAL,
    from: "  listening: { min: 0.12, max: 0.55 },",
    to: "  listening: { min: 0, max: 0.55 },",
  },
  {
    name: "isMicrophoneOpen says the mic is open while it is only speaking",
    file: VISUAL,
    from: '  return state === "listening";',
    to: '  return state === "listening" || state === "speaking";',
  },
  {
    name: "smoothing lets a bad frame push the amplitude outside 0..1",
    file: VISUAL,
    from: "  const safePrevious = Number.isFinite(previous) ? Math.max(0, Math.min(1, previous)) : 0;",
    to: "  const safePrevious = Number.isFinite(previous) ? previous : 0;",
  },
  {
    name: "attack and release become symmetric, so the globe snaps shut between syllables",
    file: VISUAL,
    from: "export const SMOOTHING = { attack: 0.5, release: 0.12 } as const;",
    to: "export const SMOOTHING = { attack: 0.5, release: 0.5 } as const;",
  },
  {
    name: "the orb's halo is driven through a box-shadow instead of opacity",
    file: CSS,
    from: "  opacity: var(--orb-halo);\n  transform: scale(var(--orb-scale));",
    to: "  opacity: 1;\n  box-shadow: 0 0 calc(var(--orb-halo) * 60px) currentColor;\n  width: calc(100% * var(--orb-scale));",
  },
  {
    name: "the light theme loses its voice colours, so every state is the dark palette on white",
    file: CSS,
    from: "  --voice-listening: 234 88 12;",
    to: "  --voice-listening-unused: 234 88 12;",
  },
  {
    // Targets the ORB'S OWN reduced-motion rule rather than the first
    // `@media (prefers-reduced-motion: reduce)` in the file — the
    // stylesheet has several, and mutating one that says nothing about
    // the orb is not a defect this gate should claim to catch.
    name: "the orb stops honouring the OS reduced-motion setting; only the app's own switch is left",
    file: CSS,
    from: '  html:not([data-motion="full"]) .voice-orb-globe,\n  html:not([data-motion="full"]) .voice-orb-halo,\n  html:not([data-motion="full"]) .voice-orb-ring {',
    to: '  html:not([data-motion="full"]) .voice-orb-globe-unused {',
  },

  // ------------------------------------------------------------------
  // SILENCE AND THE LOOP.
  // ------------------------------------------------------------------
  {
    name: "the silence threshold drops below room tone, so the turn never ends by itself",
    file: CONFIG,
    from: "  rmsThreshold: 0.015,",
    to: "  rmsThreshold: 0.0005,",
  },
  {
    name: "the hangover shrinks to a pause inside a sentence, cutting people off mid-thought",
    file: CONFIG,
    from: "  hangoverMs: 1200,",
    to: "  hangoverMs: 200,",
  },
  {
    name: "a turn can end before anybody has said anything",
    file: CONFIG,
    from: "  if (state.elapsedMs < SILENCE.minSpeechMs) return { end: false, reason: null };\n  if (!state.heardSpeech) return { end: false, reason: null };",
    to: "  if (state.elapsedMs < 1) return { end: false, reason: null };",
  },
  {
    name: "the conversational ceiling passes the hard clip ceiling, so the safety net is behind the feature",
    file: CONFIG,
    from: "  maxTurnMs: 30_000,",
    to: "  maxTurnMs: 300_000,",
  },
  {
    name: "the conversation never returns to listening, so it is a monologue with extra steps",
    file: CONVERSATION,
    from: "      audio.onended = () => {\n        if (abandonedRef.current) return;",
    to: "      audio.onended = () => {\n        if (true) return;",
  },

  // ------------------------------------------------------------------
  // FORMATS, LANGUAGES AND KEYS.
  // ------------------------------------------------------------------
  {
    name: "Safari's MP4 is dropped, so the feature does not exist on iOS",
    file: CONFIG,
    from: '  "audio/webm",\n  "audio/mp4",\n  "audio/mpeg",\n  "audio/ogg",',
    to: '  "audio/webm",\n  "audio/mpeg",\n  "audio/ogg",',
  },
  {
    name: "an unknown locale gets English forced on it as a language constraint",
    file: CONFIG,
    from: "  return isVoiceLanguage(locale) ? locale : undefined;",
    to: '  return isVoiceLanguage(locale) ? locale : "en";',
  },
  {
    name: "the language is sent unconditionally, so somebody speaking Greek into an English UI gets English back",
    file: PROVIDERS,
    from: '  if (params.languageHint) form.append("language", params.languageHint);',
    to: '  form.append("language", params.languageHint ?? "en");',
  },
  {
    name: "the provider key is used to build a client before it is checked",
    file: PROVIDERS,
    from: "const PROVIDER_TIMEOUT_MS = 20_000;",
    to: "const PROVIDER_TIMEOUT_MS = 5;",
  },
  {
    name: "Greek loses one voice state label — invisible to the compiler, since the key is built from a state name",
    file: EL,
    from: '"thinking": "Σκέφτεται"',
    to: '"thinkingX": "Σκέφτεται"',
  },
  {
    name: "Greek loses the out-of-minutes error, so a Greek user out of minutes reads English",
    file: EL,
    from: '"out_of_minutes"',
    to: '"out_of_minutesX"',
  },
  {
    name: "the price placeholder is dropped from the Listen button in English",
    file: EN,
    from: '"listenFor": "Listen · {credits, plural, one {# credit} other {# credits}}"',
    to: '"listenFor": "Listen"',
  },
  {
    name: "the permission dialog stops naming the monthly minute limit",
    file: EN,
    from: '"cost": "{credits, plural, one {# credit} other {# credits}} per minute, {minutes, plural, one {# minute} other {# minutes}} a month on your plan."',
    to: '"cost": "{credits} credits per minute."',
  },
  {
    // THE ANCHOR WAS STALE BECAUSE THE BUG IT NAMED WAS FIXED. It quoted
    // `formatNumber(estimatedCredits, locale)`, and `listenFor` is an ICU
    // PLURAL: a plural picks its category with Number(), formatNumber(1000)
    // is "1,000", and Number("1,000") is NaN — so the button printed NaN
    // credits. The formatting was correctly removed (ICU's `#` formats for
    // the locale itself) and this file was not updated, so the mutation
    // silently stopped applying and the price on the button stopped being
    // checked at all. scripts/tests/plural-forms.test.mjs is what now
    // refuses the formatted-string form; this one guards the price being
    // there.
    name: "the Listen button loses the price it charges, so the cost is discovered afterwards",
    file: PLAYER,
    from: '{playing ? t("pause") : t("listenFor", { credits: estimatedCredits })}',
    to: '{playing ? t("pause") : t("listen")}',
  },
  {
    name: "the settings panel disappears entirely when voice is off, teaching that the feature does not exist",
    file: SETTINGS,
    from: "  if (!v.loaded) return null;",
    to: "  if (!v.loaded || !v.included) return null;",
  },
  {
    name: "the settings panel stops distinguishing 'not on your plan' from 'no keys here'",
    file: SETTINGS,
    from: 't("notConfigured")',
    to: 't("notIncluded")',
  },
  {
    // Stale for the same reason as the player anchor above: `perMinute`
    // is a plural too, so the formatNumber() wrapper had to go.
    name: "the settings panel quotes one price for both kinds of voice work",
    file: SETTINGS,
    from: "credits: v.creditsPerMinute.speak",
    to: "credits: v.creditsPerMinute.transcribe",
  },
  {
    name: "the settings page stops mounting the panel, so the minutes are nowhere",
    file: SETTINGS_PAGE,
    from: "<Reveal><VoiceSettings /></Reveal>",
    to: "<Reveal>{null}</Reveal>",
  },
  {
    name: "the player renders with no speech provider configured",
    file: PLAYER,
    from: "  if (!availability.speakAvailable) return null;",
    to: "  if (false) return null;",
  },
];

let caught = 0;
const missed = [];
for (const m of MUTANTS) {
  const gate = m.gate ?? GATE;
  const original = readFileSync(m.file, "utf8");
  const edits = m.edits ?? [{ from: m.from, to: m.to }];
  const stale = edits.find((e) => !original.includes(e.from));
  if (stale) {
    missed.push({
      ...m,
      why: `the mutation target no longer exists in ${m.file}`,
    });
    console.log(`  STALE   ${m.name}\n          anchor not found in ${m.file}`);
    continue;
  }
  let mutated = original;
  for (const e of edits) mutated = mutated.replace(e.from, e.to);
  if (mutated === original) {
    missed.push({
      ...m,
      why: "the mutation left the file byte-identical — it is not a defect",
    });
    console.log(`  NO-OP   ${m.name}`);
    continue;
  }
  writeFileSync(m.file, mutated);
  // DECIDED BY THE EXIT CODE, never by finding the word FAIL in stdout: a
  // gate that dies on a syntax error and prints nothing has still gone
  // red, and a gate that prints the word FAIL in a heading has not.
  let failed = false;
  let detail = "";
  try {
    execFileSync("node", [gate], { encoding: "utf8", stdio: "pipe" });
  } catch (e) {
    failed = true;
    const out = String(e.stdout || "") + String(e.stderr || "");
    detail = (
      out.split("\n").find((l) => l.includes("FAIL")) ||
      out.split("\n")[0] ||
      ""
    ).trim();
  } finally {
    writeFileSync(m.file, original);
  }
  if (failed) {
    caught++;
    console.log(`  CAUGHT  ${m.name}\n          ${detail.slice(0, 130)}`);
  } else {
    missed.push({
      ...m,
      why: "the gate stayed green with the defect re-introduced",
    });
    console.log(`  MISSED  ${m.name}`);
  }
}

for (const gate of [GATE, CEILING_GATE]) {
  try {
    execFileSync("node", [gate], { stdio: "pipe" });
  } catch {
    console.log(
      `\nBASELINE IS RED (${gate}) — a mutation was not restored. Check \`git diff\`.`,
    );
    process.exit(1);
  }
}
console.log("\nbaseline: both gates are green on the unmutated tree");
console.log(`\n${caught} of ${MUTANTS.length} mutations caught.`);
if (missed.length) {
  console.log("\nHOLES:");
  for (const m of missed) console.log(`  - ${m.name}\n    ${m.why}`);
  process.exit(1);
}
console.log("Every re-introduced defect turned a gate red.");
