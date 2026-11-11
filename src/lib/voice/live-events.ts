import type { VoiceState } from "@/lib/voice/voice-visual";
import type { LiveTurn } from "@/lib/voice/live-pricing";

/**
 * WHAT THE PROVIDER SAYS DURING A LIVE CALL, TURNED INTO WHAT THE SCREEN
 * SHOWS (FS1).
 *
 * The call's data channel carries a stream of small JSON events. Two
 * things are read out of it and nothing else: WHICH OF THE FOUR STATES
 * the globe is in, and THE WORDS — the person's side as the provider
 * transcribed it, the answer as the provider's own transcript of what it
 * said. This file is that reading, as one pure function, so a gate can
 * run a recorded sequence through it (scripts/tests/voice-live.test.mjs)
 * instead of trusting a description of it.
 *
 * ORDER IS THE PROVIDER'S, NOT ARRIVAL'S. The transcript of what the
 * person said routinely arrives AFTER the answer to it has started. Each
 * line is therefore placed when its item is announced
 * (`conversation.item.added`) and filled in when its words come, so the
 * kept conversation reads question, answer, question, answer.
 *
 * Both the current event names and the ones they replaced are read
 * (`response.output_audio_transcript.*` / `response.audio_transcript.*`,
 * `conversation.item.added` / `.created`): a provider that renames an
 * event should cost a state label, not the transcript.
 */

export type LiveEntry = { id: string; role: "user" | "assistant"; text: string };
export type LiveModel = { state: VoiceState; entries: LiveEntry[] };

export const EMPTY_LIVE_MODEL: LiveModel = { state: "listening", entries: [] };

type AnyEvent = Record<string, unknown>;

function str(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function upsert(entries: LiveEntry[], id: string, role: LiveEntry["role"], write: (previous: string) => string): LiveEntry[] {
  const index = entries.findIndex((entry) => entry.id === id);
  if (index === -1) return [...entries, { id, role, text: write("") }];
  const next = entries.slice();
  next[index] = { ...next[index], text: write(next[index].text) };
  return next;
}

export function applyLiveEvent(model: LiveModel, raw: unknown): LiveModel {
  if (!raw || typeof raw !== "object") return model;
  const event = raw as AnyEvent;
  const type = str(event.type);

  switch (type) {
    // THE PERSON STARTED SPEAKING. Whatever was being said stops — the
    // provider cancels its answer by itself (interrupt_response in
    // lib/voice/live-provider.ts) — and the globe is listening again.
    case "input_audio_buffer.speech_started":
      return { ...model, state: "listening" };
    case "input_audio_buffer.speech_stopped":
      return { ...model, state: "thinking" };

    case "output_audio_buffer.started":
      return { ...model, state: "speaking" };
    case "output_audio_buffer.stopped":
    case "output_audio_buffer.cleared":
      return { ...model, state: "listening" };

    case "conversation.item.added":
    case "conversation.item.created": {
      const item = (event.item ?? {}) as AnyEvent;
      const id = str(item.id);
      const role = str(item.role);
      if (!id || str(item.type) !== "message" || (role !== "user" && role !== "assistant")) return model;
      if (model.entries.some((entry) => entry.id === id)) return model;
      return { ...model, entries: [...model.entries, { id, role, text: "" }] };
    }

    case "conversation.item.input_audio_transcription.completed": {
      const id = str(event.item_id);
      const transcript = str(event.transcript).trim();
      if (!id || !transcript) return model;
      return { ...model, entries: upsert(model.entries, id, "user", () => transcript) };
    }

    case "response.output_audio_transcript.delta":
    case "response.audio_transcript.delta": {
      const id = str(event.item_id);
      const delta = str(event.delta);
      if (!id || !delta) return model;
      return { ...model, entries: upsert(model.entries, id, "assistant", (previous) => previous + delta) };
    }
    case "response.output_audio_transcript.done":
    case "response.audio_transcript.done": {
      const id = str(event.item_id);
      const transcript = str(event.transcript).trim();
      if (!id || !transcript) return model;
      return { ...model, entries: upsert(model.entries, id, "assistant", () => transcript) };
    }

    default:
      return model;
  }
}

/** The conversation as it is kept: lines with words, in order. */
export function liveTurns(model: LiveModel): LiveTurn[] {
  return model.entries
    .map((entry) => ({ role: entry.role, text: entry.text.trim() }))
    .filter((turn) => turn.text.length > 0);
}

/** The last thing each side said, for the subtitles. */
export function liveSubtitles(model: LiveModel): { user: string; assistant: string } {
  const last = (role: LiveEntry["role"]) => {
    for (let i = model.entries.length - 1; i >= 0; i--) {
      if (model.entries[i].role === role && model.entries[i].text.trim()) return model.entries[i].text.trim();
    }
    return "";
  };
  return { user: last("user"), assistant: last("assistant") };
}

/** Milliseconds from now until the next minute must be asked for. Never
 *  negative: a call already inside its lead time asks at once. */
export function msUntilTick(paidUntilIso: string, nowMs: number, leadSeconds: number): number {
  const paidUntil = new Date(paidUntilIso).getTime();
  if (!Number.isFinite(paidUntil)) return 0;
  return Math.max(0, paidUntil - leadSeconds * 1000 - nowMs);
}
