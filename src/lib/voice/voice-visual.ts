/**
 * THE GLOBE THAT PULSES WITH THE SOUND.
 *
 * Pure maths, deliberately. The component that draws it has a
 * requestAnimationFrame loop and a live AnalyserNode, neither of which
 * exists in a test — but "does a loud frame make it bigger" and "does it
 * stay inside the compositor's budget" are questions about numbers, and
 * numbers can be checked.
 *
 * THE ONE HARD RULE: everything this file produces feeds `transform` and
 * `opacity` and NOTHING else. Those two are the only properties a
 * browser can animate without laying out or painting — they run on the
 * compositor, off the main thread. Driving `width`, `filter` or
 * `box-shadow` from an audio signal at 60fps is how a previous version
 * of this codebase's backdrop reached 120ms of keystroke latency
 * (see the header of components/ui/globe-mark.tsx).
 */

export const VOICE_STATES = ["idle", "listening", "thinking", "speaking"] as const;
export type VoiceState = (typeof VOICE_STATES)[number];

export function isVoiceState(value: unknown): value is VoiceState {
  return typeof value === "string" && (VOICE_STATES as readonly string[]).includes(value);
}

/**
 * SMOOTHING.
 *
 * A raw RMS reading jumps between frames — speech is not continuous, and
 * a globe driven straight off it flickers rather than pulses. This is a
 * one-pole low-pass: `next = previous + (target - previous) * alpha`.
 *
 * ASYMMETRIC ON PURPOSE. Attack is fast (0.5) so the globe responds the
 * instant somebody speaks; release is slow (0.12) so it settles instead
 * of snapping shut between syllables. A single alpha makes one of those
 * two wrong, and the wrong one is always visible.
 */
export const SMOOTHING = { attack: 0.5, release: 0.12 } as const;

export function smoothAmplitude(previous: number, target: number): number {
  // BOTH ENDS ARE CLAMPED, not just the new reading. Clamping the target
  // alone was a bug scripts/tests/voice.test.mjs found: a previous value
  // outside 0..1 — which nothing produces today, but which one bad frame
  // or one restored value would — pulled the result outside 0..1 too, and
  // a negative amplitude reaches pulseScale as a globe smaller than
  // itself. A smoothing function whose output range depends on its
  // caller having behaved is not a smoothing function.
  const safePrevious = Number.isFinite(previous) ? Math.max(0, Math.min(1, previous)) : 0;
  const safeTarget = Number.isFinite(target) ? Math.max(0, Math.min(1, target)) : 0;
  const alpha = safeTarget > safePrevious ? SMOOTHING.attack : SMOOTHING.release;
  return safePrevious + (safeTarget - safePrevious) * alpha;
}

/**
 * How far the pulse reaches, per state.
 *
 * LISTENING is the widest: it is the feedback that the microphone is
 * actually hearing you, and a barely-moving globe reads as a dead one.
 * SPEAKING is narrower — it is decoration over an audio stream that is
 * already obvious. THINKING does not scale at all; it rotates.
 */
export const PULSE_RANGE: Record<VoiceState, { min: number; max: number }> = {
  idle: { min: 1, max: 1 },
  listening: { min: 1, max: 1.28 },
  thinking: { min: 1, max: 1 },
  speaking: { min: 1, max: 1.16 },
};

/**
 * The scale to put on the transform, from a smoothed 0..1 amplitude.
 *
 * CLAMPED AT BOTH ENDS, and the lower clamp is the one that matters: an
 * amplitude of 0 must produce exactly 1, not 0.98, or the globe visibly
 * shrinks the moment somebody stops talking and the whole thing reads as
 * a glitch rather than as a pulse.
 */
export function pulseScale(state: VoiceState, amplitude: number): number {
  const range = PULSE_RANGE[state] ?? PULSE_RANGE.idle;
  const level = Number.isFinite(amplitude) ? Math.max(0, Math.min(1, amplitude)) : 0;
  return range.min + (range.max - range.min) * level;
}

/**
 * The halo's opacity. Same signal, different property — and opacity is
 * the other half of what the compositor can animate for free.
 *
 * Never reaches 1: a halo at full opacity is a disc, and the globe
 * disappears inside it.
 */
export const HALO_OPACITY: Record<VoiceState, { min: number; max: number }> = {
  idle: { min: 0, max: 0 },
  listening: { min: 0.12, max: 0.55 },
  thinking: { min: 0.18, max: 0.18 },
  speaking: { min: 0.14, max: 0.42 },
};

export function haloOpacity(state: VoiceState, amplitude: number): number {
  const range = HALO_OPACITY[state] ?? HALO_OPACITY.idle;
  const level = Number.isFinite(amplitude) ? Math.max(0, Math.min(1, amplitude)) : 0;
  return range.min + (range.max - range.min) * level;
}

/**
 * THE ROTATION, which is what `thinking` has instead of a pulse.
 *
 * Degrees, from elapsed milliseconds. Slow — 18 seconds a turn — because
 * this runs while somebody waits, and a fast spin reads as urgency where
 * the honest signal is patience.
 *
 * Listening and speaking rotate too, at a crawl, so the globe never
 * looks frozen while it is plainly doing something. Idle does not move
 * at all.
 */
export const ROTATION_SECONDS_PER_TURN: Record<VoiceState, number> = {
  idle: 0,
  listening: 60,
  thinking: 18,
  speaking: 40,
};

export function rotationDegrees(state: VoiceState, elapsedMs: number): number {
  const period = ROTATION_SECONDS_PER_TURN[state] ?? 0;
  if (period <= 0 || !Number.isFinite(elapsedMs) || elapsedMs <= 0) return 0;
  return ((elapsedMs / (period * 1000)) * 360) % 360;
}

/**
 * The CSS custom properties the component writes each frame.
 *
 * ONE OBJECT, THREE NUMBERS, and every one of them is consumed by a
 * transform or an opacity in the stylesheet. Returning a style object
 * rather than letting the component build one is what makes the "only
 * transform and opacity" rule checkable: scripts/tests/voice.test.mjs
 * asserts these are the only keys, and the mutation suite proves that
 * assertion can go red.
 */
export type OrbFrame = { scale: number; halo: number; rotation: number };

export function orbFrame(state: VoiceState, amplitude: number, elapsedMs: number): OrbFrame {
  return {
    scale: pulseScale(state, amplitude),
    halo: haloOpacity(state, amplitude),
    rotation: rotationDegrees(state, elapsedMs),
  };
}

/**
 * WHAT REDUCED MOTION GETS: the same globe, still.
 *
 * NOT a hidden globe and not a different component. Somebody who has
 * asked their operating system for less motion still needs to know
 * whether the microphone is on — so the state colour and the label stay,
 * and only the movement goes. Scale 1, no rotation, and the halo pinned
 * at the state's own floor so `listening` still looks different from
 * `idle` without anything moving.
 */
export function staticFrame(state: VoiceState): OrbFrame {
  return {
    scale: 1,
    halo: (HALO_OPACITY[state] ?? HALO_OPACITY.idle).min,
    rotation: 0,
  };
}

/**
 * THE COLOUR PER STATE, as a CSS custom property name rather than a
 * value — the palette lives in globals.css and has a light and a dark
 * definition, and a hex code baked in here would be right in one theme.
 *
 * Speaking is deliberately a DIFFERENT colour from listening. That is
 * the requirement, and the reason behind the requirement is that the two
 * states are the ones a user must never confuse: one of them means the
 * microphone is open.
 */
export const STATE_COLOR_VAR: Record<VoiceState, string> = {
  idle: "--voice-idle",
  listening: "--voice-listening",
  thinking: "--voice-thinking",
  speaking: "--voice-speaking",
};

/** Whether the microphone is open in this state. The one fact the UI
 *  must never get wrong, so it is derived rather than written out beside
 *  each label. */
export function isMicrophoneOpen(state: VoiceState): boolean {
  return state === "listening";
}
