"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Mic, Square, X, Check } from "lucide-react";
import { ThinkingIndicator } from "@/components/ui/thinking-indicator";
import { useToast } from "@/components/toast/toast-context";
import { useCredits } from "@/components/credits/credits-context";
import { formatNumber } from "@/lib/format-number";
import { useRecorder } from "@/components/voice/use-recorder";
import { useAudioLevel } from "@/components/voice/use-audio-level";
import { VoiceOrb } from "@/components/voice/voice-orb";
import { useVoiceAvailability } from "@/components/voice/voice-availability";
import { useVoiceErrorText } from "@/components/voice/use-voice-error-text";

/**
 * THE MICROPHONE, ON ANY INPUT.
 *
 * FOUR RULES THIS COMPONENT EXISTS TO KEEP, and each of them is a thing
 * a voice feature gets wrong by default:
 *
 *   THE TEXT INPUT NEVER GOES AWAY. This renders as a button BESIDE a
 *   field, never instead of one. Somebody on a train, in an office, with
 *   a speech difference, or with no microphone at all must lose nothing.
 *
 *   NOTHING RECORDS UNTIL IT IS PRESSED, and the first press shows an
 *   EXPLANATION rather than going straight to the browser's permission
 *   prompt. A prompt with no context is the one people deny, and a
 *   denied microphone permission is close to permanent.
 *
 *   THE TRANSCRIPT IS EDITABLE BEFORE IT IS SENT. It lands in the field
 *   the user was already typing into. Nothing is submitted on their
 *   behalf: transcription is not perfect, and a feature that acts on its
 *   own mistakes is worse than one that hands you them to fix.
 *
 *   WHILE THE MICROPHONE IS OPEN IT IS OBVIOUS. The orb, the colour, a
 *   label, and a live region for a screen reader.
 */
export function VoiceInput({
  onTranscript,
  disabled,
  compact,
  review = "dialog",
}: {
  /** Called with the text once the user accepts it. The PARENT decides
   *  where it goes — appended to a textarea, put in a field — and the
   *  parent never sends it. */
  onTranscript: (text: string) => void;
  disabled?: boolean;
  /** A small icon button, for a form row rather than a chat composer. */
  compact?: boolean;
  /**
   * WHO SHOWS THE TRANSCRIPT BEFORE ANYTHING USES IT.
   *
   * "dialog" (the default): this component does, in the editable draft
   * below, and hands the text on only once it is accepted.
   *
   * "card": the PARENT does, in a card that quotes what was heard and says
   * what would happen before anything happens - the Home field's
   * "Κατάλαβα: «…»" (components/create/goal-preview.tsx). Asking twice in a
   * row, "is this what you said?" and then "shall I do this?", is one
   * question too many; the card asks both. Only a parent with such a card
   * may pass it: scripts/tests/voice-command.test.mjs holds the list to the
   * Home field.
   */
  review?: "dialog" | "card";
}) {
  const t = useTranslations("voice");
  const locale = useLocale();
  const { addToast } = useToast();
  const { refresh: refreshCredits, reportUsage } = useCredits();
  const availability = useVoiceAvailability();
  const voiceError = useVoiceErrorText();

  const [explaining, setExplaining] = useState(false);
  const [busy, setBusy] = useState(false);
  const [draft, setDraft] = useState<string | null>(null);
  const draftRef = useRef<HTMLTextAreaElement | null>(null);
  // Consent is remembered for the session only. Not localStorage: the
  // explanation is cheap and the alternative is somebody who cleared
  // their permission being sent straight back to a bare browser prompt.
  const explainedRef = useRef(false);

  const send = useCallback(
    async (blob: Blob, seconds: number) => {
      setBusy(true);
      try {
        const form = new FormData();
        form.append("audio", blob, "clip");
        form.append("seconds", String(seconds));
        form.append("locale", locale);
        const response = await fetch("/api/voice/transcribe", { method: "POST", body: form });
        const data = await response.json();
        if (!data.ok) {
          // TRANSLATED BY CODE, not by echoing the server's English.
          addToast(voiceError(data), "error");
          return;
        }
        // The response carries what the transcription cost; reportUsage
        // refreshes the balance AND says so, where refreshCredits only did
        // the first half. /api/voice/transcribe has returned the receipt
        // since it was written; nothing read it.
        void reportUsage(data);
        availability.refresh();
        // INTO A DRAFT, not into the field and not into a send. The user
        // reads it, fixes it, and accepts it - here, or in the parent's own
        // card when the parent has one (see `review`).
        const heard = String(data.text ?? "").trim();
        if (review === "card") {
          if (heard) onTranscript(heard);
        } else {
          setDraft(heard);
        }
      } catch {
        addToast(t("errors.failed"), "error");
      } finally {
        setBusy(false);
      }
    },
    [addToast, availability, locale, onTranscript, refreshCredits, reportUsage, review, t, voiceError]
  );

  const recorder = useRecorder({
    onResult: ({ blob, seconds }) => void send(blob, seconds),
    onError: (reason) => {
      addToast(t(`errors.${reason}`), "error");
    },
  });

  const level = useAudioLevel(
    recorder.stream ? { kind: "stream", stream: recorder.stream } : { kind: "none" }
  );

  useEffect(() => {
    if (draft !== null) draftRef.current?.focus();
  }, [draft]);

  // NOT DRAWN WHEN IT CANNOT RECORD — the owner's rule, 2026-10-05
  // (the voice brief «ΦΩΝΗ ΣΤΟ CHAT», Μέρος Α): «Κουμπί που δεν κάνει τίποτα δεν
  // μένει στην οθόνη», and scenario 11, «Χωρίς κλειδί παρόχου, τα δύο
  // κουμπιά δεν εμφανίζονται».
  //
  // V4.6 drew an inert microphone here instead, with the reason revealed
  // on a tap. What that produced was the report "I pressed the microphone
  // in Chat and nothing was written": a button the size and place of a
  // working one, which records nothing, reads as broken rather than as
  // off. Not on the plan, no provider key, no minutes left, or an
  // availability read that failed — each is "this cannot record", and
  // each now draws nothing. WHY voice is off is said once, where
  // somebody goes to turn it on: the Voice settings screen
  // (components/settings/voice-settings.tsx), which names all three.
  //
  // Before the availability call has answered it is also nothing: a
  // button that flickers from absent to live is better than one that
  // flickers from live to absent.
  //
  // Held by scripts/tests/chat-dictation.prodtest.mjs (each state, both
  // devices) and scripts/tests/voice.test.mjs.
  if (!availability.transcribeAvailable || !availability.hasMinutes) return null;

  function press() {
    if (recorder.recording) {
      recorder.stop();
      return;
    }
    if (!explainedRef.current) {
      setExplaining(true);
      return;
    }
    void recorder.start();
  }

  return (
    <>
      <button
        type="button"
        onClick={press}
        disabled={disabled || busy}
        aria-pressed={recorder.recording}
        aria-label={recorder.recording ? t("stopListening") : t("startListening")}
        title={t("costPerMinute", { credits: availability.creditsPerMinute.transcribe })}
        className={`flex ${compact ? "h-9 w-9" : "min-h-[44px] min-w-[44px]"} items-center justify-center rounded-item border transition-colors duration-150 disabled:opacity-40 ${
          recorder.recording
            ? "border-foreground/50 bg-foreground/15 text-foreground"
            : "border-border text-muted hover:text-foreground"
        }`}
      >
        {/* THE GLOBE, NOT A SPINNER. What is happening during this wait
            is a transcription model reading the clip — the same class of
            work the globe signs everywhere else in the app. A ring
            spinner here would say "saving", which is what
            scripts/tests/globe-mark.test.mjs exists to keep it from
            saying. */}
        {busy ? (
          <ThinkingIndicator size="sm" tone="accent" />
        ) : recorder.recording ? (
          <Square className="h-4 w-4" aria-hidden="true" />
        ) : (
          <Mic className="h-4 w-4" aria-hidden="true" />
        )}
      </button>

      {/* THE EXPLANATION, BEFORE THE BROWSER PROMPT. */}
      {explaining && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center px-4">
          <div className="fixed inset-0 bg-background/60 backdrop-blur-sm" onClick={() => setExplaining(false)} aria-hidden="true" />
          <div role="dialog" aria-modal="true" aria-label={t("permission.title")} className="relative w-full max-w-sm surface">
            <p className="text-sm font-semibold text-foreground">{t("permission.title")}</p>
            <ul className="mt-3 space-y-2 text-[12px] leading-relaxed text-muted">
              <li>• {t("permission.pressToStart")}</li>
              <li>• {t("permission.notStored")}</li>
              <li>• {t("permission.editFirst")}</li>
              <li>
                •{" "}
                {t("permission.cost", {
                  credits: availability.creditsPerMinute.transcribe,
                  minutes: availability.limitMinutes,
                })}
              </li>
            </ul>
            <div className="mt-4 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => {
                  explainedRef.current = true;
                  setExplaining(false);
                  void recorder.start();
                }}
                className="min-h-[44px] rounded-item bg-button px-4 text-xs font-semibold text-button-ink transition-opacity hover:opacity-90"
              >
                {t("permission.allow")}
              </button>
              <button
                type="button"
                onClick={() => setExplaining(false)}
                className="min-h-[44px] rounded-item border border-border px-4 text-xs text-muted transition-colors hover:text-foreground"
              >
                {t("permission.cancel")}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* WHILE IT IS LISTENING: the orb, full screen, unmistakable. */}
      {recorder.recording && (
        <div className="fixed inset-0 z-[70] flex flex-col items-center justify-center gap-6 bg-background/80 backdrop-blur-sm">
          <VoiceOrb state="listening" readLevel={level.readLevel} />
          <p className="text-sm font-medium text-foreground">{t("listening")}</p>
          <p className="max-w-xs text-center text-[11px] leading-relaxed text-muted">
            {t("listeningHint")}
          </p>
          <button
            type="button"
            onClick={() => recorder.stop()}
            className="flex min-h-[44px] items-center gap-2 rounded-item bg-button px-4 text-sm font-semibold text-button-ink"
          >
            <Square className="h-4 w-4" aria-hidden="true" />
            {t("stopListening")}
          </button>
        </div>
      )}

      {/* THE TRANSCRIPT, EDITABLE, BEFORE ANYTHING IS SENT. */}
      {draft !== null && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center px-4">
          <div className="fixed inset-0 bg-background/60 backdrop-blur-sm" onClick={() => setDraft(null)} aria-hidden="true" />
          <div role="dialog" aria-modal="true" aria-label={t("draft.title")} className="relative w-full max-w-md surface-tight">
            <p className="mb-2 text-sm font-semibold text-foreground">{t("draft.title")}</p>
            <textarea
              ref={draftRef}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              rows={5}
              className="input w-full resize-y"
              aria-label={t("draft.title")}
            />
            <div className="mt-3 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => {
                  const text = draft.trim();
                  setDraft(null);
                  if (text) onTranscript(text);
                }}
                disabled={draft.trim().length === 0}
                className="flex min-h-[44px] items-center gap-2 rounded-item bg-button px-4 text-xs font-semibold text-button-ink transition-opacity hover:opacity-90 disabled:opacity-50"
              >
                <Check className="h-4 w-4" aria-hidden="true" />
                {t("draft.use")}
              </button>
              <button
                type="button"
                onClick={() => setDraft(null)}
                className="flex min-h-[44px] items-center gap-2 rounded-item border border-border px-4 text-xs text-muted transition-colors hover:text-foreground"
              >
                <X className="h-4 w-4" aria-hidden="true" />
                {t("draft.discard")}
              </button>
            </div>
            <p className="mt-2 text-[10px] leading-relaxed text-muted">{t("draft.notSent")}</p>
          </div>
        </div>
      )}
    </>
  );
}
