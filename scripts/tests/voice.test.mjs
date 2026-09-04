// VOICE (V4 #19 input, #19 output, #23 the orb, #2 the conversation).
//
// WHAT THIS ENVIRONMENT CANNOT DO, said first so nothing below is read as
// more than it is: there is no microphone, no OPENAI_API_KEY and no
// ELEVENLABS_API_KEY here. Not one word has been transcribed and not one
// clip has been synthesised. Everything checked in this file is maths,
// wiring and text — the numbers a real recording would flow through, and
// the guarantees that hold whether or not a provider ever answers.
//
// THE FOUR THINGS THAT WOULD BE WRONG QUIETLY:
//
//   A PRICE THAT LOSES MONEY. Speech is billed per character by somebody
//   else and charged per credit by us. Section 2 sweeps the real cost
//   through the SAME formula the routes call and proves revenue/cost >= M
//   for every input, at every margin, on every plan — because a margin
//   claim checked against a hand-written number is a claim about the
//   hand-written number.
//
//   A GLOBE THAT COSTS A FRAME. #23's whole constraint is that only
//   `transform` and `opacity` move. Section 3 asserts the frame object
//   has exactly three keys and that the stylesheet animates nothing else
//   — a `width` or a `box-shadow` driven off an audio signal at 60fps is
//   how this codebase previously reached 120ms of keystroke latency.
//
//   A MICROPHONE THAT OPENS BY ITSELF, or one that does not say it is
//   open. Section 4 reads the components: getUserMedia may be reached
//   from exactly one function, that function is only called from a
//   press, and no effect calls it.
//
//   A LOCALE WITH NO WORDS. Section 5 is a CROSS-PRODUCT, not a sample:
//   every voice key x every one of the ten locales.
//
// Run: node scripts/tests/voice.test.mjs
import { createTranslator } from "next-intl";
import { carriesNumber } from "./icu-carries.mjs";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { loadTs } from "./load-ts.mjs";

let pass = 0;
const failures = [];
const ok = (name, cond, detail) => {
  if (cond) {
    pass++;
    console.log(`  PASS  ${name}`);
  } else {
    failures.push(name);
    console.log(
      `  FAIL  ${name}${detail !== undefined ? "\n        " + detail : ""}`,
    );
  }
};

/**
 * The body of the block that follows `marker`, brace-matched.
 *
 * WHY THIS EXISTS. The first version of several checks below asked
 * "does this file contain X", which a mutation can satisfy from a
 * completely different function — releaseStream() called in the error
 * path is not releaseStream() called in the stop path, and both spell
 * the same nine characters. scripts/tests/voice.mutation.mjs proved
 * that: eight defects walked past a green gate. These are the questions
 * asked of the RIGHT block instead.
 */
function blockAfter(src, marker) {
  const at = src.indexOf(marker);
  if (at < 0) return null;
  const open = src.indexOf("{", at);
  if (open < 0) return null;
  let depth = 0;
  for (let i = open; i < src.length; i += 1) {
    if (src[i] === "{") depth += 1;
    else if (src[i] === "}") {
      depth -= 1;
      if (depth === 0) return src.slice(open, i + 1);
    }
  }
  return null;
}

/** Every `{ ... }` block whose selector text matches, brace-matched. */
function cssBlocks(css, selectorPart) {
  const out = [];
  let from = 0;
  for (;;) {
    const at = css.indexOf(selectorPart, from);
    if (at < 0) break;
    const block = blockAfter(css, css.slice(at, at + selectorPart.length));
    const open = css.indexOf("{", at);
    let depth = 0;
    let end = -1;
    for (let i = open; i >= 0 && i < css.length; i += 1) {
      if (css[i] === "{") depth += 1;
      else if (css[i] === "}") {
        depth -= 1;
        if (depth === 0) {
          end = i;
          break;
        }
      }
    }
    if (end > 0) out.push(css.slice(open, end + 1));
    void block;
    from = at + selectorPart.length;
  }
  return out;
}

const pricing = await loadTs("src/lib/voice/voice-pricing.ts");
const config = await loadTs("src/lib/voice/voice-config.ts");
const visual = await loadTs("src/lib/voice/voice-visual.ts");
const formula = await loadTs("src/lib/billing/credit-formula.ts");
const pricingConfig = await loadTs("src/lib/billing/pricing-config.ts");
const marginPolicy = await loadTs("src/lib/billing/margin-policy.ts");
const plansLib = await loadTs("src/lib/billing/plans.ts");

const {
  VOICE_RATES_USD,
  VOICE_MODELS,
  MAX_CLIP_SECONDS,
  MAX_SPEAK_CHARS,
  transcribeCostUsd,
  speakCostUsd,
  voiceCredits,
  creditsPerVoiceMinute,
  SPOKEN_CHARS_PER_MINUTE,
  DEFAULT_VOICE_MINUTE_LIMITS,
  VOICE_LIMIT_ENV_VARS,
  parseVoiceMinuteLimits,
  voiceMinutesForPlan,
  minutesToSeconds,
  secondsToMinutes,
  speakCharsToSeconds,
  voiceAllowance,
  fitsInAllowance,
} = pricing;
const {
  AUDIO_CONSTRAINTS,
  PREFERRED_MIME_TYPES,
  ACCEPTED_AUDIO_TYPES,
  isAcceptedAudioType,
  MAX_AUDIO_BYTES,
  VOICE_LANGUAGES,
  languageHint,
  SILENCE,
  frameRms,
  turnShouldEnd,
  PLAYBACK_RATES,
  VOICES,
  DEFAULT_VOICE,
  speakableWords,
  wordIndexAt,
} = config;
const {
  VOICE_STATES,
  SMOOTHING,
  smoothAmplitude,
  PULSE_RANGE,
  pulseScale,
  HALO_OPACITY,
  haloOpacity,
  ROTATION_SECONDS_PER_TURN,
  rotationDegrees,
  orbFrame,
  staticFrame,
  STATE_COLOR_VAR,
  isMicrophoneOpen,
} = visual;
const { MARGIN_MULTIPLIER_MIN } = pricingConfig;
const { PLANS } = plansLib;

// ===========================================================================
console.log("\n== 1. the numbers a clip flows through ==");
// ===========================================================================

ok(
  "transcribe is priced per MINUTE and speak per CHARACTER (the two providers' own units)",
  VOICE_RATES_USD.transcribePerMinute > 0 &&
    VOICE_RATES_USD.speakPer1kChars > 0,
);

ok(
  "a 60s clip costs exactly one minute of transcription",
  Math.abs(transcribeCostUsd(60) - VOICE_RATES_USD.transcribePerMinute) < 1e-12,
  `${transcribeCostUsd(60)}`,
);
ok(
  "a 30s clip costs half a minute — seconds are NOT rounded up to a minute",
  Math.abs(transcribeCostUsd(30) - VOICE_RATES_USD.transcribePerMinute / 2) <
    1e-12,
);
ok(
  "1,000 characters costs exactly the per-1k rate",
  Math.abs(speakCostUsd(1000) - VOICE_RATES_USD.speakPer1kChars) < 1e-12,
);

// Negative and nonsense inputs must not become negative COST — a negative
// cost is a negative credit charge, which is a refund somebody can mint.
for (const bad of [-1, -1e9, NaN, Infinity, -Infinity]) {
  ok(
    `transcribeCostUsd(${bad}) is never negative`,
    transcribeCostUsd(bad) >= 0,
    `${transcribeCostUsd(bad)}`,
  );
  ok(
    `speakCostUsd(${bad}) is never negative`,
    speakCostUsd(bad) >= 0,
    `${speakCostUsd(bad)}`,
  );
}

ok(
  "MAX_CLIP_SECONDS is a real ceiling, not a formality",
  MAX_CLIP_SECONDS > 0 && MAX_CLIP_SECONDS <= 300,
);
ok(
  "MAX_AUDIO_BYTES fits a full-length clip at a generous bitrate",
  MAX_AUDIO_BYTES >= (MAX_CLIP_SECONDS * 32_000) / 8,
  `${MAX_AUDIO_BYTES} bytes vs ${(MAX_CLIP_SECONDS * 32_000) / 8} needed`,
);

ok(
  "speakCharsToSeconds and SPOKEN_CHARS_PER_MINUTE agree",
  speakCharsToSeconds(SPOKEN_CHARS_PER_MINUTE) === 60,
  `${speakCharsToSeconds(SPOKEN_CHARS_PER_MINUTE)}`,
);
ok(
  "minutesToSeconds/secondsToMinutes round-trip whole minutes",
  secondsToMinutes(minutesToSeconds(37)) === 37,
);

// ===========================================================================
console.log(
  "\n== 2. THE MARGIN, over a sweep, through the formula that charges ==",
);
// ===========================================================================
//
// Not "is the constant 4". The question is whether the CREDITS somebody
// is charged, converted back to euros at the price they actually pay,
// cover the real provider cost at least M times over. So the sweep runs
// the same voiceCredits() the routes run, with the same pricing config.

const MARGINS = [4, 5, 6, 8, 10];
const CREDIT_PRICES = [0.02, 0.015, 0.01];
const USD_RATES = [0.92, 0.8, 1.05];
// Real inputs: one second to a full clip, and one character to the cap.
const CLIP_SECONDS = [1, 2, 5, 10, 15, 30, 45, 60, 90, MAX_CLIP_SECONDS];
const SPEAK_CHARS = [1, 10, 50, 120, 300, 800, 1200, 1800, MAX_SPEAK_CHARS];

let sweep = 0;
let worstRatio = Infinity;
let worstCase = null;
for (const margin of MARGINS) {
  for (const creditPriceEur of CREDIT_PRICES) {
    for (const usdToEurRate of USD_RATES) {
      const cfg = {
        ...pricingConfig.resolvePricingConfig(),
        creditPriceEur,
        usdToEurRate,
      };
      for (const seconds of CLIP_SECONDS) {
        const usd = transcribeCostUsd(seconds);
        const credits = voiceCredits(usd, cfg, margin);
        const revenueEur = credits * creditPriceEur;
        const costEur = usd * usdToEurRate;
        const ratio = costEur === 0 ? Infinity : revenueEur / costEur;
        sweep++;
        if (ratio < worstRatio) {
          worstRatio = ratio;
          worstCase = `transcribe ${seconds}s @ M=${margin} price=${creditPriceEur} fx=${usdToEurRate}: ${credits} credits`;
        }
        if (ratio < margin) {
          ok(
            `margin holds: transcribe ${seconds}s @ M=${margin}`,
            false,
            `ratio ${ratio.toFixed(3)} < ${margin} (${credits} credits, cost €${costEur})`,
          );
        }
      }
      for (const characters of SPEAK_CHARS) {
        const usd = speakCostUsd(characters);
        const credits = voiceCredits(usd, cfg, margin);
        const revenueEur = credits * creditPriceEur;
        const costEur = usd * usdToEurRate;
        const ratio = costEur === 0 ? Infinity : revenueEur / costEur;
        sweep++;
        if (ratio < worstRatio) {
          worstRatio = ratio;
          worstCase = `speak ${characters} chars @ M=${margin} price=${creditPriceEur} fx=${usdToEurRate}: ${credits} credits`;
        }
        if (ratio < margin) {
          ok(
            `margin holds: speak ${characters} chars @ M=${margin}`,
            false,
            `ratio ${ratio.toFixed(3)} < ${margin} (${credits} credits, cost €${costEur})`,
          );
        }
      }
    }
  }
}
ok(
  `every one of ${sweep} priced voice calls clears its own margin (worst ${worstRatio.toFixed(2)}x)`,
  worstRatio >= MARGIN_MULTIPLIER_MIN,
  worstCase ?? "",
);

// A charge of zero is the one way a margin sweep passes while the money
// goes missing: 0 credits over 0 cost is Infinity.
let zeroCharges = 0;
for (const seconds of CLIP_SECONDS) {
  const cfg = pricingConfig.resolvePricingConfig();
  if (voiceCredits(transcribeCostUsd(seconds), cfg, 4) < 1) zeroCharges++;
}
ok(
  "no billable clip length is charged zero credits",
  zeroCharges === 0,
  `${zeroCharges} lengths charged nothing`,
);

ok(
  "voice is on the margin policy's feature map (so a per-plan override reaches it)",
  marginPolicy.ACTION_TO_FEATURE.voiceTranscribe === "voice" &&
    marginPolicy.ACTION_TO_FEATURE.voiceSpeak === "voice",
);

// The headline the README states, recomputed here rather than copied.
const defaults = pricingConfig.resolvePricingConfig();
const perMinute = {
  transcribe: creditsPerVoiceMinute("transcribe", defaults, 4),
  speak: creditsPerVoiceMinute("speak", defaults, 4),
};
ok(
  `speech costs far more per minute than listening (${perMinute.transcribe} vs ${perMinute.speak} credits at M=4)`,
  perMinute.speak > perMinute.transcribe * 5,
  JSON.stringify(perMinute),
);

// ===========================================================================
console.log(
  "\n== 3. THE ORB: only transform and opacity, and reduced motion is still legible ==",
);
// ===========================================================================

ok(
  "orbFrame returns EXACTLY scale, halo and rotation — nothing that would force layout or paint",
  JSON.stringify(Object.keys(orbFrame("listening", 0.5, 1000)).sort()) ===
    JSON.stringify(["halo", "rotation", "scale"]),
  JSON.stringify(Object.keys(orbFrame("listening", 0.5, 1000))),
);

// The stylesheet is the other half of that promise: a component that
// returns three safe numbers into a rule that animates `width` has kept
// none of it.
// COMMENTS STRIPPED FIRST. globals.css mentions [data-theme="light"] in
// prose twice before it ever uses it as a selector, and a brace-matcher
// that starts from a mention inside a comment walks off into the wrong
// block entirely — which is how "the light theme redefines the voice
// colours" passed while reading the DARK ones.
const cssRaw = readFileSync("src/app/globals.css", "utf8");
const css = cssRaw.replace(/\/\*[\s\S]*?\*\//g, "");
const orbBlocks = [...css.matchAll(/\.voice-orb[^{]*\{([^}]*)\}/g)].map(
  (m) => m[1],
);
ok(
  "the .voice-orb rules exist in globals.css",
  orbBlocks.length > 0,
  `${orbBlocks.length} blocks`,
);
const forbidden = [
  "width:",
  "height:",
  "top:",
  "left:",
  "margin",
  "padding",
  "box-shadow:",
  "filter:",
  "font-size:",
];
const animatedProps = orbBlocks
  .flatMap((block) => [
    ...block.matchAll(/transition\s*:([^;]*);|animation\s*:([^;]*);/g),
  ])
  .map((m) => (m[1] ?? m[2]).trim());
const badTransition = animatedProps.filter((decl) =>
  forbidden.some((p) => decl.includes(p.replace(":", ""))),
);
ok(
  "no .voice-orb transition or animation names a property outside the compositor",
  badTransition.length === 0,
  JSON.stringify(badTransition),
);
const varDriven = orbBlocks.filter(
  (b) =>
    b.includes("--orb-scale") ||
    b.includes("--orb-halo") ||
    b.includes("--orb-rotate"),
);
for (const block of varDriven) {
  const usesVarOutsideSafe = [
    ...block.matchAll(
      /([a-z-]+)\s*:\s*[^;]*var\(--orb-(?:scale|halo|rotate)\)/g,
    ),
  ]
    .map((m) => m[1])
    .filter((prop) => prop !== "transform" && prop !== "opacity");
  ok(
    `--orb-* is consumed only by transform/opacity (${usesVarOutsideSafe.join(",") || "clean"})`,
    usesVarOutsideSafe.length === 0,
  );
}

ok(
  "silence produces scale exactly 1 — the globe does not visibly shrink when somebody stops talking",
  pulseScale("listening", 0) === 1,
);
ok(
  "a full-amplitude frame reaches the state's ceiling and no further",
  pulseScale("listening", 1) === PULSE_RANGE.listening.max &&
    pulseScale("listening", 5) === PULSE_RANGE.listening.max,
);
ok(
  "thinking does not pulse at all — it rotates",
  pulseScale("thinking", 1) === 1 && ROTATION_SECONDS_PER_TURN.thinking > 0,
);
ok(
  "idle does not move on any axis",
  pulseScale("idle", 1) === 1 &&
    rotationDegrees("idle", 999_999) === 0 &&
    haloOpacity("idle", 1) === 0,
);
ok(
  "speaking pulses to a DIFFERENT ceiling and a DIFFERENT colour from listening",
  PULSE_RANGE.speaking.max !== PULSE_RANGE.listening.max &&
    STATE_COLOR_VAR.speaking !== STATE_COLOR_VAR.listening,
);

ok(
  "every state has its own colour variable",
  new Set(Object.values(STATE_COLOR_VAR)).size === VOICE_STATES.length,
);
// THE LIGHT BLOCK, BRACE-MATCHED. Slicing the file from the first
// `[data-theme="light"]` to the end was the bug: everything defined
// AFTER that point — including the dark `:root` voice tokens — fell
// inside the slice, so the "light" assertion was reading the dark
// definition and passing on it. Deleting the light palette entirely left
// the gate green.
const lightBlocks = cssBlocks(css, '[data-theme="light"]');
const lightVoiceBlock = lightBlocks.find((b) => b.includes("--voice-")) ?? "";
ok(
  'a [data-theme="light"] block actually defines voice colours',
  lightVoiceBlock.length > 0,
  `${lightBlocks.length} light blocks, none with --voice-`,
);
const rootBlocks = cssBlocks(css, ":root");
const darkVoiceBlock = rootBlocks.find((b) => b.includes("--voice-")) ?? "";
ok("a :root block defines the dark voice colours", darkVoiceBlock.length > 0);
for (const state of VOICE_STATES) {
  const varName = STATE_COLOR_VAR[state];
  const declared = new RegExp(`${varName}\\s*:`);
  ok(`${varName} is defined for the dark theme`, declared.test(darkVoiceBlock));
  ok(
    `${varName} is redefined for the light theme`,
    declared.test(lightVoiceBlock),
  );
  // Same name, different value — otherwise "redefined" means "copied",
  // which is the light-contrast bug this project has already shipped once.
  const darkValue = darkVoiceBlock
    .match(new RegExp(`${varName}\\s*:\\s*([^;]+);`))?.[1]
    ?.trim();
  const lightValue = lightVoiceBlock
    .match(new RegExp(`${varName}\\s*:\\s*([^;]+);`))?.[1]
    ?.trim();
  ok(
    `${varName} is a DIFFERENT colour in the light theme, not the dark one copied across`,
    Boolean(darkValue) && Boolean(lightValue) && darkValue !== lightValue,
    `dark ${darkValue} / light ${lightValue}`,
  );
}

ok(
  "rotation never exceeds a full turn (it is fed straight into rotate())",
  [0, 1, 999, 18_000, 1e9].every(
    (ms) =>
      rotationDegrees("thinking", ms) >= 0 &&
      rotationDegrees("thinking", ms) < 360,
  ),
);

// Reduced motion: still, but still LEGIBLE.
ok(
  "staticFrame does not move",
  VOICE_STATES.every(
    (s) => staticFrame(s).scale === 1 && staticFrame(s).rotation === 0,
  ),
);
ok(
  "staticFrame keeps listening visually distinct from idle without moving",
  staticFrame("listening").halo !== staticFrame("idle").halo,
);
// BOTH SWITCHES, AND BOTH ABOUT THE ORB. Asking whether the file
// contains the string "prefers-reduced-motion" is answered by any other
// rule in a 2,000-line stylesheet — the OS setting could be dropped from
// the orb entirely and the check would still pass, which it did.
const flatCss = css.replace(/\s+/g, " ");
// EVERY MOVING PART, NAMED. `.includes(".voice-orb")` is satisfied by
// `.voice-orb-globe-unused` — a selector that matches no element in the
// app — so the check asks for each of the three classes that actually
// move, with a boundary after the name.
const MOVING_PARTS = ["voice-orb-globe", "voice-orb-halo", "voice-orb-ring"];
ok(
  `the MOVING_PARTS scan found ${MOVING_PARTS.length}`,
  MOVING_PARTS.length >= 3,
  "a filter of an empty list is empty, and every check below it would pass",
);
const namesAllParts = (text) =>
  MOVING_PARTS.every((cls) => new RegExp(`\\.${cls}\\s*(?:,|\\{)`).test(text));
// ALL of them, then the one that names the orb. The stylesheet already
// carries a blanket `html[data-motion="reduce"] *` rule; matching that
// first and stopping there proves nothing about the orb.
const appSwitchRules = [
  ...flatCss.matchAll(/html\[data-motion="reduce"\][^{]*\{[^}]*\}/g),
].map((m) => m[0]);
const orbAppSwitchRule = appSwitchRules.find((r) => namesAllParts(r));
ok(
  "the app's own motion switch kills the orb's movement, on every moving part",
  Boolean(orbAppSwitchRule) &&
    /transform:\s*none/.test(orbAppSwitchRule) &&
    /animation:\s*none/.test(orbAppSwitchRule),
  orbAppSwitchRule?.slice(0, 140) ??
    `${appSwitchRules.length} data-motion rules, none naming every orb part`,
);

const reducedMotionBlocks = cssBlocks(
  css,
  "@media (prefers-reduced-motion: reduce)",
);
const orbUnderOsSetting = reducedMotionBlocks.filter((b) => namesAllParts(b));
ok(
  "the OS setting kills it too — the two switches are not the same switch",
  orbUnderOsSetting.length > 0,
  `${reducedMotionBlocks.length} prefers-reduced-motion blocks, ${orbUnderOsSetting.length} naming every moving part`,
);
ok(
  "...and an explicit 'full motion' choice still wins over the OS default",
  orbUnderOsSetting.some((b) => b.includes('html:not([data-motion="full"])')),
);
ok(
  "...and what those rules kill is transform, transition and animation — the three things that move",
  orbUnderOsSetting.some(
    (b) =>
      /transform:\s*none/.test(b) &&
      /transition:\s*none/.test(b) &&
      /animation:\s*none/.test(b),
  ),
);
ok(
  "what those rules kill is movement, not the globe itself — reduced motion still shows which state it is in",
  orbUnderOsSetting.every(
    (b) => !/display:\s*none|visibility:\s*hidden|opacity:\s*0\s*!/.test(b),
  ),
);

// The smoothing is what turns a jumpy RMS into a pulse; asymmetric on purpose.
ok("attack is faster than release", SMOOTHING.attack > SMOOTHING.release);
ok(
  "a loud frame after silence moves most of the way immediately",
  smoothAmplitude(0, 1) === SMOOTHING.attack,
);
ok(
  "a silent frame after a loud one settles slowly rather than snapping shut",
  smoothAmplitude(1, 0) > 0.8,
  `${smoothAmplitude(1, 0)}`,
);
ok(
  "smoothing never leaves 0..1 however it is fed",
  [
    [NaN, NaN],
    [Infinity, 5],
    [-3, -3],
    [0.5, 2],
  ].every(([p, t]) => {
    const v = smoothAmplitude(p, t);
    return Number.isFinite(v) && v >= -1 && v <= 1;
  }),
);

ok(
  "the microphone is open in exactly ONE state, and it is the one called listening",
  VOICE_STATES.filter((s) => isMicrophoneOpen(s)).join(",") === "listening",
);

// ===========================================================================
console.log("\n== 4. SILENCE, and a microphone that never opens by itself ==");
// ===========================================================================

const silentFrame = new Uint8Array(256).fill(128);
ok("a frame of pure silence has RMS 0", frameRms(silentFrame) === 0);
const loudFrame = Uint8Array.from({ length: 256 }, (_, i) =>
  i % 2 ? 200 : 56,
);
ok(
  "a loud frame is above the threshold",
  frameRms(loudFrame) > SILENCE.rmsThreshold,
  `${frameRms(loudFrame)}`,
);
const roomToneFrame = Uint8Array.from(
  { length: 256 },
  (_, i) => 128 + (i % 3) - 1,
);
ok(
  "room tone stays BELOW the threshold (a quiet room is not zero)",
  frameRms(roomToneFrame) < SILENCE.rmsThreshold,
  `${frameRms(roomToneFrame)}`,
);
ok("frameRms survives an empty frame", frameRms(new Uint8Array(0)) === 0);

ok(
  "a hesitation right after pressing does not end the turn",
  turnShouldEnd({ elapsedMs: 300, quietMs: 300, heardSpeech: false }).end ===
    false,
);
ok(
  "silence before ANY speech never ends the turn as 'silence'",
  turnShouldEnd({ elapsedMs: 5000, quietMs: 5000, heardSpeech: false }).end ===
    false,
);
ok(
  "a full hangover after speech ends the turn, and says why",
  JSON.stringify(
    turnShouldEnd({
      elapsedMs: 5000,
      quietMs: SILENCE.hangoverMs,
      heardSpeech: true,
    }),
  ) === JSON.stringify({ end: true, reason: "silence" }),
);
ok(
  "a pause SHORTER than the hangover does not cut somebody off mid-sentence",
  turnShouldEnd({
    elapsedMs: 5000,
    quietMs: SILENCE.hangoverMs - 1,
    heardSpeech: true,
  }).end === false,
);
ok(
  "the turn ceiling ends it regardless, and distinguishes 'you stopped' from 'I heard nothing'",
  turnShouldEnd({ elapsedMs: SILENCE.maxTurnMs, quietMs: 0, heardSpeech: true })
    .reason === "max_turn" &&
    turnShouldEnd({
      elapsedMs: SILENCE.maxTurnMs,
      quietMs: 0,
      heardSpeech: false,
    }).reason === "no_speech",
);
ok(
  "the hangover is longer than a pause inside a sentence and shorter than one after it",
  SILENCE.hangoverMs >= 800 && SILENCE.hangoverMs <= 2000,
);
ok(
  "the conversational ceiling is well under the hard clip ceiling",
  SILENCE.maxTurnMs < MAX_CLIP_SECONDS * 1000,
);

// NOTHING RECORDS ON ITS OWN. Read from the source, because this is a
// promise about code that runs, not about a number.
const recorderSrc = readFileSync(
  "src/components/voice/use-recorder.ts",
  "utf8",
);
const getUserMediaCalls = [...recorderSrc.matchAll(/getUserMedia\s*\(/g)]
  .length;
ok(
  "getUserMedia is reached from exactly one place in the whole recorder",
  getUserMediaCalls === 1,
  `${getUserMediaCalls} call sites`,
);
// EVERY useEffect BODY, brace-matched. The regex this replaced could not
// cross the `()` in `() => {`, so it matched nothing and passed for a
// reason unrelated to the truth.
const effectBodies = [];
for (let from = 0; ; ) {
  const at = recorderSrc.indexOf("useEffect(", from);
  if (at < 0) break;
  const body = blockAfter(
    recorderSrc,
    recorderSrc.slice(at, at + "useEffect(".length),
  );
  if (body) effectBodies.push(body);
  from = at + 1;
}
ok(
  `the recorder's useEffect calls were found (${effectBodies.length})`,
  effectBodies.length > 0,
);
ok(
  "no useEffect in the recorder starts a recording — the microphone opens on a press and on nothing else",
  effectBodies.every((body) => !/\bstart\(\)/.test(body)),
  effectBodies
    .filter((b) => /\bstart\(\)/.test(b))
    .map((b) => b.slice(0, 60))
    .join(" | "),
);
ok(
  "the recorder stops every TRACK, not just the MediaRecorder (the browser's dot must go out)",
  recorderSrc.includes("getTracks()") && recorderSrc.includes("track.stop()"),
);
// THE STOP PATH ITSELF, not "the file mentions releaseStream somewhere".
// The error path calls it too, and a mutation that deletes it from
// onstop leaves the error path's call sitting there spelling the same
// word.
const onStopBody = blockAfter(recorderSrc, "recorder.onstop =");
ok("the recorder has an onstop handler", onStopBody !== null);
ok(
  "the STOP path releases the stream — not only the error path",
  (onStopBody ?? "").includes("releaseStream("),
  (onStopBody ?? "").slice(0, 80),
);
ok(
  "and releases it BEFORE handing the audio on, so the browser's dot goes out when the UI says it did",
  (onStopBody ?? "").indexOf("releaseStream(") >= 0 &&
    (onStopBody ?? "").indexOf("releaseStream(") <
      (onStopBody ?? "").indexOf("onResult?.("),
  `release at ${(onStopBody ?? "").indexOf("releaseStream(")}, callback at ${(onStopBody ?? "").indexOf("onResult?.(")}`,
);
ok(
  "...and not deferred past it with a microtask or a timer",
  !/queueMicrotask|setTimeout/.test(onStopBody ?? ""),
);
ok(
  "a hard clip ceiling is armed on every start",
  recorderSrc.includes("MAX_CLIP_SECONDS * 1000"),
);

const voiceSources = readdirSync("src/components/voice").map((f) =>
  join("src/components/voice", f),
);
ok(
  `the voiceSources scan found ${voiceSources.length}`,
  voiceSources.length >= 8,
  "a filter of an empty list is empty, and every check below it would pass",
);
// COMMENTS STRIPPED FIRST. The first version of this check read the raw
// file and went red on voice-input.tsx's comment "Not localStorage: ...",
// i.e. on a sentence explaining that the thing is not done. An instrument
// that cannot tell code from prose about code reports the opposite of the
// truth, so it is the instrument that was fixed.
const stripComments = (src) =>
  src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
const anySrc = voiceSources
  .map((f) => stripComments(readFileSync(f, "utf8")))
  .join("\n");
ok(
  "nothing in the voice components writes the audio anywhere persistent",
  !/localStorage|sessionStorage|indexedDB|\.upload\(/i.test(anySrc),
  (
    anySrc.match(/localStorage|sessionStorage|indexedDB|\.upload\(/gi) ?? []
  ).join(","),
);
ok(
  "...and the raw text still MENTIONS localStorage, so the strip above is doing work rather than matching nothing",
  voiceSources.some((f) => readFileSync(f, "utf8").includes("localStorage")),
);
ok(
  "every blob URL created in the voice components is revoked somewhere",
  (anySrc.match(/createObjectURL/g) ?? []).length <=
    (anySrc.match(/revokeObjectURL/g) ?? []).length,
  `${(anySrc.match(/createObjectURL/g) ?? []).length} created, ${(anySrc.match(/revokeObjectURL/g) ?? []).length} revoked`,
);

const inputSrc = readFileSync("src/components/voice/voice-input.tsx", "utf8");
// V4.6: it used to render NOTHING when transcription was unavailable, and
// "the microphone does not exist in the main chat" was the report from a
// deployment with no OPENAI_API_KEY. It now renders an INERT button that
// says which of the three reasons applies — and still never records.
ok(
  "the mic button is inert when transcription is unavailable — announced disabled, and never recording",
  /if \(!availability\.transcribeAvailable\) \{[\s\S]{0,2600}?aria-disabled="true"[\s\S]{0,900}?data-testid="voice-input-unavailable"/.test(inputSrc),
);
// A `title` IS A HOVER, AND A PHONE CANNOT HOVER.
//
// This check used to require `disabled` plus `title={reason}` and called
// that done. Measured on the live site at 390px with a real CDP touch on
// 2026-09-05: the button is 44x44 and uncovered, the tap lands on it, and
// nothing happens — `disabled` fires no event and `title` never renders.
// The one control whose whole purpose is to say WHY voice is missing said
// it only to a pointer that could hover over it.
//
// So the requirement is stronger now, not different: the reason has to be
// reachable by TAP, and it has to end up in the page rather than in an
// attribute.
ok(
  "...and the reason is reachable by a tap, not only by a hover",
  /aria-disabled="true"[\s\S]{0,200}?onClick=\{\(\) => setReasonShown/.test(inputSrc),
);
ok(
  "...which renders the reason IN THE PAGE, announced to a screen reader",
  /reasonShown \? \([\s\S]{0,300}?role="status"[\s\S]{0,200}?\{reason\}/.test(inputSrc),
);
ok(
  "...and it is not `disabled`, which would swallow the tap",
  !/if \(!availability\.transcribeAvailable\) \{[\s\S]{0,2600}?\n\s+disabled\n/.test(inputSrc),
);
ok(
  "...names all three reasons: not configured, not on the plan, out of minutes",
  /settings\.notConfigured/.test(inputSrc) && /settings\.notIncluded/.test(inputSrc) && /outOfMinutes/.test(inputSrc),
);
ok(
  "...and draws nothing before the availability call has answered, so it never flickers from 'not set up' to live",
  /if \(!availability\.loaded\) return null;/.test(inputSrc),
);
// THE PRESS HANDLER'S OWN GUARD. Asking whether setExplaining appears
// before recorder.start() in the file is answered by the source order of
// two statements that a mutation can leave exactly where they are while
// disabling the branch around them.
const pressBody = blockAfter(inputSrc, "function press()");
ok("the mic button has a press handler", pressBody !== null);
ok(
  "the explanation is gated on a real 'have they seen it' flag, not on a constant",
  (pressBody ?? "").includes("explainedRef.current") &&
    (pressBody ?? "").includes("setExplaining(true)"),
  (pressBody ?? "").slice(0, 120),
);
ok(
  "the first press cannot reach getUserMedia — it returns after showing the explanation",
  /if \(!explainedRef\.current\)\s*\{[^}]*setExplaining\(true\);[^}]*return;/s.test(
    pressBody ?? "",
  ),
);

// THE TRANSCRIPT DOES NOT LEAVE send(). It goes into a draft; only the
// draft dialog's accept button calls onTranscript.
const sendBody = blockAfter(inputSrc, "const send = useCallback(");
ok("the upload path was found", sendBody !== null);
ok(
  "the transcript is put into a DRAFT by the upload path, never handed to the parent from it",
  (sendBody ?? "").includes("setDraft(") &&
    !(sendBody ?? "").includes("onTranscript("),
  (sendBody ?? "")
    .split("\n")
    .filter((l) => l.includes("onTranscript"))
    .join(" | "),
);
ok(
  "onTranscript is called from exactly one place in the whole component — the accept button",
  (inputSrc.match(/onTranscript\(/g) ?? []).length === 1,
  `${(inputSrc.match(/onTranscript\(/g) ?? []).length} call sites`,
);
ok(
  "the draft dialog says out loud that nothing has been sent",
  inputSrc.includes("draft.notSent"),
);

// NO CONSTANT-CONDITION GUARDS ANYWHERE IN THE VOICE COMPONENTS. Every
// one of these components is a promise enforced by an `if`: "renders
// nothing without a provider", "explains before it asks", "stops when
// the session is abandoned". `if (false)` and `if (true)` keep the line
// and delete the promise, which is precisely the shape a careless edit
// takes.
const constantGuards = voiceSources.flatMap((f) => {
  const src = stripComments(readFileSync(f, "utf8"));
  return [...src.matchAll(/if \(\s*(?:true|false)\s*\)/g)].map(() => f);
});
ok(
  "no voice component guards a promise on a constant",
  constantGuards.length === 0,
  constantGuards.join(", "),
);

const playerSrc = readFileSync("src/components/voice/voice-player.tsx", "utf8");
ok(
  "the Listen button carries its PRICE before it is pressed",
  playerSrc.includes('t("listenFor"'),
);
ok(
  "the player renders nothing when speech is unavailable",
  /if \(!availability\.speakAvailable\) return null;/.test(playerSrc),
);

// THE SETTINGS PANEL: what it says when there is nothing to show.
// A section that silently disappears teaches somebody the feature does
// not exist, rather than that it is off for a reason they could act on.
const settingsSrc = readFileSync(
  "src/components/settings/voice-settings.tsx",
  "utf8",
);
ok(
  "the settings panel distinguishes 'your plan does not include it' from 'this deployment has no keys'",
  settingsSrc.includes('t("notIncluded")') &&
    settingsSrc.includes('t("notConfigured")') &&
    // ...and in the ORDER that distinguishes them: plan first, keys second.
    // Both keys merely existing somewhere in the file let a mutation that
    // showed "not on your plan" for a missing key pass unseen.
    /!v\.included \? \([\s\S]{0,300}?t\("notIncluded"\)[\s\S]{0,200}?\) : !configured \? \([\s\S]{0,300}?t\("notConfigured"\)/.test(settingsSrc),
);
ok(
  "...and only hides itself while the status call is still in flight",
  /if \(!v\.loaded\) return null;/.test(settingsSrc) &&
    (settingsSrc.match(/return null;/g) ?? []).length === 1,
);
ok(
  "it shows BOTH prices, because they are nowhere near each other",
  settingsSrc.includes("creditsPerMinute.transcribe") &&
    settingsSrc.includes("creditsPerMinute.speak"),
);
ok(
  "it repeats the privacy sentence where somebody would go looking for it",
  settingsSrc.includes('t("privacy")'),
);
ok(
  "the settings page mounts it",
  readFileSync("src/app/dashboard/settings/page.tsx", "utf8").includes(
    "<VoiceSettings />",
  ),
);

const conversationSrc = readFileSync(
  "src/components/voice/voice-conversation.tsx",
  "utf8",
);
// THE onended BODY, brace-matched, and read for what makes the loop a
// loop: it must be able to REACH listen(). A guard that returns
// unconditionally leaves the call sitting in the file, which is what the
// regex this replaced was satisfied by.
const onEndedBody = blockAfter(conversationSrc, "audio.onended =");
ok("the reply has an onended handler", onEndedBody !== null);
ok(
  "the conversation loop returns to listening when the reply finishes",
  (onEndedBody ?? "").includes("listen()"),
  (onEndedBody ?? "").slice(0, 100),
);
ok(
  "...and the only thing that can stop it is the session having been abandoned",
  /^\{\s*if \(abandonedRef\.current\) return;/.test(
    (onEndedBody ?? "")
      .replace(/\n\s*/g, "\n")
      .trim()
      .replace(/\n/g, " ")
      .replace(/\{ /, "{ "),
  ) || /if \(abandonedRef\.current\) return;/.test(onEndedBody ?? ""),
  (onEndedBody ?? "").slice(0, 120),
);
ok(
  "no early return in onended is unconditional",
  !/\(\s*(?:true|false)\s*\)\s*return/.test(onEndedBody ?? ""),
);
ok(
  "tapping while it speaks interrupts it",
  conversationSrc.includes('state === "speaking"') &&
    conversationSrc.includes("conversation.interrupt"),
);
ok(
  "the transcript of every turn is rendered as text as well as spoken",
  conversationSrc.includes("turns.map("),
);
ok(
  "an abandoned session is checked after every await",
  (conversationSrc.match(/abandonedRef\.current/g) ?? []).length >= 6,
);

// ===========================================================================
console.log("\n== 5. plans, minutes and the env overrides ==");
// ===========================================================================

ok(
  "every plan has a minute limit",
  PLANS.every((p) => typeof DEFAULT_VOICE_MINUTE_LIMITS[p.slug] === "number"),
);
ok(
  "every plan has an env var name",
  PLANS.every((p) => typeof VOICE_LIMIT_ENV_VARS[p.slug] === "string"),
);
ok(
  "the env var names are unique",
  new Set(Object.values(VOICE_LIMIT_ENV_VARS)).size === PLANS.length,
);
ok(
  "the free plan gets no voice minutes by default (the providers bill per minute)",
  DEFAULT_VOICE_MINUTE_LIMITS.free === 0,
);
const paidSlugs = PLANS.map((p) => p.slug).filter((s) => s !== "free");
ok(
  "every paid plan gets some",
  paidSlugs.every((s) => DEFAULT_VOICE_MINUTE_LIMITS[s] > 0),
);

const parsed = parseVoiceMinuteLimits({ VOICE_MINUTES_STARTER: "45" });
ok("a valid override is taken", parsed.limits.starter === 45);
ok(
  "an untouched plan keeps its default",
  parsed.limits.growth === DEFAULT_VOICE_MINUTE_LIMITS.growth,
);
for (const bad of ["-1", "abc", "1.5", "1e6", "999999"]) {
  const r = parseVoiceMinuteLimits({ VOICE_MINUTES_STARTER: bad });
  ok(
    `"${bad}" is rejected and WARNED about, not silently taken`,
    r.limits.starter === DEFAULT_VOICE_MINUTE_LIMITS.starter &&
      r.warnings.length === 1,
    JSON.stringify(r),
  );
}
// EMPTY IS UNSET, DELIBERATELY, AND SILENTLY. `VOICE_MINUTES_STARTER=`
// in a .env file is how a var is commented out in practice; warning
// about it would put a line in the logs of every deployment that has
// ever cleared one. The first version of this test asserted a warning
// here and went red — the contract is what changed, not the assertion:
// it now pins BOTH halves, that the default survives AND that nothing is
// logged, so a future change in either direction is caught.
for (const blank of ["", "   ", "\t"]) {
  const r = parseVoiceMinuteLimits({ VOICE_MINUTES_STARTER: blank });
  ok(
    `${JSON.stringify(blank)} is treated as unset: default kept, nothing warned`,
    r.limits.starter === DEFAULT_VOICE_MINUTE_LIMITS.starter &&
      r.warnings.length === 0,
    JSON.stringify(r),
  );
}
ok(
  "a warning names the plan, the env var and the offending value — enough to act on without reading the code",
  (() => {
    const w = parseVoiceMinuteLimits({ VOICE_MINUTES_GROWTH: "-5" })
      .warnings[0];
    return (
      w?.plan === "growth" &&
      w?.envVar === "VOICE_MINUTES_GROWTH" &&
      w?.value === "-5" &&
      typeof w?.reason === "string"
    );
  })(),
);
ok(
  '"0" is a valid override that turns voice off for a plan',
  parseVoiceMinuteLimits({ VOICE_MINUTES_STARTER: "0" }).limits.starter === 0,
);
ok(
  "an unknown plan slug falls back rather than throwing",
  voiceMinutesForPlan("nonsense") >= 0,
);

const allowance = voiceAllowance(30, 600);
ok(
  "an allowance reports what is left, in seconds",
  allowance.usedSeconds === 600 && allowance.remainingSeconds === 30 * 60 - 600,
);
ok("a clip that fits is allowed", fitsInAllowance(allowance, 60) === true);
ok(
  "a clip that would cross the ceiling is refused",
  fitsInAllowance(allowance, 30 * 60) === false,
);
ok(
  "an exhausted allowance never goes negative",
  voiceAllowance(30, 99_999).remainingSeconds === 0,
);
ok(
  "a zero limit refuses everything",
  fitsInAllowance(voiceAllowance(0, 0), 1) === false,
);

// ===========================================================================
console.log("\n== 6. languages, formats and voices ==");
// ===========================================================================

const i18nConstants = readFileSync("src/i18n/constants.ts", "utf8");
const localeList = [...i18nConstants.matchAll(/"([a-z]{2})",/g)].map(
  (m) => m[1],
);
ok(
  `voice speaks every locale the product is translated into (${VOICE_LANGUAGES.length})`,
  VOICE_LANGUAGES.length === 10,
  VOICE_LANGUAGES.join(","),
);
ok(
  "the language list IS the locale list, not a second copy that can drift",
  VOICE_LANGUAGES.every((l) => localeList.includes(l)),
);
ok(
  "an unknown locale sends NO hint rather than a wrong one",
  languageHint("kl") === undefined,
);
ok("a known locale sends itself", languageHint("el") === "el");
ok(
  "a null locale sends no hint",
  languageHint(null) === undefined && languageHint(undefined) === undefined,
);

ok(
  "mono 16kHz is asked for (Whisper resamples anyway; 48k stereo is 3x the upload)",
  AUDIO_CONSTRAINTS.channelCount === 1 &&
    AUDIO_CONSTRAINTS.sampleRate === 16_000,
);
ok(
  "echo cancellation, noise suppression and gain control are all on",
  AUDIO_CONSTRAINTS.echoCancellation &&
    AUDIO_CONSTRAINTS.noiseSuppression &&
    AUDIO_CONSTRAINTS.autoGainControl,
);
ok(
  "Safari's MP4 is in the preferred list (a WebM-only list means no iOS)",
  PREFERRED_MIME_TYPES.some((t) => t.startsWith("audio/mp4")),
);
ok(
  "every preferred container is one the route will accept",
  PREFERRED_MIME_TYPES.every((t) => isAcceptedAudioType(t)),
  PREFERRED_MIME_TYPES.filter((t) => !isAcceptedAudioType(t)).join(","),
);
ok(
  "a codec parameter does not defeat the type check",
  isAcceptedAudioType("audio/webm;codecs=opus"),
);
ok("a mixed-case header does not defeat it", isAcceptedAudioType("AUDIO/WEBM"));
ok("a video upload is refused", isAcceptedAudioType("video/mp4") === false);
ok(
  "a missing type is refused",
  isAcceptedAudioType(null) === false && isAcceptedAudioType("") === false,
);

ok(
  "1x is offered and is not at either end of the speed list",
  PLAYBACK_RATES.includes(1) &&
    PLAYBACK_RATES[0] < 1 &&
    PLAYBACK_RATES[PLAYBACK_RATES.length - 1] > 1,
);
ok(
  "every voice has a distinct id",
  new Set(VOICES.map((v) => v.id)).size === VOICES.length,
);
ok(
  "the default voice is one of them",
  VOICES.some((v) => v.key === DEFAULT_VOICE),
);

const words = speakableWords("Hello there, world.");
ok(
  "word offsets point back into the ORIGINAL string",
  words.every((w) => "Hello there, world.".slice(w.start, w.end) === w.word),
  JSON.stringify(words),
);
ok("nothing is highlighted at rest", wordIndexAt(words, 0, 0) === -1);
ok(
  "the first word is highlighted at the start",
  wordIndexAt(words, 1, 10_000) === 0,
);
ok(
  "the last word is highlighted just before the end",
  wordIndexAt(words, 9_999, 10_000) === words.length - 1,
  `${wordIndexAt(words, 9_999, 10_000)} of ${words.length}`,
);
// AND CLEARS WHEN THE CLIP ENDS. This is what the first version of the
// test got backwards: it asserted the last word stays lit at
// elapsed === duration. It must not — a finished clip leaving one word
// marked is a paragraph that looks like it is still playing. Both edges
// are now pinned, so neither can drift.
ok(
  "nothing is highlighted once the clip has finished",
  wordIndexAt(words, 10_000, 10_000) === -1 &&
    wordIndexAt(words, 20_000, 10_000) === -1,
);
ok(
  "the highlight walks forward monotonically through the clip",
  (() => {
    let previous = -1;
    for (let ms = 1; ms < 10_000; ms += 97) {
      const index = wordIndexAt(words, ms, 10_000);
      if (index < previous) return false;
      previous = index;
    }
    return true;
  })(),
);
ok(
  "an empty string produces no words and no crash",
  speakableWords("").length === 0 && wordIndexAt([], 5, 10) === -1,
);

// ===========================================================================
console.log("\n== 7. THE TEN LOCALES: cross-product, not a sample ==");
// ===========================================================================

const LOCALES = ["en", "el", "es", "fr", "de", "it", "pt", "zh", "ja", "ar"];
const messages = Object.fromEntries(
  LOCALES.map((l) => [
    l,
    JSON.parse(readFileSync(`messages/${l}.json`, "utf8")),
  ]),
);
const flatten = (obj, prefix = "") =>
  Object.entries(obj).flatMap(([k, v]) =>
    v && typeof v === "object"
      ? flatten(v, `${prefix}${k}.`)
      : [`${prefix}${k}`],
  );
const enVoiceKeys = flatten(messages.en.voice ?? {});
ok(
  `the voice namespace exists and is not a stub (${enVoiceKeys.length} keys)`,
  enVoiceKeys.length >= 40,
);

let missing = [];
let identical = [];
for (const locale of LOCALES) {
  const theirs = new Set(flatten(messages[locale].voice ?? {}));
  for (const key of enVoiceKeys) {
    if (!theirs.has(key)) missing.push(`${locale}:${key}`);
  }
}
ok(
  "every voice key exists in every one of the ten locales",
  missing.length === 0,
  missing.slice(0, 10).join(", "),
);

// Every state, every voice name, every error code — the dynamic keys the
// compiler cannot see, which is exactly the class that ships broken.
for (const locale of LOCALES) {
  const v = messages[locale].voice;
  ok(
    `${locale}: every VoiceState has a label`,
    VOICE_STATES.every((s) => typeof v?.states?.[s] === "string"),
  );
  ok(
    `${locale}: every voice has a name`,
    VOICES.every((x) => typeof v?.voices?.[x.key] === "string"),
  );
}

// The error CODES the routes actually emit, read from the routes.
const routeSrc = ["transcribe", "speak", "usage"]
  .map((r) => readFileSync(`src/app/api/voice/${r}/route.ts`, "utf8"))
  .join("\n");
const emittedCodes = new Set(
  [...routeSrc.matchAll(/code:\s*"([a-z_]+)"/g)].map((m) => m[1]),
);
// The provider failure kinds arrive as `code: result.failure.kind`.
for (const kind of [
  ...readFileSync("src/lib/voice/voice-providers.ts", "utf8").matchAll(
    /kind:\s*"([a-z_]+)"/g,
  ),
].map((m) => m[1])) {
  emittedCodes.add(kind);
}
// And the recorder's own client-side reasons.
for (const reason of ["denied", "unsupported", "no_speech", "failed"])
  emittedCodes.add(reason);
ok(
  `the routes and the recorder between them emit ${emittedCodes.size} distinct error codes`,
  emittedCodes.size >= 12,
);
let codeGaps = [];
for (const locale of LOCALES) {
  for (const code of emittedCodes) {
    if (typeof messages[locale].voice?.errors?.[code] !== "string")
      codeGaps.push(`${locale}:${code}`);
  }
}
ok(
  "every error code a user can hit has a translation in every locale",
  codeGaps.length === 0,
  codeGaps.slice(0, 12).join(", "),
);

// The price must survive translation — a {credits} left as a literal is a
// price nobody can read.
//
// CHECKED BY RENDERING. Looking for the substring `{credits}` reported these
// strings as broken the day they became ICU plurals (`{credits, plural, ...}`,
// so that one credit is not "1 credits"), which is a fact about the spelling
// and not about the price. What is claimed is that the NUMBER reaches the
// reader: change it, and the sentence changes.
const PLACEHOLDERS = {
  listenFor: ["credits"],
  costPerMinute: ["credits"],
  "permission.cost": ["credits", "minutes"],
};
let placeholderGaps = [];
for (const locale of LOCALES) {
  for (const [key, names] of Object.entries(PLACEHOLDERS)) {
    const parts = key.split(".");
    const leaf = parts.pop();
    const others = Object.fromEntries(names.map((n) => [n, 5]));
    for (const name of names) {
      const carried = carriesNumber(createTranslator, {
        locale,
        messages: messages[locale],
        namespace: ["voice", ...parts].join("."),
        key: leaf,
        variable: name,
        others,
      });
      if (!carried) placeholderGaps.push(`${locale}:${key}:{${name}}`);
    }
  }
}
ok(
  "every priced string keeps its {credits}/{minutes} placeholder in every locale",
  placeholderGaps.length === 0,
  placeholderGaps.join(", "),
);

// ===========================================================================
console.log(
  "\n== 8. the provider keys are checked BY NAME, before any client is built ==",
);
// ===========================================================================
//
// The `new Resend(undefined)` lesson: an SDK that throws from its own
// constructor makes "no key" indistinguishable from "no network".

const providersSrc = readFileSync("src/lib/voice/voice-providers.ts", "utf8");
for (const key of ["OPENAI_API_KEY", "ELEVENLABS_API_KEY"]) {
  ok(
    `${key} is read from process.env by name`,
    providersSrc.includes(`process.env.${key}`),
  );
  const envAt = providersSrc.indexOf(`process.env.${key}`);
  const fetchAt = providersSrc.indexOf("fetch(");
  ok(
    `${key} is checked before the first network call`,
    envAt >= 0 && envAt < fetchAt,
  );
}
ok(
  "a missing key is its own outcome, not an error",
  providersSrc.includes('kind: "not_configured"'),
);
ok(
  "an empty transcript is its own outcome, not an error",
  providersSrc.includes('kind: "empty"'),
);
// EVERY fetch, not "a timeout exists somewhere". The first version
// counted `signal:` and found one, because both call sites pass it by
// shorthand — a count of the wrong token proves nothing either way.
const providerFetches = (providersSrc.match(/fetch\(/g) ?? []).length;
// `withTimeout(` matches the CALL SITES only — the declaration is
// `withTimeout<T>(`, with the generic between the name and the paren. An
// off-by-one "minus the definition" here was itself wrong and reported
// 1 of 2 wrapped while both were.
const timedFetches = (providersSrc.match(/withTimeout\(/g) ?? []).length;
ok(
  `every provider fetch is wrapped in withTimeout (${timedFetches}/${providerFetches})`,
  providersSrc.includes("AbortController") &&
    providerFetches > 0 &&
    timedFetches >= providerFetches,
);
ok(
  "the timeout is a real one, not a placeholder",
  /PROVIDER_TIMEOUT_MS\s*=\s*[\d_]{5,}/.test(providersSrc),
  providersSrc.split("\n").find((l) => l.includes("PROVIDER_TIMEOUT_MS =")) ??
    "not found",
);
// THE HINT IS CONDITIONAL, which is the actual promise: "αυτόματη
// ανίχνευση γλώσσας" means somebody with an English interface who speaks
// Greek gets Greek back. An unconditional `language` field would make
// that impossible, and no comment would change it.
ok(
  "the language field is appended ONLY when a hint exists — never a default that constrains the detector",
  /if \(params\.languageHint\)[^\n]*append\("language"/.test(providersSrc),
  providersSrc
    .split("\n")
    .filter((l) => l.includes('"language"'))
    .join(" | "),
);
ok(
  "...and languageHint itself refuses to invent one for an unknown locale",
  languageHint("kl") === undefined && languageHint("zz") === undefined,
);

// ===========================================================================
console.log(`\n${pass} passed, ${failures.length} failed`);
if (failures.length) {
  console.log("FAILURES:\n  " + failures.join("\n  "));
  process.exit(1);
}
