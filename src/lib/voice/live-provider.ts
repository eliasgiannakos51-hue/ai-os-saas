import "server-only";
import { logApiError } from "@/lib/log-error";
import { openAiBase, type VoiceFailure } from "@/lib/voice/voice-providers";
import { LIVE_MODEL, LIVE_TRANSCRIBE_MODEL, LIVE_VOICE } from "@/lib/voice/live-pricing";

/**
 * THE LIVE CALL, FROM THE SERVER'S SIDE (FS1).
 *
 * The browser makes a WebRTC offer and hands it to api/voice/live/start;
 * this file forwards the offer to the provider WITH THE REAL KEY and the
 * session's settings, and hands back the provider's answer. The audio
 * then flows browser to provider directly. Two things follow from doing
 * it this way round rather than giving the browser a short-lived key:
 *
 *   NO KEY OF ANY KIND REACHES THE BROWSER, and the session's settings —
 *   the model, the voice, the instructions — are set here and cannot be
 *   changed by whoever holds the page.
 *
 *   THE SERVER KNOWS THE CALL'S ID (the provider returns it in the
 *   Location header), so the server can END the call: when the person
 *   closes it, when a minute cannot be paid for, and from the sweep when
 *   a browser simply stops asking (api/cron/voice-live-sweep).
 *
 * NOTHING IS STORED HERE. No audio passes through this process at all.
 *
 * `OPENAI_BASE_URL` moves both calls, as it moves transcription
 * (lib/voice/voice-providers.ts), so a production build can be pointed
 * at a stand-in.
 */

const CALL_TIMEOUT_MS = 15_000;

export function liveConfigured(): boolean {
  return Boolean(process.env.OPENAI_API_KEY);
}

/** The session the call is opened with. Exported so the gate can read
 *  exactly what is sent rather than a description of it. */
export function liveSessionConfig(params: { instructions: string; language?: string }) {
  return {
    type: "realtime",
    model: LIVE_MODEL,
    instructions: params.instructions,
    output_modalities: ["audio"],
    audio: {
      input: {
        // The person's side as text, so the conversation can be kept.
        transcription: {
          model: LIVE_TRANSCRIBE_MODEL,
          ...(params.language ? { language: params.language } : {}),
        },
        // NO PRESS TO TALK, AND SPEAKING OVER IT STOPS IT. The provider
        // decides when a turn has ended and answers by itself
        // (create_response); a new voice while it is speaking cancels
        // what it was saying (interrupt_response).
        turn_detection: {
          type: "semantic_vad",
          create_response: true,
          interrupt_response: true,
        },
      },
      // A stock voice by NAME. Never an object with an id: that is how a
      // custom voice is asked for, and this product does not clone one.
      output: { voice: LIVE_VOICE },
    },
  } as const;
}

export type OpenLiveCallResult =
  | { ok: true; answerSdp: string; callId: string }
  | { ok: false; failure: VoiceFailure };

/** `rtc_…` out of a Location header such as `/v1/realtime/calls/rtc_abc`. */
export function callIdFromLocation(location: string | null): string | null {
  if (!location) return null;
  const last = location.split("?")[0].split("/").filter(Boolean).pop() ?? "";
  return /^[A-Za-z0-9_-]{4,200}$/.test(last) ? last : null;
}

export async function openLiveCall(params: {
  offerSdp: string;
  instructions: string;
  language?: string;
}): Promise<OpenLiveCallResult> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return {
      ok: false,
      failure: { kind: "not_configured", detail: "OPENAI_API_KEY is not set on this deployment, so a live conversation cannot start." },
    };
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), CALL_TIMEOUT_MS);
  try {
    const form = new FormData();
    form.set("sdp", params.offerSdp);
    form.set("session", JSON.stringify(liveSessionConfig(params)));
    const response = await fetch(`${openAiBase()}/realtime/calls`, {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}` },
      body: form,
      signal: controller.signal,
    });
    if (!response.ok) {
      const body = await response.text().catch(() => "");
      logApiError("voice:live:open", new Error(`${response.status} ${body.slice(0, 300)}`));
      return { ok: false, failure: { kind: "provider_error", detail: `The live call could not be opened (${response.status}).` } };
    }
    const answerSdp = await response.text();
    const callId = callIdFromLocation(response.headers.get("location"));
    if (!answerSdp.trim()) {
      return { ok: false, failure: { kind: "empty", detail: "The live service returned no answer." } };
    }
    if (!callId) {
      // A call this server cannot name is a call it cannot end. Refused
      // rather than left open: the answer is not handed to the browser,
      // so the call never connects.
      logApiError("voice:live:open", new Error("no call id in the Location header"));
      return { ok: false, failure: { kind: "provider_error", detail: "The live call came back without an id." } };
    }
    return { ok: true, answerSdp, callId };
  } catch (err) {
    logApiError("voice:live:open", err);
    return { ok: false, failure: { kind: "provider_error", detail: "The live service could not be reached." } };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * End a call. True when the provider says it is over — including when it
 * says it never knew it (404), which is what an already-ended call looks
 * like. Never throws: every caller is cleaning up.
 */
export async function hangupLiveCall(callId: string): Promise<boolean> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey || !callIdFromLocation(callId)) return false;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), CALL_TIMEOUT_MS);
  try {
    const response = await fetch(`${openAiBase()}/realtime/calls/${encodeURIComponent(callId)}/hangup`, {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}` },
      signal: controller.signal,
    });
    if (response.ok || response.status === 404) return true;
    logApiError("voice:live:hangup", new Error(`${response.status}`), { callId });
    return false;
  } catch (err) {
    logApiError("voice:live:hangup", err, { callId });
    return false;
  } finally {
    clearTimeout(timer);
  }
}
