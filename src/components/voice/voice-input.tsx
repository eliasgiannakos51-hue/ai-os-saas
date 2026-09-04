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
}: {
  /** Called with the text once the user accepts it. The PARENT decides
   *  where it goes — appended to a textarea, put in a field — and the
   *  parent never sends it. */
  onTranscript: (text: string) => void;
  disabled?: boolean;
  /** A small icon button, for a form row rather than a chat composer. */
  compact?: boolean;
}) {
  const t = useTranslations("voice");
  const locale = useLocale();
  const { addToast } = useToast();
  const { refresh: refreshCredits } = useCredits();
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
        refreshCredits();
        availability.refresh();
        // INTO A DRAFT, not into the field and not into a send. The user
        // reads it, fixes it, and accepts it.
        setDraft(String(data.text ?? ""));
      } catch {
        addToast(t("errors.failed"), "error");
      } finally {
        setBusy(false);
      }
    },
    [addToast, availability, locale, refreshCredits, t, voiceError]
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

  // Whether the "why is this off" note is showing. See the disabled branch
  // below: a phone cannot hover, so the reason has to be tappable.
  const [reasonShown, setReasonShown] = useState(false);

  // RENDERED, BUT INERT, WHEN VOICE CANNOT WORK HERE — V4.6.
  //
  // This used to return null, on the reasoning that a microphone that
  // appears and then says "not configured" has wasted somebody's breath.
  // What that produced was the report "the microphone does not exist in
  // the main chat" from the owner of a deployment with no OPENAI_API_KEY:
  // a control that silently is not there cannot tell anybody WHY it is
  // not there. So it is drawn, disabled, and its title says which of the
  // three reasons applies — not set up on this deployment, not on this
  // plan, or no minutes left — and it does not record, so no breath is
  // wasted either. Before the availability call has answered it is still
  // nothing: a button that flickers from "not set up" to live is worse
  // than a moment of absence.
  if (!availability.transcribeAvailable) {
    if (!availability.loaded) return null;
    const reason = !availability.configured.transcribe
      ? t("settings.notConfigured")
      : !availability.included
        ? t("settings.notIncluded")
        : t("outOfMinutes");
    // A `title` IS A HOVER, AND A PHONE CANNOT HOVER — V4.6, round 6.
    //
    // The previous version put the reason in `title` and set `disabled`.
    // On a desktop that reads as a tooltip; on a phone it is nothing at
    // all, and `disabled` means the tap fires no event either. Measured on
    // the live site at 390px with a real CDP touch on 2026-09-05: the
    // button is 44x44 and uncovered, the tap lands on it, and the screen
    // does not change by one character. So the control that exists ONLY to
    // explain why voice is missing explained nothing to the person most
    // likely to be looking at it.
    //
    // `aria-disabled` without `disabled` keeps it inert and announced as
    // unavailable while still receiving the tap, which is the accessible
    // shape for exactly this: a control that must say why rather than one
    // that must be silent. The reason is revealed IN THE PAGE, so it does
    // not depend on a pointer that can hover.
    return (
      <span className="flex items-center gap-2">
        <button
          type="button"
          aria-disabled="true"
          onClick={() => setReasonShown((shown) => !shown)}
          aria-label={`${t("startListening")} — ${reason}`}
          title={reason}
          data-testid="voice-input-unavailable"
          className={
            // 44px in both variants: an inert control is still a control the
            // layout gate measures (scripts/tests/layout-stress.prodtest.mjs),
            // and a 32px one grew its under-44px count by four.
            compact
              ? "flex min-h-[44px] min-w-[44px] cursor-not-allowed items-center justify-center rounded-lg text-muted/50"
              : "flex min-h-[44px] min-w-[44px] cursor-not-allowed items-center justify-center rounded-full border border-dashed border-border text-muted/50"
          }
        >
          <Mic className={compact ? "h-4 w-4" : "h-[18px] w-[18px]"} aria-hidden="true" />
        </button>
        {/* THE REASON, ON THE PAGE. role="status" so a screen reader
            announces it when it appears, and it stays until the control
            is tapped again — a phone has no hover to dismiss it with. */}
        {reasonShown ? (
          <span role="status" className="max-w-[18rem] text-xs leading-snug text-muted">
            {reason}
          </span>
        ) : null}
      </span>
    );
  }

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
        disabled={disabled || busy || !availability.hasMinutes}
        aria-pressed={recorder.recording}
        aria-label={recorder.recording ? t("stopListening") : t("startListening")}
        title={
          availability.hasMinutes
            ? t("costPerMinute", { credits: availability.creditsPerMinute.transcribe })
            : t("outOfMinutes")
        }
        className={`flex ${compact ? "h-9 w-9" : "min-h-[44px] min-w-[44px]"} items-center justify-center rounded-lg border transition-colors duration-150 disabled:opacity-40 ${
          recorder.recording
            ? "border-orange-500/50 bg-orange-500/15 text-orange-300"
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
          <div className="fixed inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setExplaining(false)} aria-hidden="true" />
          <div role="dialog" aria-modal="true" aria-label={t("permission.title")} className="relative w-full max-w-sm rounded-2xl border border-border bg-panel p-5">
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
                className="min-h-[44px] rounded-lg bg-orange-500 px-4 text-xs font-semibold text-black transition-opacity hover:opacity-90"
              >
                {t("permission.allow")}
              </button>
              <button
                type="button"
                onClick={() => setExplaining(false)}
                className="min-h-[44px] rounded-lg border border-border px-4 text-xs text-muted transition-colors hover:text-foreground"
              >
                {t("permission.cancel")}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* WHILE IT IS LISTENING: the orb, full screen, unmistakable. */}
      {recorder.recording && (
        <div className="fixed inset-0 z-[70] flex flex-col items-center justify-center gap-6 bg-black/80 backdrop-blur-sm">
          <VoiceOrb state="listening" readLevel={level.readLevel} />
          <p className="text-sm font-medium text-orange-300">{t("listening")}</p>
          <p className="max-w-xs text-center text-[11px] leading-relaxed text-muted">
            {t("listeningHint")}
          </p>
          <button
            type="button"
            onClick={() => recorder.stop()}
            className="flex min-h-[44px] items-center gap-2 rounded-lg bg-orange-500 px-4 text-sm font-semibold text-black"
          >
            <Square className="h-4 w-4" aria-hidden="true" />
            {t("stopListening")}
          </button>
        </div>
      )}

      {/* THE TRANSCRIPT, EDITABLE, BEFORE ANYTHING IS SENT. */}
      {draft !== null && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center px-4">
          <div className="fixed inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setDraft(null)} aria-hidden="true" />
          <div role="dialog" aria-modal="true" aria-label={t("draft.title")} className="relative w-full max-w-md rounded-2xl border border-border bg-panel p-4">
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
                className="flex min-h-[44px] items-center gap-2 rounded-lg bg-orange-500 px-4 text-xs font-semibold text-black transition-opacity hover:opacity-90 disabled:opacity-50"
              >
                <Check className="h-4 w-4" aria-hidden="true" />
                {t("draft.use")}
              </button>
              <button
                type="button"
                onClick={() => setDraft(null)}
                className="flex min-h-[44px] items-center gap-2 rounded-lg border border-border px-4 text-xs text-muted transition-colors hover:text-foreground"
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
