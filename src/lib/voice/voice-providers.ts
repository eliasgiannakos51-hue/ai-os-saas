import "server-only";
import {
  VOICE_MODELS,
  MAX_SPEAK_CHARS,
  transcribeCostUsd,
  speakCostUsd,
} from "@/lib/voice/voice-pricing";
import { voiceIdFor } from "@/lib/voice/voice-config";
import { logApiError } from "@/lib/log-error";

/**
 * THE TWO PROVIDERS, AND WHAT HAPPENS WHEN THEY ARE NOT CONFIGURED.
 *
 * Both keys are OPTIONAL to the deployment and MANDATORY to the feature.
 * That combination is exactly where a product lies to somebody: the mic
 * button renders, the user speaks, and a generic "something went wrong"
 * comes back that could mean anything.
 *
 * The lesson is the one lib/email/send-website-form-submission-email.ts
 * learned the hard way: `new Resend(undefined)` throws from its
 * constructor, so a missing key was indistinguishable from a network
 * error, and the only record was a server log nobody reads. So here the
 * keys are checked BY NAME, first, and the absence is a named outcome
 * the UI can say out loud — "voice is not configured on this
 * deployment", not "try again".
 *
 * NOTHING IS STORED. The audio arrives as bytes, is forwarded, and is
 * gone when the request ends. The synthesised speech is returned as a
 * buffer the route streams straight out. No bucket, no temp file, no
 * column — see the 20260827 migration's header.
 */

export type VoiceFailure =
  | { kind: "not_configured"; detail: string }
  | { kind: "provider_error"; detail: string }
  | { kind: "empty"; detail: string };

export type TranscribeResult =
  | { ok: true; text: string; language: string | null; usdCost: number }
  | { ok: false; failure: VoiceFailure };

export type SpeakResult =
  | { ok: true; audio: ArrayBuffer; contentType: string; usdCost: number }
  | { ok: false; failure: VoiceFailure };

const OPENAI_TRANSCRIBE_URL = "https://api.openai.com/v1/audio/transcriptions";
const ELEVENLABS_TTS_URL = "https://api.elevenlabs.io/v1/text-to-speech";

/** How long we wait on a provider before giving up. The conversation
 *  loop's whole budget is 1.5 seconds; a request still open at 20 is not
 *  going to be part of a conversation, and holding the connection costs
 *  a serverless invocation for nothing. */
const PROVIDER_TIMEOUT_MS = 20_000;

async function withTimeout<T>(run: (signal: AbortSignal) => Promise<T>): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), PROVIDER_TIMEOUT_MS);
  try {
    return await run(controller.signal);
  } finally {
    clearTimeout(timer);
  }
}

export function transcriptionConfigured(): boolean {
  return Boolean(process.env.OPENAI_API_KEY);
}

export function speechConfigured(): boolean {
  return Boolean(process.env.ELEVENLABS_API_KEY);
}

/**
 * SPEECH IN.
 *
 * `durationSeconds` is what the BROWSER measured and what the cap was
 * checked against — the provider bills on the audio's real length, which
 * we cannot know before sending it. The two agree for any honest client;
 * a client that lies about a long clip is bounded by MAX_AUDIO_BYTES,
 * which is the reason that limit exists as well as the per-clip second
 * ceiling.
 */
export async function transcribeAudio(params: {
  audio: Blob;
  filename: string;
  durationSeconds: number;
  languageHint?: string;
}): Promise<TranscribeResult> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return {
      ok: false,
      failure: {
        kind: "not_configured",
        detail: "OPENAI_API_KEY is not set on this deployment, so speech cannot be transcribed.",
      },
    };
  }

  const form = new FormData();
  form.append("file", params.audio, params.filename);
  form.append("model", VOICE_MODELS.transcribe);
  // THE HINT IS A HINT. Whisper detects the language itself; passing the
  // UI's locale improves it on short clips and must never CONSTRAIN it,
  // because somebody whose interface is English and who speaks Greek is
  // the case automatic detection exists for.
  if (params.languageHint) form.append("language", params.languageHint);
  // verbose_json so the detected language comes back — the UI shows it,
  // and a transcript in a language the user did not expect is the one
  // failure they can see and correct before sending.
  form.append("response_format", "verbose_json");

  try {
    const response = await withTimeout((signal) =>
      fetch(OPENAI_TRANSCRIBE_URL, {
        method: "POST",
        headers: { Authorization: `Bearer ${apiKey}` },
        body: form,
        signal,
      })
    );

    if (!response.ok) {
      const body = await response.text().catch(() => "");
      logApiError("voice:transcribe", new Error(`${response.status} ${body.slice(0, 300)}`));
      return {
        ok: false,
        failure: { kind: "provider_error", detail: `Transcription failed (${response.status}).` },
      };
    }

    const data = (await response.json()) as { text?: unknown; language?: unknown };
    const text = typeof data.text === "string" ? data.text.trim() : "";
    // AN EMPTY TRANSCRIPT IS ITS OWN OUTCOME, not an error. It means the
    // clip had no speech in it — a muted microphone, a wrong device, a
    // press that caught nothing — and the sentence a user needs for that
    // is "I did not hear anything", never "transcription failed".
    if (!text) {
      return { ok: false, failure: { kind: "empty", detail: "No speech was found in that recording." } };
    }
    return {
      ok: true,
      text,
      language: typeof data.language === "string" ? data.language : null,
      usdCost: transcribeCostUsd(params.durationSeconds),
    };
  } catch (err) {
    logApiError("voice:transcribe", err);
    return { ok: false, failure: { kind: "provider_error", detail: "The transcription service could not be reached." } };
  }
}

/**
 * SPEECH OUT.
 *
 * Returns the audio as bytes for the route to stream. It is never
 * written anywhere: no bucket, no cache, no file. That costs a repeat
 * request when somebody presses play twice, and the alternative is a
 * store of synthesised recordings of a user's own private research
 * reports.
 */
export async function synthesiseSpeech(params: {
  text: string;
  voiceKey: string;
}): Promise<SpeakResult> {
  const apiKey = process.env.ELEVENLABS_API_KEY;
  if (!apiKey) {
    return {
      ok: false,
      failure: {
        kind: "not_configured",
        detail: "ELEVENLABS_API_KEY is not set on this deployment, so text cannot be read aloud.",
      },
    };
  }

  const text = params.text.slice(0, MAX_SPEAK_CHARS);
  if (!text.trim()) {
    return { ok: false, failure: { kind: "empty", detail: "There is nothing to read." } };
  }

  try {
    const response = await withTimeout((signal) =>
      fetch(`${ELEVENLABS_TTS_URL}/${voiceIdFor(params.voiceKey)}`, {
        method: "POST",
        headers: {
          "xi-api-key": apiKey,
          "Content-Type": "application/json",
          Accept: "audio/mpeg",
        },
        body: JSON.stringify({
          text,
          model_id: VOICE_MODELS.speak,
          voice_settings: { stability: 0.5, similarity_boost: 0.75 },
        }),
        signal,
      })
    );

    if (!response.ok) {
      const body = await response.text().catch(() => "");
      logApiError("voice:speak", new Error(`${response.status} ${body.slice(0, 300)}`));
      return {
        ok: false,
        failure: { kind: "provider_error", detail: `Speech failed (${response.status}).` },
      };
    }

    const audio = await response.arrayBuffer();
    if (audio.byteLength === 0) {
      return { ok: false, failure: { kind: "empty", detail: "The speech service returned nothing." } };
    }
    return {
      ok: true,
      audio,
      contentType: "audio/mpeg",
      // BILLED ON THE TEXT WE SENT, which is the text after truncation —
      // charging for characters the provider never saw would be an
      // over-charge, and the margin proof is about what was really spent.
      usdCost: speakCostUsd(text.length),
    };
  } catch (err) {
    logApiError("voice:speak", err);
    return { ok: false, failure: { kind: "provider_error", detail: "The speech service could not be reached." } };
  }
}
