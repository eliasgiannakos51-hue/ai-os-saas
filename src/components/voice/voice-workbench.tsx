"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Copy, Check } from "lucide-react";
import { VoicePlayer } from "@/components/voice/voice-player";
import { VoiceInput } from "@/components/voice/voice-input";
import { useVoiceAvailability } from "@/components/voice/voice-availability";
import { useToast } from "@/components/toast/toast-context";

const MAX_TEXT_LENGTH = 5000;

/**
 * THE TWO THINGS VOICE ACTUALLY DOES, ON ONE SCREEN.
 *
 * Both halves shipped long before this page: api/voice/speak reaches
 * ElevenLabs, api/voice/transcribe reaches a transcription provider, and
 * both reserve and settle credits like every other paid call here. What
 * did not exist was a place to use either one deliberately. The
 * microphone lived inside the chat composer and the Listen button lived
 * next to text somebody else had produced, so "read this out" and "write
 * down what I say" — the two reasons a person goes looking for voice —
 * were reachable only as a side effect of doing something else.
 *
 * IT RENDERS ITS OWN ABSENCE. `useVoiceAvailability` answers three
 * separate questions (is the provider key set, does the plan include it,
 * are there minutes left) and each has a different sentence, because "not
 * available" covering all three is what makes somebody email support. A
 * control that cannot work is not drawn — components/voice/
 * voice-availability.tsx's header is the incident that rule came from.
 */
export function VoiceWorkbench() {
  const t = useTranslations("dashboard.voicePage");
  const availability = useVoiceAvailability();
  const { addToast } = useToast();

  const [toRead, setToRead] = useState("");
  const [transcript, setTranscript] = useState("");
  const [copied, setCopied] = useState(false);

  async function copyTranscript() {
    try {
      await navigator.clipboard.writeText(transcript);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      addToast(t("copyFailed"), "error");
    }
  }

  return (
    <div className="space-y-4">
      {/* READ THIS OUT ------------------------------------------------ */}
      <section className="rounded-2xl border border-border bg-panel/50 p-4">
        <h2 className="text-sm font-semibold text-foreground">{t("speakTitle")}</h2>
        <p className="mt-1 max-w-prose text-sm text-muted">{t("speakWhat")}</p>

        {availability.loaded && !availability.speakAvailable ? (
          <p className="mt-3 rounded-xl border border-border bg-background/40 p-3 text-xs text-muted">
            {!availability.configured.speak ? t("speakNotConfigured") : t("speakNotAvailable")}
          </p>
        ) : (
          <>
            <label htmlFor="voice-to-read" className="sr-only">
              {t("speakLabel")}
            </label>
            <textarea
              id="voice-to-read"
              value={toRead}
              onChange={(e) => setToRead(e.target.value.slice(0, MAX_TEXT_LENGTH))}
              rows={4}
              maxLength={MAX_TEXT_LENGTH}
              placeholder={t("speakPlaceholder")}
              className="mt-3 w-full rounded-xl border border-border bg-background/60 p-3 text-sm text-foreground placeholder:text-muted focus:border-orange-500/50 focus:outline-none"
            />
            <div className="mt-3 flex items-center gap-3">
              {/* The player prices and meters the call itself, and refuses
                  when the allowance is spent — nothing is duplicated here. */}
              <VoicePlayer text={toRead.trim()} />
              <span className="text-[11px] text-muted">
                {t("charCount", { count: toRead.length, max: MAX_TEXT_LENGTH })}
              </span>
            </div>
          </>
        )}
      </section>

      {/* WRITE DOWN WHAT I SAY ---------------------------------------- */}
      <section className="rounded-2xl border border-border bg-panel/50 p-4">
        <h2 className="text-sm font-semibold text-foreground">{t("transcribeTitle")}</h2>
        <p className="mt-1 max-w-prose text-sm text-muted">{t("transcribeWhat")}</p>

        {availability.loaded && !availability.transcribeAvailable ? (
          <p className="mt-3 rounded-xl border border-border bg-background/40 p-3 text-xs text-muted">
            {!availability.configured.transcribe
              ? t("transcribeNotConfigured")
              : t("transcribeNotAvailable")}
          </p>
        ) : (
          <>
            <div className="mt-3">
              {/* The PARENT decides where the text goes and never sends it
                  anywhere — see the component's own prop comment. */}
              <VoiceInput onTranscript={(text) => setTranscript((current) => (current ? `${current}\n${text}` : text))} />
            </div>
            {transcript ? (
              <div className="mt-3">
                <label htmlFor="voice-transcript" className="sr-only">
                  {t("transcribeLabel")}
                </label>
                <textarea
                  id="voice-transcript"
                  value={transcript}
                  onChange={(e) => setTranscript(e.target.value)}
                  rows={5}
                  className="w-full rounded-xl border border-border bg-background/60 p-3 text-sm text-foreground focus:border-orange-500/50 focus:outline-none"
                />
                <button
                  type="button"
                  onClick={copyTranscript}
                  className="mt-2 flex min-h-[44px] items-center gap-2 rounded-xl border border-border px-3 text-sm text-foreground transition-colors duration-150 hover:border-orange-500/50"
                >
                  {copied ? (
                    <Check className="h-4 w-4 text-orange-400" aria-hidden="true" />
                  ) : (
                    <Copy className="h-4 w-4" aria-hidden="true" />
                  )}
                  {copied ? t("copied") : t("copy")}
                </button>
              </div>
            ) : (
              <p className="mt-3 text-xs text-muted">{t("transcribeEmpty")}</p>
            )}
          </>
        )}
      </section>
    </div>
  );
}
