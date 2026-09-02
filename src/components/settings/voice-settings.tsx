"use client";

import { useLocale, useTranslations } from "next-intl";
import { AudioLines } from "lucide-react";
import { formatNumber } from "@/lib/format-number";
import { useVoiceAvailability } from "@/components/voice/voice-availability";

/**
 * WHERE THE MINUTES AND THE PRICE ARE VISIBLE IN ONE PLACE.
 *
 * The price is already on every control that spends it — the microphone's
 * tooltip, the permission dialog, the "Listen" button. This is the other
 * half of "ορατό κόστος": what is LEFT this month, and what the two kinds
 * of voice work each cost, before somebody has pressed anything.
 *
 * IT SAYS WHY WHEN THERE IS NOTHING TO SHOW. A section that silently
 * disappears on a deployment with no provider keys, or on a plan without
 * voice, teaches somebody that the feature does not exist rather than
 * that it is off — so each of those is its own sentence.
 */
export function VoiceSettings() {
  const t = useTranslations("voice.settings");
  const locale = useLocale();
  const v = useVoiceAvailability();

  // Only while the one status call is still in flight. After it lands
  // there is always something true to say.
  if (!v.loaded) return null;

  const usedMinutes = Math.floor(v.usedSeconds / 60);
  const remainingMinutes = Math.floor(v.remainingSeconds / 60);
  const configured = v.transcribeAvailable || v.speakAvailable || v.included;
  const percent = v.limitMinutes > 0 ? Math.min(100, Math.round((v.usedSeconds / (v.limitMinutes * 60)) * 100)) : 0;

  return (
    <div id="voice" className="mb-6 scroll-mt-20 space-y-4 rounded-2xl border border-border bg-panel p-5">
      <h2 className="flex items-center gap-2 text-sm font-semibold text-foreground">
        <AudioLines className="h-4 w-4 text-orange-400" aria-hidden="true" /> {t("title")}
      </h2>
      <p className="text-xs leading-relaxed text-muted">{t("description")}</p>

      {!v.included ? (
        <p className="rounded-xl border border-border bg-input px-3 py-2 text-xs text-muted">
          {t("notIncluded")}
        </p>
      ) : !configured ? (
        <p className="rounded-xl border border-border bg-input px-3 py-2 text-xs text-muted">
          {t("notConfigured")}
        </p>
      ) : (
        <>
          <div>
            <p className="text-sm text-foreground">
              {t("used", {
                used: formatNumber(usedMinutes, locale),
                limit: formatNumber(v.limitMinutes, locale),
              })}
            </p>
            <div
              className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-input"
              role="progressbar"
              aria-valuenow={percent}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-label={t("title")}
            >
              <div
                className="h-full rounded-full bg-orange-500 transition-[width] duration-300"
                style={{ width: `${percent}%` }}
              />
            </div>
            <p className="mt-1.5 text-xs text-muted">
              {remainingMinutes > 0
                ? t("remaining", { minutes: remainingMinutes })
                : t("exhausted")}
            </p>
          </div>

          {/* THE TWO PRICES, SIDE BY SIDE, because they are not close to
              each other and somebody who assumes they are will be
              surprised by a bill. */}
          {/* A PRICE ONLY WHERE THERE IS SOMETHING TO BUY.
              
              The two keys are independent, and the half-configured state
              is the likely one rather than an edge case: OPENAI_API_KEY
              set and ELEVENLABS_API_KEY not means the microphone works
              everywhere and every "Listen" button silently does not
              render.
              
              This block used to print both prices whenever EITHER
              provider was configured, because `configured` above is an
              OR. So that deployment showed "Having it read to you — N
              credits a minute" for something that could not read
              anything, and the only other signal was the absence of a
              button, which is not a signal. A quoted price for a dead
              feature is worse than silence: silence is at least not a
              claim. */}
          <dl className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            <div className="rounded-xl border border-border bg-input px-3 py-2">
              <dt className="text-[11px] text-muted">{t("transcribeLabel")}</dt>
              <dd
                className={
                  v.configured.transcribe ? "text-sm text-foreground" : "text-xs text-amber-400/90"
                }
              >
                {v.configured.transcribe
                  ? t("perMinute", { credits: v.creditsPerMinute.transcribe })
                  : t("directionNotConfigured")}
              </dd>
            </div>
            <div className="rounded-xl border border-border bg-input px-3 py-2">
              <dt className="text-[11px] text-muted">{t("speakLabel")}</dt>
              <dd
                className={
                  v.configured.speak ? "text-sm text-foreground" : "text-xs text-amber-400/90"
                }
              >
                {v.configured.speak
                  ? t("perMinute", { credits: v.creditsPerMinute.speak })
                  : t("directionNotConfigured")}
              </dd>
            </div>
          </dl>

          {/* And say what that costs the reader, in words, rather than
              leaving them to infer it from a missing button. */}
          {v.included && (!v.configured.transcribe || !v.configured.speak) ? (
            <p className="rounded-xl border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs leading-relaxed text-amber-200">
              {!v.configured.speak && !v.configured.transcribe
                ? t("notConfigured")
                : !v.configured.speak
                  ? t("speakNotConfigured")
                  : t("transcribeNotConfigured")}
            </p>
          ) : null}

          {/* The privacy sentence belongs where somebody goes looking for
              it, not only in a dialog they saw once. */}
          <p className="text-[11px] leading-relaxed text-muted">{t("privacy")}</p>
        </>
      )}
    </div>
  );
}
