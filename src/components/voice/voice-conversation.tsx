"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { X, Mic } from "lucide-react";
import { useToast } from "@/components/toast/toast-context";
import { useCredits } from "@/components/credits/credits-context";
import { useRecorder } from "@/components/voice/use-recorder";
import { useAudioLevel, type AudioLevelSource } from "@/components/voice/use-audio-level";
import { VoiceOrb } from "@/components/voice/voice-orb";
import { useVoiceAvailability } from "@/components/voice/voice-availability";
import { useVoiceErrorText } from "@/components/voice/use-voice-error-text";
import { MAX_SPEAK_CHARS } from "@/lib/voice/voice-pricing";
import { DEFAULT_VOICE } from "@/lib/voice/voice-config";
import type { VoiceState } from "@/lib/voice/voice-visual";

/**
 * PRESS ONCE, TALK, IT ANSWERS, KEEP GOING (#2).
 *
 * The loop is: listening -> thinking -> speaking -> listening. Each turn
 * ends by itself on silence (lib/voice/voice-config.ts's SILENCE rules);
 * the whole thing ends when the user closes it. There is no wake word
 * and no listening between turns — the microphone opens for a turn and
 * closes at the end of it, which is what makes "is it listening?" a
 * question the orb can answer truthfully.
 *
 * INTERRUPTION. Tapping anywhere while it is speaking stops the playback
 * and starts listening immediately. That is the difference between a
 * conversation and a pair of monologues, and it is the one interaction
 * people try within the first ten seconds.
 *
 * THE TRANSCRIPT IS ON SCREEN THE WHOLE TIME. Voice is an addition to
 * the text, never a replacement for it: somebody who mishears, or who
 * turns the sound off halfway through, still has the exchange in front
 * of them.
 *
 * WHAT THIS IS NOT: streaming speech-to-text. The clip is recorded,
 * ended by silence, then transcribed — the provider used here is a
 * batch transcription API, not a realtime socket. That costs one round
 * trip per turn and is stated rather than hidden, because the latency
 * budget in the brief (<1.5s) is a claim about a path this environment
 * cannot measure.
 */
export function VoiceConversation({
  onClose,
  onExchange,
  conversationId,
  onConversationId,
}: {
  onClose: () => void;
  /** Every completed turn, so the surface that opened this can put the
   *  exchange into its own history. */
  onExchange?: (turn: { question: string; answer: string }) => void;
  /** The thread this belongs to. Without it every hands-free session
   *  would start a second conversation beside the one already open. */
  conversationId?: string | null;
  onConversationId?: (id: string) => void;
}) {
  const t = useTranslations("voice");
  const locale = useLocale();
  const { addToast } = useToast();
  const { refresh: refreshCredits } = useCredits();
  const availability = useVoiceAvailability();
  const voiceError = useVoiceErrorText();

  const [state, setState] = useState<VoiceState>("idle");
  const [turns, setTurns] = useState<{ question: string; answer: string }[]>([]);
  const [partial, setPartial] = useState("");
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const urlRef = useRef<string | null>(null);
  const conversationIdRef = useRef<string | null>(conversationId ?? null);
  // Set the moment the user closes or interrupts, and checked after every
  // await: without it a reply that arrives during teardown starts playing
  // into a closed dialog.
  const abandonedRef = useRef(false);

  const stopSpeaking = useCallback(() => {
    const audio = audioRef.current;
    if (audio) {
      audio.pause();
      audio.src = "";
    }
    audioRef.current = null;
    if (urlRef.current) URL.revokeObjectURL(urlRef.current);
    urlRef.current = null;
  }, []);

  const recorder = useRecorder({
    autoStopOnSilence: true,
    onResult: ({ blob, seconds }) => void handleTurn(blob, seconds),
    onError: (reason) => {
      setState("idle");
      if (reason !== "no_speech") addToast(t(`errors.${reason}`), "error");
    },
  });

  // The orb watches the microphone while listening and the reply while
  // speaking — the same component, two different sources, which is what
  // makes "it is talking" and "I am talking" look different.
  const [levelSource, setLevelSource] = useState<AudioLevelSource>({ kind: "none" });
  const level = useAudioLevel(levelSource);

  useEffect(() => {
    if (recorder.stream) setLevelSource({ kind: "stream", stream: recorder.stream });
    else if (!audioRef.current) setLevelSource({ kind: "none" });
  }, [recorder.stream]);

  const listen = useCallback(() => {
    if (abandonedRef.current) return;
    stopSpeaking();
    setState("listening");
    void recorder.start();
  }, [recorder, stopSpeaking]);

  async function handleTurn(blob: Blob, seconds: number) {
    if (abandonedRef.current) return;
    setState("thinking");
    setPartial("");
    try {
      // 1. SPEECH IN.
      const form = new FormData();
      form.append("audio", blob, "clip");
      form.append("seconds", String(seconds));
      form.append("locale", locale);
      const sttResponse = await fetch("/api/voice/transcribe", { method: "POST", body: form });
      const stt = await sttResponse.json();
      if (abandonedRef.current) return;
      if (!stt.ok) {
        addToast(voiceError(stt), "error");
        setState("idle");
        return;
      }
      const question = String(stt.text ?? "").trim();
      if (!question) {
        setState("idle");
        return;
      }
      setPartial(question);
      refreshCredits();

      // 2. THE ANSWER, streamed, so the text is on screen while the
      //    speech is still being synthesised.
      const chatResponse = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: question, conversationId: conversationIdRef.current }),
      });
      if (!chatResponse.ok || !chatResponse.body) {
        addToast(t("errors.failed"), "error");
        setState("idle");
        return;
      }
      const reader = chatResponse.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let answer = "";
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";
        for (const line of lines) {
          if (!line.trim()) continue;
          try {
            const event = JSON.parse(line);
            if (event.type === "meta" && typeof event.conversationId === "string") {
              if (event.conversationId !== conversationIdRef.current) {
                onConversationId?.(event.conversationId);
              }
              conversationIdRef.current = event.conversationId;
            } else if (event.type === "delta" && typeof event.text === "string") {
              answer += event.text;
            } else if (event.type === "error" && typeof event.error === "string") {
              addToast(event.error, "error");
            }
          } catch {
            // A partial line at the edge of a chunk is normal; the next
            // read completes it.
          }
        }
      }
      if (abandonedRef.current) return;
      refreshCredits();
      const turn = { question, answer: answer.trim() };
      setTurns((current) => [...current, turn]);
      setPartial("");
      onExchange?.(turn);
      if (!turn.answer) {
        setState("idle");
        return;
      }

      // 3. SPEECH OUT. Truncated to one request's worth: a long answer is
      //    read as far as it goes and the rest stays on screen, which is
      //    better than a five-minute clip nobody can interrupt cleanly.
      const speakResponse = await fetch("/api/voice/speak", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: turn.answer.slice(0, MAX_SPEAK_CHARS), voice: DEFAULT_VOICE }),
      });
      if (abandonedRef.current) return;
      if (!speakResponse.ok) {
        // THE ANSWER IS ALREADY ON SCREEN. A speech failure means it is
        // not read aloud, not that the turn was lost — so the loop goes
        // back to listening rather than stopping.
        listen();
        return;
      }
      refreshCredits();
      availability.refresh();
      const audioBlob = await speakResponse.blob();
      if (abandonedRef.current) return;
      const url = URL.createObjectURL(audioBlob);
      urlRef.current = url;
      const audio = new Audio(url);
      audioRef.current = audio;
      setLevelSource({ kind: "element", element: audio });
      setState("speaking");
      audio.onended = () => {
        if (abandonedRef.current) return;
        // 4. STRAIGHT BACK TO LISTENING. That is what makes it a
        //    conversation rather than a series of button presses.
        listen();
      };
      await audio.play().catch(() => listen());
    } catch {
      if (!abandonedRef.current) {
        addToast(t("errors.failed"), "error");
        setState("idle");
      }
    }
  }

  useEffect(() => {
    return () => {
      abandonedRef.current = true;
      stopSpeaking();
    };
  }, [stopSpeaking]);

  function close() {
    abandonedRef.current = true;
    recorder.stop();
    stopSpeaking();
    onClose();
  }

  return (
    <div className="fixed inset-0 z-[70] flex flex-col bg-black/85 backdrop-blur-sm">
      <div className="flex items-center justify-between px-4 py-3">
        <p className="text-xs text-muted">{t("conversation.title")}</p>
        <button
          type="button"
          onClick={close}
          aria-label={t("conversation.close")}
          className="flex h-10 w-10 items-center justify-center rounded-lg text-muted transition-colors hover:text-foreground"
        >
          <X className="h-5 w-5" aria-hidden="true" />
        </button>
      </div>

      {/* INTERRUPTION. The whole area is the target: somebody who wants
          to cut in should not have to find a button. */}
      <button
        type="button"
        onClick={() => {
          if (state === "speaking") listen();
          else if (state === "idle") listen();
        }}
        aria-label={state === "speaking" ? t("conversation.interrupt") : t("conversation.speak")}
        className="flex flex-1 flex-col items-center justify-center gap-5 px-6"
      >
        <VoiceOrb state={state} readLevel={level.readLevel} size={200} />
        <span className="text-sm font-medium text-foreground">{t(`states.${state}`)}</span>
        <span className="max-w-xs text-center text-[11px] leading-relaxed text-muted">
          {state === "speaking"
            ? t("conversation.tapToInterrupt")
            : state === "idle"
              ? t("conversation.tapToSpeak")
              : t("conversation.hint")}
        </span>
        {state === "idle" && turns.length === 0 && (
          <span className="flex items-center gap-2 rounded-lg bg-orange-500 px-4 py-2 text-sm font-semibold text-black">
            <Mic className="h-4 w-4" aria-hidden="true" />
            {t("conversation.start")}
          </span>
        )}
      </button>

      {/* THE TRANSCRIPT, ALWAYS. Voice adds to the text; it never
          replaces it. */}
      <div className="max-h-[38vh] overflow-y-auto border-t border-border px-4 py-3">
        {turns.length === 0 && !partial ? (
          <p className="text-center text-[11px] text-muted">{t("conversation.empty")}</p>
        ) : (
          <ul className="mx-auto max-w-lg space-y-3">
            {turns.map((turn, index) => (
              <li key={index} className="space-y-1">
                <p className="text-[11px] text-orange-300">{turn.question}</p>
                <p className="whitespace-pre-wrap text-sm leading-relaxed text-foreground">{turn.answer}</p>
              </li>
            ))}
            {partial && <li className="text-[11px] text-orange-300">{partial}</li>}
          </ul>
        )}
      </div>
    </div>
  );
}
