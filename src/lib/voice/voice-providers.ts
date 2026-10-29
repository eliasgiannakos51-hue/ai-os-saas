import "server-only";
import {
  VOICE_MODELS,
  MAX_SPEAK_CHARS,
  billableTranscribeSeconds,
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

/** One speaker turn, as gpt-4o-transcribe-diarize's `diarized_json`
 *  response carries it. `speaker` is whatever the provider's own
 *  generic label is ("A", "B", speaker_0, ...) — never assumed to be a
 *  single letter, since nothing in its docs promises a shape. */
export type DiarizedSegment = { speaker: string; start: number; end: number; text: string };

export type TranscribeResult =
  | {
      ok: true;
      text: string;
      language: string | null;
      usdCost: number;
      seconds: number;
      /** Only present when called with `diarize: true`. Absent (not
       *  empty) for every other caller, so "no segments" and "nobody
       *  asked for them" stay two different things. */
      segments?: DiarizedSegment[];
    }
  | { ok: false; failure: VoiceFailure };

export type SpeakResult =
  | { ok: true; audio: ArrayBuffer; contentType: string; usdCost: number }
  | { ok: false; failure: VoiceFailure };

/**
 * WHERE TRANSCRIPTION GOES, AND WHY IT IS OVERRIDABLE.
 *
 * `OPENAI_BASE_URL` is OpenAI's own documented variable and the same
 * mechanism `ANTHROPIC_BASE_URL` already gives the other provider in
 * this tree — Azure deployments, a corporate proxy and a self-hosted
 * Whisper all need it, and none of them can be reached from a constant.
 *
 * It also makes this code path testable for the first time. Every other
 * provider call in this product can be pointed at a stand-in and
 * exercised in a real production build; this one could not, so the one
 * place the audio actually leaves the process had never been driven by
 * anything but a hand test. That is not the reason it exists, but it is
 * the reason it exists TODAY rather than the day somebody asks for Azure.
 *
 * UNSET IT IS THE REAL ENDPOINT. A trailing slash is trimmed so that
 * "https://host/v1/" and "https://host/v1" behave the same, which is the
 * shape of every base-URL bug this kind of variable produces.
 */
function openAiBase(): string {
  const raw = process.env.OPENAI_BASE_URL;
  if (typeof raw !== "string" || raw.trim() === "") return "https://api.openai.com/v1";
  return raw.trim().replace(/\/+$/, "");
}
const OPENAI_TRANSCRIBE_PATH = "/audio/transcriptions";

/**
 * WHERE SPEECH GOES, overridable for the same two reasons (package 29).
 * `ELEVENLABS_BASE_URL` names the API root ("https://api.elevenlabs.io/v1"
 * unset). Without it the voice conversation's last step — the answer read
 * aloud — was the one call no production build could be pointed away
 * from, so the loop listen, answer, speak, listen again had never run end
 * to end anywhere but by hand; scripts/tests/voice-conversation.prodtest.mjs
 * runs it now.
 */
function elevenLabsBase(): string {
  const raw = process.env.ELEVENLABS_BASE_URL;
  if (typeof raw !== "string" || raw.trim() === "") return "https://api.elevenlabs.io/v1";
  return raw.trim().replace(/\/+$/, "");
}
const ELEVENLABS_TTS_PATH = "/text-to-speech";

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
 * we cannot know before sending it. It comes back in the response, and
 * `seconds` in the result is the larger of the two
 * (billableTranscribeSeconds): the figure the route meters and charges.
 */
export async function transcribeAudio(params: {
  audio: Blob;
  filename: string;
  durationSeconds: number;
  languageHint?: string;
  /** Meetings Κομμάτι 3. Switches the model and response format to the
   *  diarized pair below and parses `segments` into the result. Chat's
   *  own mic (the only other caller) never sets this — a two-second
   *  voice message has nobody to diarize, and whisper-1 stays its
   *  model. */
  diarize?: boolean;
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
  form.append("model", params.diarize ? VOICE_MODELS.meetingTranscribe : VOICE_MODELS.transcribe);
  // THE HINT IS A HINT. Whisper detects the language itself; passing the
  // UI's locale improves it on short clips and must never CONSTRAIN it,
  // because somebody whose interface is English and who speaks Greek is
  // the case automatic detection exists for. (Meetings never sets this
  // in the first place — see transcribe/route.ts's own comment.)
  if (params.languageHint) form.append("language", params.languageHint);
  if (params.diarize) {
    // diarized_json is the only response_format that carries speaker
    // labels; chunking_strategy is REQUIRED past 30 seconds of audio,
    // which every meeting this screen accepts already is. "auto" is
    // the provider's own recommendation, not a guess made here.
    form.append("response_format", "diarized_json");
    form.append("chunking_strategy", "auto");
  } else {
    // verbose_json so the detected language comes back — the UI shows
    // it, and a transcript in a language the user did not expect is
    // the one failure they can see and correct before sending.
    form.append("response_format", "verbose_json");
  }

  try {
    const response = await withTimeout((signal) =>
      fetch(`${openAiBase()}${OPENAI_TRANSCRIBE_PATH}`, {
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

    const data = (await response.json()) as {
      text?: unknown;
      language?: unknown;
      duration?: unknown;
      segments?: unknown;
    };
    // SEGMENTS, PARSED DEFENSIVELY — this is the one response shape in
    // this file nobody here has ever actually seen: diarized_json is a
    // DIFFERENT shape than verbose_json's, and a field that is missing,
    // renamed or typed differently by the provider must come back as
    // "no segments", never throw past this function into the route.
    const rawSegments = params.diarize && Array.isArray(data.segments) ? data.segments : [];
    const segments: DiarizedSegment[] = rawSegments
      .filter((s): s is Record<string, unknown> => Boolean(s) && typeof s === "object")
      .map((s) => ({
        speaker: typeof s.speaker === "string" && s.speaker.trim() ? s.speaker.trim() : "?",
        start: typeof s.start === "number" ? s.start : 0,
        end: typeof s.end === "number" ? s.end : 0,
        text: typeof s.text === "string" ? s.text.trim() : "",
      }))
      .filter((s) => s.text.length > 0);
    // `text` falls back to the segments joined when the top-level field
    // is absent — diarized_json's own docs do not promise it the way
    // verbose_json's always has.
    const text =
      typeof data.text === "string" && data.text.trim()
        ? data.text.trim()
        : segments.map((s) => s.text).join(" ");
    // AN EMPTY TRANSCRIPT IS ITS OWN OUTCOME, not an error. It means the
    // clip had no speech in it — a muted microphone, a wrong device, a
    // press that caught nothing — and the sentence a user needs for that
    // is "I did not hear anything", never "transcription failed".
    if (!text) {
      return { ok: false, failure: { kind: "empty", detail: "No speech was found in that recording." } };
    }
    const seconds = billableTranscribeSeconds(params.durationSeconds, data.duration);
    return {
      ok: true,
      text,
      language: typeof data.language === "string" ? data.language : null,
      usdCost: transcribeCostUsd(seconds),
      seconds,
      ...(params.diarize ? { segments } : {}),
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
      fetch(`${elevenLabsBase()}${ELEVENLABS_TTS_PATH}/${voiceIdFor(params.voiceKey)}`, {
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
