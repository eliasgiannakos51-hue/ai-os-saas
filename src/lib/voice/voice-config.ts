import { SUPPORTED_LOCALES, type SupportedLocale } from "@/i18n/constants";

/**
 * HOW THE MICROPHONE IS ASKED FOR, AND WHEN IT STOPS.
 *
 * Pure and client-safe. Everything here is a number the browser code and
 * the server route both have to agree on — a clip the recorder is willing
 * to make and the route is not willing to accept is a recording somebody
 * gave us that we then threw away.
 */

/**
 * THE CONSTRAINTS.
 *
 * MONO, 16 kHz. Whisper resamples to 16 kHz anyway, so sending 48 kHz
 * stereo is three times the upload for identical text — and upload time
 * is most of the latency budget on a phone.
 *
 * The three processing flags are ON. They are what makes a laptop
 * microphone in a room with a fan produce a transcript instead of a
 * guess, and every one of them runs in the browser's audio pipeline
 * rather than costing us anything.
 */
export const AUDIO_CONSTRAINTS = {
  channelCount: 1,
  sampleRate: 16_000,
  echoCancellation: true,
  noiseSuppression: true,
  autoGainControl: true,
} as const;

/**
 * The container the recorder asks for, in order of preference.
 *
 * WebM/Opus is what Chrome and Firefox produce and is small. Safari
 * produces MP4/AAC and will not produce WebM at all, so the list is a
 * list rather than a constant — a single format means the feature simply
 * does not exist on iOS, which is where a microphone is most likely to
 * be the input somebody actually wants.
 */
export const PREFERRED_MIME_TYPES = [
  "audio/webm;codecs=opus",
  "audio/webm",
  "audio/mp4",
  "audio/mpeg",
  "audio/ogg;codecs=opus",
] as const;

/** What the transcription route will accept. Derived from the list above
 *  with the codec parameters stripped, because a browser sends
 *  "audio/webm;codecs=opus" and a Content-Type check on the bare type is
 *  what both ends can agree on. */
export const ACCEPTED_AUDIO_TYPES = [
  "audio/webm",
  "audio/mp4",
  "audio/mpeg",
  "audio/ogg",
  "audio/wav",
  "audio/x-m4a",
] as const;

export function isAcceptedAudioType(mime: string | null | undefined): boolean {
  if (!mime) return false;
  const bare = mime.split(";")[0].trim().toLowerCase();
  return (ACCEPTED_AUDIO_TYPES as readonly string[]).includes(bare);
}

/**
 * Largest upload the route accepts, in bytes.
 *
 * Sized from MAX_CLIP_SECONDS at a generous bitrate rather than picked:
 * 120 seconds of 32 kbps Opus is ~480 KB, and 2 MB leaves room for a
 * browser that ignores the bitrate hint entirely. A cap much larger than
 * that is a cap that lets somebody upload a film.
 */
export const MAX_AUDIO_BYTES = 2 * 1024 * 1024;

/**
 * THE TEN LANGUAGES.
 *
 * Whisper detects the language itself and needs no hint — but a hint
 * MEASURABLY improves it on short clips, which is exactly what a voice
 * input produces. So the UI's current locale is passed as a hint and
 * never as a constraint: somebody whose interface is in English and who
 * speaks Greek must get Greek back, which is what makes automatic
 * detection worth having.
 *
 * The list is SUPPORTED_LOCALES, not a second copy: a locale the product
 * is translated into and cannot be spoken in is a gap nobody would find
 * except by speaking it.
 */
export const VOICE_LANGUAGES: readonly SupportedLocale[] = SUPPORTED_LOCALES;

export function isVoiceLanguage(value: unknown): value is SupportedLocale {
  return typeof value === "string" && (VOICE_LANGUAGES as readonly string[]).includes(value);
}

/** The hint sent to the provider. Undefined rather than a default when
 *  the locale is unrecognised — a WRONG hint is worse than none, because
 *  it biases the detector towards a language nobody is speaking. */
export function languageHint(locale: string | null | undefined): string | undefined {
  return isVoiceLanguage(locale) ? locale : undefined;
}

/**
 * SILENCE DETECTION.
 *
 * Used by the conversation loop (#2) to decide that somebody has stopped
 * talking. Not by the plain mic button — there, the user presses to stop,
 * and a recorder that decides for them mid-sentence is worse than one
 * that waits.
 */
export const SILENCE = {
  /**
   * RMS amplitude below which a frame counts as silence, on the 0..1
   * scale an AnalyserNode's time-domain data produces.
   *
   * 0.015, not 0.05: a quiet room is not zero. Microphone self-noise,
   * a fan and a laptop's own hum sit around 0.005-0.01, and a threshold
   * under that never fires at all — the recording runs to the clip
   * ceiling every time. One well above it cuts people off between words.
   */
  rmsThreshold: 0.015,
  /** How long the level has to stay under the threshold before the turn
   *  is over. 1,200ms is longer than the pause inside a sentence and
   *  shorter than the pause after one. */
  hangoverMs: 1200,
  /** Nothing is ever cut off before this much has been recorded, however
   *  quiet it is — otherwise a moment's hesitation after pressing the
   *  button ends the turn before it began. */
  minSpeechMs: 700,
  /** And a turn ends here regardless. The clip ceiling is the safety
   *  net; this is the conversational one. */
  maxTurnMs: 30_000,
} as const;

/**
 * Root-mean-square of a frame of time-domain samples.
 *
 * `samples` are the bytes an AnalyserNode's getByteTimeDomainData
 * produces: 0..255, centred on 128. Converted to -1..1 here so the
 * threshold above is expressed in a unit that means something rather
 * than in bytes.
 *
 * Pure, so the silence rule is testable without a microphone — which
 * matters, because a microphone is the one thing this environment does
 * not have.
 */
export function frameRms(samples: Uint8Array | number[]): number {
  if (!samples || samples.length === 0) return 0;
  let sum = 0;
  for (let i = 0; i < samples.length; i += 1) {
    const centred = (samples[i] - 128) / 128;
    sum += centred * centred;
  }
  return Math.sqrt(sum / samples.length);
}

export type TurnState = {
  /** Total time the recorder has been running. */
  elapsedMs: number;
  /** Time since the level last rose above the threshold. */
  quietMs: number;
  /** Whether the level has EVER risen above the threshold this turn. */
  heardSpeech: boolean;
};

/**
 * Should this turn end now?
 *
 * Returns the reason as well as the answer, because the three are not
 * interchangeable to a user: `silence` means "your turn is over, mine
 * starts", `max_turn` means "I stopped listening, say the rest", and
 * `no_speech` means "I heard nothing — is the microphone working".
 */
export function turnShouldEnd(state: TurnState): { end: boolean; reason: "silence" | "max_turn" | "no_speech" | null } {
  if (state.elapsedMs >= SILENCE.maxTurnMs) {
    return { end: true, reason: state.heardSpeech ? "max_turn" : "no_speech" };
  }
  if (state.elapsedMs < SILENCE.minSpeechMs) return { end: false, reason: null };
  if (!state.heardSpeech) return { end: false, reason: null };
  if (state.quietMs >= SILENCE.hangoverMs) return { end: true, reason: "silence" };
  return { end: false, reason: null };
}

/**
 * PLAYBACK SPEEDS, and 1 is in the middle on purpose: a control whose
 * default sits at one end reads as a minimum rather than as normal.
 */
export const PLAYBACK_RATES = [0.75, 1, 1.25, 1.5, 2] as const;
export type PlaybackRate = (typeof PLAYBACK_RATES)[number];

export function isPlaybackRate(value: unknown): value is PlaybackRate {
  return typeof value === "number" && (PLAYBACK_RATES as readonly number[]).includes(value);
}

/**
 * THE VOICES.
 *
 * Ids are ElevenLabs' own public voice ids. Named here rather than
 * fetched so the picker works before any request has been made, and so a
 * voice that disappears from the provider is one line to change rather
 * than a dropdown that silently empties.
 *
 * `neutral` is first and is the default: a product that reads somebody's
 * research report back to them should not have picked a gender for them.
 */
export const VOICES = [
  { id: "pqHfZKP75CvOlQylNhV4", key: "neutral" },
  { id: "EXAVITQu4vr4xnSDxMaL", key: "warm" },
  { id: "onwK4e9ZLuTAKqWW03F9", key: "deep" },
  { id: "XB0fDUnXU5powFXDhCwa", key: "bright" },
] as const;

export type VoiceKey = (typeof VOICES)[number]["key"];
export const DEFAULT_VOICE: VoiceKey = "neutral";

export function isVoiceKey(value: unknown): value is VoiceKey {
  return typeof value === "string" && VOICES.some((v) => v.key === value);
}

export function voiceIdFor(key: unknown): string {
  const found = VOICES.find((v) => v.key === key);
  return (found ?? VOICES[0]).id;
}

/**
 * The text as the words a player can highlight.
 *
 * WHY THIS IS SPLIT HERE and not in the component: the highlight has to
 * line up with what was SPOKEN, and what was spoken is the text this
 * function produced — so the same split has to feed both the request and
 * the highlight, or the third word lights up while the fourth is being
 * said.
 *
 * Offsets are kept because the component renders the ORIGINAL string with
 * a span around one word: rebuilding the text from the words would lose
 * every newline and double space in a report.
 */
export function speakableWords(text: string): { word: string; start: number; end: number }[] {
  const out: { word: string; start: number; end: number }[] = [];
  const pattern = /\S+/g;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(text)) !== null) {
    out.push({ word: match[0], start: match.index, end: match.index + match[0].length });
  }
  return out;
}

/**
 * Which word is being spoken at `elapsedMs`, given the whole clip's
 * duration.
 *
 * PROPORTIONAL TO CHARACTERS, not to word count. "a" and
 * "responsibilities" do not take the same time to say, and a highlight
 * that gives them equal slices drifts visibly within one sentence. This
 * is still an approximation — the provider's real per-character timings
 * would be exact, and this is what can be done without them.
 *
 * Returns -1 before the first word and after the last, so a player at
 * rest highlights nothing rather than highlighting the first word for as
 * long as it sits there.
 */
export function wordIndexAt(
  words: { word: string; start: number; end: number }[],
  elapsedMs: number,
  durationMs: number
): number {
  if (words.length === 0 || durationMs <= 0) return -1;
  if (elapsedMs <= 0) return -1;
  if (elapsedMs >= durationMs) return -1;
  const totalChars = words.reduce((sum, w) => sum + w.word.length, 0);
  if (totalChars === 0) return -1;
  const target = (elapsedMs / durationMs) * totalChars;
  let seen = 0;
  for (let i = 0; i < words.length; i += 1) {
    seen += words[i].word.length;
    if (target <= seen) return i;
  }
  return words.length - 1;
}
