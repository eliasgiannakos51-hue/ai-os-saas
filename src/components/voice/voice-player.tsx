"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Volume2, Pause } from "lucide-react";
import { ThinkingIndicator } from "@/components/ui/thinking-indicator";
import { useToast } from "@/components/toast/toast-context";
import { useCredits } from "@/components/credits/credits-context";
import { formatNumber } from "@/lib/format-number";
import {
  DEFAULT_VOICE,
  PLAYBACK_RATES,
  VOICES,
  speakableWords,
  wordIndexAt,
  type PlaybackRate,
  type VoiceKey,
} from "@/lib/voice/voice-config";
import { MAX_SPEAK_CHARS, SPOKEN_CHARS_PER_MINUTE } from "@/lib/voice/voice-pricing";
import { useVoiceAvailability } from "@/components/voice/voice-availability";
import { useVoiceErrorText } from "@/components/voice/use-voice-error-text";

/**
 * "LISTEN" — on a chat answer, a research report, an agent summary.
 *
 * THE PRICE IS ON THE BUTTON, and that is not decoration. Speech costs
 * roughly sixteen times what transcription does: a 1,200-character
 * answer read aloud is more credits than a standard agent run. A control
 * that hides that is a control that spends somebody's month while they
 * are catching up on their inbox.
 *
 * THE AUDIO IS NEVER STORED — not by us and not here. The blob URL is
 * revoked when the component unmounts or the text changes, so nothing
 * lingers in memory either.
 *
 * THE HIGHLIGHT IS AN APPROXIMATION AND SAYS SO. It is proportional to
 * characters, not to the provider's real per-character timings, which
 * this API does not return. It tracks well within a sentence and drifts
 * over a long paragraph; the honest alternative was no highlight at all.
 */
export function VoicePlayer({ text, compact }: { text: string; compact?: boolean }) {
  const t = useTranslations("voice");
  const locale = useLocale();
  const { addToast } = useToast();
  const { refresh: refreshCredits } = useCredits();
  const availability = useVoiceAvailability();
  const voiceError = useVoiceErrorText();

  const [loading, setLoading] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [rate, setRate] = useState<PlaybackRate>(1);
  const [voice, setVoice] = useState<VoiceKey>(DEFAULT_VOICE);
  const [wordIndex, setWordIndex] = useState(-1);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const urlRef = useRef<string | null>(null);
  const rafRef = useRef<number | null>(null);

  const words = speakableWords(text);
  const trimmed = text.trim().slice(0, MAX_SPEAK_CHARS);
  // The same figure the server will charge, derived from the same
  // constant — a second estimate in the component is a second number to
  // be wrong.
  const estimatedCredits = Math.ceil(
    (trimmed.length / SPOKEN_CHARS_PER_MINUTE) * availability.creditsPerMinute.speak
  );

  const teardown = useCallback(() => {
    if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    rafRef.current = null;
    const audio = audioRef.current;
    if (audio) {
      audio.pause();
      audio.src = "";
    }
    audioRef.current = null;
    if (urlRef.current) URL.revokeObjectURL(urlRef.current);
    urlRef.current = null;
    setPlaying(false);
    setWordIndex(-1);
  }, []);

  // A new text is a new clip: the old one is released rather than left
  // holding a blob nobody can reach.
  useEffect(() => teardown, [teardown, text]);

  const follow = useCallback(() => {
    const audio = audioRef.current;
    if (!audio) return;
    const durationMs = Number.isFinite(audio.duration) ? audio.duration * 1000 : 0;
    setWordIndex(wordIndexAt(words, audio.currentTime * 1000, durationMs));
    rafRef.current = requestAnimationFrame(follow);
  }, [words]);

  async function play() {
    const existing = audioRef.current;
    if (existing) {
      if (playing) {
        existing.pause();
        setPlaying(false);
        if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
        return;
      }
      existing.playbackRate = rate;
      await existing.play().catch(() => {});
      setPlaying(true);
      rafRef.current = requestAnimationFrame(follow);
      return;
    }

    setLoading(true);
    try {
      const response = await fetch("/api/voice/speak", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: trimmed, voice }),
      });
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        addToast(voiceError(data), "error");
        return;
      }
      // The receipt travels in headers because the body is the audio.
      const charged = Number(response.headers.get("X-Voice-Credits") ?? 0);
      if (charged > 0) refreshCredits();
      availability.refresh();

      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      urlRef.current = url;
      const audio = new Audio(url);
      audio.playbackRate = rate;
      audio.onended = () => {
        setPlaying(false);
        setWordIndex(-1);
        if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
      };
      audioRef.current = audio;
      await audio.play().catch(() => {});
      setPlaying(true);
      rafRef.current = requestAnimationFrame(follow);
    } catch {
      addToast(t("errors.failed"), "error");
    } finally {
      setLoading(false);
    }
  }

  // NOT RENDERED when the deployment has no speech provider or the plan
  // does not include voice — the text is right there to read.
  if (!availability.speakAvailable) return null;

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => void play()}
          disabled={loading || !availability.hasMinutes || trimmed.length === 0}
          aria-label={playing ? t("pause") : t("listen")}
          className="flex min-h-[36px] items-center gap-1.5 rounded-lg border border-border px-2.5 text-xs text-foreground transition-colors hover:bg-panel-hover disabled:opacity-40"
        >
          {/* Same reasoning as the microphone button: the wait is a
              speech model producing the clip, not a round trip to our
              own database. */}
          {loading ? (
            <ThinkingIndicator size="sm" tone="accent" />
          ) : playing ? (
            <Pause className="h-3.5 w-3.5" aria-hidden="true" />
          ) : (
            <Volume2 className="h-3.5 w-3.5" aria-hidden="true" />
          )}
          {/* THE PRICE, ON THE BUTTON, BEFORE IT IS PRESSED. */}
          {playing ? t("pause") : t("listenFor", { credits: estimatedCredits })}
        </button>

        {!compact && (
          <>
            <select
              value={rate}
              onChange={(e) => {
                const next = Number(e.target.value) as PlaybackRate;
                setRate(next);
                if (audioRef.current) audioRef.current.playbackRate = next;
              }}
              aria-label={t("speed")}
              className="min-h-[36px] rounded-lg border border-border bg-panel px-2 text-xs text-foreground"
            >
              {PLAYBACK_RATES.map((r) => (
                <option key={r} value={r}>
                  {r}x
                </option>
              ))}
            </select>
            <select
              value={voice}
              onChange={(e) => {
                setVoice(e.target.value as VoiceKey);
                // A new voice is a new clip. Tearing down here is what
                // stops the picker looking like it did nothing.
                teardown();
              }}
              aria-label={t("voice")}
              className="min-h-[36px] rounded-lg border border-border bg-panel px-2 text-xs text-foreground"
            >
              {VOICES.map((v) => (
                <option key={v.key} value={v.key}>
                  {t(`voices.${v.key}`)}
                </option>
              ))}
            </select>
          </>
        )}
      </div>

      {/* THE WORD HIGHLIGHT. Rendered only while something is playing, so
          a paragraph at rest is ordinary text a person can select and
          copy rather than a wall of spans. */}
      {playing && wordIndex >= 0 && words[wordIndex] && (
        <p className="whitespace-pre-wrap text-sm leading-relaxed text-foreground" aria-hidden="true">
          {text.slice(0, words[wordIndex].start)}
          <mark className="bg-blue-500/25 text-foreground">{words[wordIndex].word}</mark>
          {text.slice(words[wordIndex].end)}
        </p>
      )}
    </div>
  );
}
