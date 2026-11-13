"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Captions, CaptionsOff, Mic, MicOff, X } from "lucide-react";
import { useCredits } from "@/components/credits/credits-context";
import { useAudioLevel, type AudioLevelSource } from "@/components/voice/use-audio-level";
import { VoiceOrb } from "@/components/voice/voice-orb";
import { useVoiceAvailability } from "@/components/voice/voice-availability";
import { useVoiceErrorText } from "@/components/voice/use-voice-error-text";
import { AUDIO_CONSTRAINTS } from "@/lib/voice/voice-config";
import { LIVE_TICK_LEAD_SECONDS, type LiveTurn } from "@/lib/voice/live-pricing";
import {
  applyLiveEvent,
  EMPTY_LIVE_MODEL,
  liveSubtitles,
  liveTurns,
  msUntilTick,
  type LiveModel,
} from "@/lib/voice/live-events";
import type { VoiceState } from "@/lib/voice/voice-visual";

type Phase = "ready" | "connecting" | "live" | "ended";

/**
 * THE LIVE CONVERSATION (FS1, the owner's «33. ΦΩΝΗΤΙΚΗ ΣΥΝΟΜΙΛΙΑ ΜΕ ΤΗ
 * ΓΗ ΤΟΥ IONEXA») — behind the switch "voice-live".
 *
 * THE SCREEN IS THE GLOBE AND THREE BUTTONS: mute, subtitles, close.
 * Before the call there is one more thing on it, because it has to be:
 * the price of a minute, and the press that accepts it.
 *
 * ONE CALL, NOT A LOOP. The browser opens a WebRTC call whose offer goes
 * through api/voice/live/start — the server adds the key, the settings
 * and the instructions and returns the provider's answer — and from then
 * on sound travels browser to provider directly. There is no press to
 * talk: the provider hears a turn end and answers, and a voice over its
 * answer stops it. What this component does during the call is three
 * things: turn the provider's events into the globe's state and the
 * words (lib/voice/live-events.ts), ask for the next minute before the
 * paid one runs out (api/voice/live/tick), and end it.
 *
 * WHEN IT CLOSES, THE CONVERSATION IS TEXT IN THE THREAD. Every line the
 * provider transcribed is handed to api/voice/live/end, which writes
 * them to chat_messages, and to the surface that opened this, which
 * shows them at once. No sound is kept by anyone.
 *
 * NOT MEASURED HERE: time to first answer and time to stop when
 * interrupted (the directive's 800ms and 300ms). Both are the provider's
 * and the network's, and no build of this without a real key and a real
 * microphone can measure them — docs/QUEUE.md FS1 says so.
 */
export function VoiceLive({
  onClose,
  onKept,
  conversationId,
}: {
  onClose: () => void;
  /** The conversation as text, and the thread it was written to. */
  onKept?: (result: { turns: LiveTurn[]; conversationId: string | null }) => void;
  conversationId?: string | null;
}) {
  const t = useTranslations("voice");
  const locale = useLocale();
  const { refresh: refreshCredits } = useCredits();
  const availability = useVoiceAvailability();
  const voiceError = useVoiceErrorText();

  const [phase, setPhase] = useState<Phase>("ready");
  const [model, setModel] = useState<LiveModel>(EMPTY_LIVE_MODEL);
  const [muted, setMuted] = useState(false);
  const [subtitles, setSubtitles] = useState(true);
  const [notice, setNotice] = useState<string | null>(null);
  const [levelSource, setLevelSource] = useState<AudioLevelSource>({ kind: "none" });
  const level = useAudioLevel(levelSource);

  const modelRef = useRef<LiveModel>(EMPTY_LIVE_MODEL);
  const pcRef = useRef<RTCPeerConnection | null>(null);
  const micRef = useRef<MediaStream | null>(null);
  const remoteRef = useRef<MediaStream | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const sessionRef = useRef<string | null>(null);
  const tickTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const finishedRef = useRef(false);
  // Set when the person closes the screen while the call is still being
  // opened: start() reads it when its request returns and ends whatever
  // that request opened.
  const cancelledRef = useRef(false);
  // THE LATEST OF WHAT THE PARENT PASSED, READ AT THE MOMENT IT IS
  // NEEDED. finish() below must keep one identity for the life of the
  // screen: the effect that ends the call when the page goes away runs
  // its cleanup whenever its dependency changes, and a parent that
  // re-renders (a new inline onKept every time) would otherwise end the
  // call mid-sentence.
  const latest = useRef({ onKept, conversationId, refreshCredits, refreshAvailability: availability.refresh });
  latest.current = { onKept, conversationId, refreshCredits, refreshAvailability: availability.refresh };

  const state: VoiceState = phase === "live" ? model.state : phase === "connecting" ? "thinking" : "idle";

  // THE GLOBE BREATHES WITH WHOEVER IS SPEAKING: the microphone while it
  // listens, the answer while it speaks.
  useEffect(() => {
    if (phase !== "live") {
      setLevelSource({ kind: "none" });
      return;
    }
    if (model.state === "speaking" && remoteRef.current) setLevelSource({ kind: "stream", stream: remoteRef.current });
    else if (model.state === "listening" && micRef.current && !muted) setLevelSource({ kind: "stream", stream: micRef.current });
    else setLevelSource({ kind: "none" });
  }, [phase, model.state, muted]);

  const teardown = useCallback(() => {
    if (tickTimerRef.current) clearTimeout(tickTimerRef.current);
    tickTimerRef.current = null;
    try {
      pcRef.current?.close();
    } catch {
      /* already closed */
    }
    pcRef.current = null;
    micRef.current?.getTracks().forEach((track) => track.stop());
    micRef.current = null;
    remoteRef.current = null;
    const audio = audioRef.current;
    if (audio) {
      audio.pause();
      audio.srcObject = null;
    }
  }, []);

  /** End the call and keep its words. Runs once however it is reached:
   *  the close button, a minute refused, the cap, or the page going away. */
  const finish = useCallback(
    async (options: { beacon?: boolean } = {}) => {
      if (finishedRef.current) return;
      finishedRef.current = true;
      const sessionId = sessionRef.current;
      const turns = liveTurns(modelRef.current);
      teardown();
      if (!sessionId) return;
      const payload = JSON.stringify({ sessionId, turns });
      if (options.beacon) {
        // The page is going away: the request has to outlive it.
        void fetch("/api/voice/live/end", { method: "POST", headers: { "Content-Type": "application/json" }, body: payload, keepalive: true }).catch(() => {});
        return;
      }
      let keptIn: string | null = latest.current.conversationId ?? null;
      try {
        const response = await fetch("/api/voice/live/end", { method: "POST", headers: { "Content-Type": "application/json" }, body: payload });
        const data = await response.json().catch(() => null);
        if (data?.ok && typeof data.conversationId === "string") keptIn = data.conversationId;
      } catch {
        /* the words are still handed to the thread below */
      }
      latest.current.refreshCredits();
      latest.current.refreshAvailability();
      latest.current.onKept?.({ turns, conversationId: keptIn });
    },
    [teardown]
  );

  const scheduleTick = useCallback(
    (paidUntil: string) => {
      if (tickTimerRef.current) clearTimeout(tickTimerRef.current);
      tickTimerRef.current = setTimeout(async () => {
        const sessionId = sessionRef.current;
        if (!sessionId || finishedRef.current) return;
        try {
          const response = await fetch("/api/voice/live/tick", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ sessionId }),
          });
          const data = await response.json().catch(() => null);
          if (finishedRef.current) return;
          if (data?.ok && typeof data.paidUntil === "string") {
            latest.current.refreshCredits();
            scheduleTick(data.paidUntil);
            return;
          }
          // THE CALL IS OVER, AND THE SCREEN SAYS WHY. The server has
          // already hung up; what was said is kept exactly as if the
          // person had closed it.
          setNotice(data?.reason === "cap" || data?.code === "cap" ? t("live.endedCap") : voiceError(data));
          setPhase("ended");
          await finish();
        } catch {
          // One failed request is not a reason to end a conversation: the
          // server's grace covers it, and this asks again in a moment.
          if (!finishedRef.current) scheduleTick(new Date(Date.now() + (LIVE_TICK_LEAD_SECONDS + 5) * 1000).toISOString());
        }
      }, msUntilTick(paidUntil, Date.now(), LIVE_TICK_LEAD_SECONDS));
    },
    [finish, t, voiceError]
  );

  async function start() {
    if (phase !== "ready") return;
    setNotice(null);
    setPhase("connecting");
    try {
      const mic = await navigator.mediaDevices.getUserMedia({ audio: AUDIO_CONSTRAINTS });
      micRef.current = mic;
      const pc = new RTCPeerConnection();
      pcRef.current = pc;
      pc.ontrack = (event) => {
        const [remote] = event.streams;
        if (!remote) return;
        remoteRef.current = remote;
        const audio = audioRef.current;
        if (audio) {
          audio.srcObject = remote;
          void audio.play().catch(() => {});
        }
      };
      mic.getAudioTracks().forEach((track) => pc.addTrack(track, mic));
      const channel = pc.createDataChannel("oai-events");
      channel.onmessage = (message) => {
        let event: unknown = null;
        try {
          event = JSON.parse(String(message.data));
        } catch {
          return;
        }
        const next = applyLiveEvent(modelRef.current, event);
        if (next !== modelRef.current) {
          modelRef.current = next;
          setModel(next);
        }
      };
      pc.onconnectionstatechange = () => {
        if ((pc.connectionState === "failed" || pc.connectionState === "closed") && !finishedRef.current) {
          setNotice(t("errors.failed"));
          setPhase("ended");
          void finish();
        }
      };

      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      const response = await fetch("/api/voice/live/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sdp: offer.sdp, conversationId: conversationId ?? null, locale }),
      });
      const data = await response.json().catch(() => null);
      if (!data?.ok || typeof data.sdp !== "string") {
        teardown();
        setNotice(voiceError(data));
        setPhase("ready");
        return;
      }
      sessionRef.current = String(data.sessionId);
      if (cancelledRef.current) {
        // Closed while the call was being opened: end what was opened.
        await finish({ beacon: true });
        return;
      }
      await pc.setRemoteDescription({ type: "answer", sdp: data.sdp });
      latest.current.refreshCredits();
      setPhase("live");
      scheduleTick(String(data.paidUntil));
    } catch (err) {
      teardown();
      const denied = err instanceof DOMException && (err.name === "NotAllowedError" || err.name === "SecurityError");
      setNotice(t(denied ? "errors.denied" : "errors.failed"));
      setPhase("ready");
      // A call the server opened but the browser could not finish
      // connecting is ended here rather than left to the sweep. Not
      // through finish(): this screen stays open for another try.
      const opened = sessionRef.current;
      sessionRef.current = null;
      if (opened) {
        void fetch("/api/voice/live/end", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ sessionId: opened, turns: [] }),
          keepalive: true,
        }).catch(() => {});
      }
    }
  }

  // The page going away ends the call. Without this a closed tab would
  // leave it open until the sweep found it.
  useEffect(() => {
    const onHide = () => void finish({ beacon: true });
    window.addEventListener("pagehide", onHide);
    return () => {
      window.removeEventListener("pagehide", onHide);
      void finish({ beacon: true });
    };
  }, [finish]);

  function toggleMute() {
    const nextMuted = !muted;
    micRef.current?.getAudioTracks().forEach((track) => {
      track.enabled = !nextMuted;
    });
    setMuted(nextMuted);
  }

  async function close() {
    if (phase === "connecting" && !sessionRef.current) {
      cancelledRef.current = true;
      teardown();
      onClose();
      return;
    }
    await finish();
    onClose();
  }

  const lines = liveSubtitles(model);
  const live = availability.live;

  return (
    <div
      data-testid="voice-live"
      data-phase={phase}
      data-state={state}
      className="fixed inset-0 z-[70] flex flex-col items-center bg-background"
    >
      {/* The answer's sound. Not shown: the globe is what speaks. */}
      <audio ref={audioRef} autoPlay playsInline className="hidden" />

      <div className="flex flex-1 flex-col items-center justify-center gap-6 px-6">
        <VoiceOrb state={state} readLevel={level.readLevel} size={240} variant="globe" />

        {phase === "ready" || phase === "connecting" ? (
          <div className="flex flex-col items-center gap-3">
            <p data-testid="voice-live-price" className="text-center text-xs text-muted">
              {t("live.price", { credits: live.creditsPerMinute, minutes: live.maxMinutes })}
            </p>
            <button
              type="button"
              onClick={() => void start()}
              disabled={phase === "connecting"}
              data-testid="voice-live-start"
              className="flex min-h-11 items-center gap-2 rounded-item bg-button px-5 py-2 text-sm font-semibold text-button-ink disabled:opacity-60"
            >
              <Mic className="h-4 w-4" aria-hidden="true" />
              {phase === "connecting" ? t("live.connecting") : t("live.start")}
            </button>
          </div>
        ) : (
          <p className="text-sm font-medium text-foreground">{phase === "ended" ? t("live.ended") : t(`states.${state}`)}</p>
        )}

        {notice && (
          <p role="alert" data-testid="voice-live-notice" className="max-w-sm text-center text-xs text-muted">
            {notice}
          </p>
        )}

        {subtitles && phase !== "ready" && (lines.user || lines.assistant) && (
          <div data-testid="voice-live-subtitles" aria-live="polite" className="max-w-md space-y-1 text-center">
            {lines.user && <p className="text-xs text-muted">{lines.user}</p>}
            {lines.assistant && <p className="text-sm leading-relaxed text-foreground">{lines.assistant}</p>}
          </div>
        )}
      </div>

      <div className="flex items-center gap-3 pb-[max(1.5rem,env(safe-area-inset-bottom))]">
        <button
          type="button"
          onClick={toggleMute}
          disabled={phase !== "live"}
          aria-pressed={muted}
          aria-label={muted ? t("live.unmute") : t("live.mute")}
          title={muted ? t("live.unmute") : t("live.mute")}
          data-testid="voice-live-mute"
          className="flex h-12 w-12 items-center justify-center rounded-full border border-border text-foreground transition-colors hover:bg-panel-hover disabled:opacity-40"
        >
          {muted ? <MicOff className="h-5 w-5" aria-hidden="true" /> : <Mic className="h-5 w-5" aria-hidden="true" />}
        </button>
        <button
          type="button"
          onClick={() => setSubtitles((on) => !on)}
          aria-pressed={subtitles}
          aria-label={subtitles ? t("live.subtitlesOff") : t("live.subtitlesOn")}
          title={subtitles ? t("live.subtitlesOff") : t("live.subtitlesOn")}
          data-testid="voice-live-subtitles-toggle"
          className="flex h-12 w-12 items-center justify-center rounded-full border border-border text-foreground transition-colors hover:bg-panel-hover"
        >
          {subtitles ? <Captions className="h-5 w-5" aria-hidden="true" /> : <CaptionsOff className="h-5 w-5" aria-hidden="true" />}
        </button>
        <button
          type="button"
          onClick={() => void close()}
          aria-label={t("live.close")}
          title={t("live.close")}
          data-testid="voice-live-close"
          className="flex h-12 w-12 items-center justify-center rounded-full border border-border text-foreground transition-colors hover:bg-panel-hover"
        >
          <X className="h-5 w-5" aria-hidden="true" />
        </button>
      </div>
    </div>
  );
}
