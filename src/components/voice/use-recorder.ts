"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  AUDIO_CONSTRAINTS,
  PREFERRED_MIME_TYPES,
  SILENCE,
  frameRms,
  turnShouldEnd,
} from "@/lib/voice/voice-config";
import { MAX_CLIP_SECONDS } from "@/lib/voice/voice-pricing";

/**
 * THE MICROPHONE.
 *
 * NOTHING HERE STARTS ON ITS OWN. `start()` is only ever called from a
 * press — there is no autoplay path, no "listening for a wake word", no
 * effect that opens a stream when a component mounts. That is the
 * brief's "ΠΟΤΕ αυτόματη εγγραφή", and the strongest form of it is a
 * hook whose only entry point is a function somebody has to call.
 *
 * THE STREAM IS RELEASED THE MOMENT RECORDING STOPS. Every track gets
 * stop() — not just the recorder. A MediaRecorder that has stopped while
 * its tracks stay live leaves the browser's recording indicator on, and
 * a user looking at that dot has every right to believe they are still
 * being recorded.
 */

export type RecorderState = "idle" | "requesting" | "recording" | "stopping" | "denied" | "unsupported";

export type RecordingResult = { blob: Blob; seconds: number; mimeType: string };

function pickMimeType(): string | undefined {
  if (typeof MediaRecorder === "undefined") return undefined;
  for (const type of PREFERRED_MIME_TYPES) {
    if (MediaRecorder.isTypeSupported?.(type)) return type;
  }
  // Undefined lets the browser choose its own default, which is what
  // Safari needs — a hard-coded WebM there means the feature does not
  // exist on the platform where a microphone is most likely the input
  // somebody actually wants.
  return undefined;
}

export function useRecorder(options?: {
  /** Ends the turn on silence. Used by the conversation loop (#2) and
   *  NOT by the plain mic button, where the user presses to stop and a
   *  recorder that decides for them mid-sentence is worse than one that
   *  waits. */
  autoStopOnSilence?: boolean;
  onResult?: (result: RecordingResult) => void;
  onError?: (reason: "denied" | "unsupported" | "no_speech" | "failed") => void;
}) {
  const [state, setState] = useState<RecorderState>("idle");
  const [stream, setStream] = useState<MediaStream | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const startedAtRef = useRef(0);
  const stopTimerRef = useRef<number | null>(null);
  const silenceRafRef = useRef<number | null>(null);
  // The options object is a new literal on every render; a ref keeps the
  // effects below from tearing down a live recording because the parent
  // re-rendered.
  const optionsRef = useRef(options);
  optionsRef.current = options;

  const releaseStream = useCallback((toRelease: MediaStream | null) => {
    for (const track of toRelease?.getTracks() ?? []) {
      try {
        track.stop();
      } catch {
        // Already ended.
      }
    }
  }, []);

  const cleanup = useCallback(() => {
    if (stopTimerRef.current !== null) window.clearTimeout(stopTimerRef.current);
    stopTimerRef.current = null;
    if (silenceRafRef.current !== null) cancelAnimationFrame(silenceRafRef.current);
    silenceRafRef.current = null;
  }, []);

  const stop = useCallback(() => {
    cleanup();
    const recorder = recorderRef.current;
    if (recorder && recorder.state !== "inactive") {
      setState("stopping");
      try {
        recorder.stop();
      } catch {
        setState("idle");
      }
    } else {
      setState("idle");
    }
  }, [cleanup]);

  const start = useCallback(async () => {
    if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") {
      setState("unsupported");
      optionsRef.current?.onError?.("unsupported");
      return;
    }
    setState("requesting");
    let media: MediaStream;
    try {
      // THE PERMISSION PROMPT HAPPENS HERE, and only here, and only
      // because somebody pressed something. The explanation the user
      // reads BEFORE this is in components/voice/voice-input.tsx — a
      // browser prompt with no context is the one people deny.
      media = await navigator.mediaDevices.getUserMedia({ audio: AUDIO_CONSTRAINTS });
    } catch {
      setState("denied");
      optionsRef.current?.onError?.("denied");
      return;
    }

    setStream(media);
    chunksRef.current = [];
    const mimeType = pickMimeType();
    let recorder: MediaRecorder;
    try {
      recorder = new MediaRecorder(media, mimeType ? { mimeType, audioBitsPerSecond: 32_000 } : undefined);
    } catch {
      releaseStream(media);
      setStream(null);
      setState("unsupported");
      optionsRef.current?.onError?.("unsupported");
      return;
    }
    recorderRef.current = recorder;
    startedAtRef.current = performance.now();

    recorder.ondataavailable = (event) => {
      if (event.data && event.data.size > 0) chunksRef.current.push(event.data);
    };
    recorder.onstop = () => {
      cleanup();
      const seconds = Math.max(1, Math.round((performance.now() - startedAtRef.current) / 1000));
      const blob = new Blob(chunksRef.current, { type: recorder.mimeType || mimeType || "audio/webm" });
      chunksRef.current = [];
      // RELEASED BEFORE THE CALLBACK, so the browser's recording
      // indicator goes out at the same moment the UI says it stopped —
      // not after whatever the callback does with the audio.
      releaseStream(media);
      setStream(null);
      recorderRef.current = null;
      setState("idle");
      if (blob.size === 0) {
        optionsRef.current?.onError?.("no_speech");
        return;
      }
      optionsRef.current?.onResult?.({ blob, seconds, mimeType: blob.type });
    };
    recorder.onerror = () => {
      cleanup();
      releaseStream(media);
      setStream(null);
      recorderRef.current = null;
      setState("idle");
      optionsRef.current?.onError?.("failed");
    };

    recorder.start(250);
    setState("recording");

    // THE HARD CEILING. Not a cost control — the per-plan minutes are
    // that — but a safety one: a tab whose stop never registered would
    // otherwise stream a room to a transcription API until the browser
    // was closed.
    stopTimerRef.current = window.setTimeout(() => stop(), MAX_CLIP_SECONDS * 1000);

    if (optionsRef.current?.autoStopOnSilence) {
      const Ctor =
        window.AudioContext ??
        (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Ctor) return;
      const context = new Ctor();
      const analyser = context.createAnalyser();
      analyser.fftSize = 512;
      context.createMediaStreamSource(media).connect(analyser);
      const buffer = new Uint8Array(new ArrayBuffer(analyser.fftSize));
      let quietSince: number | null = null;
      let heardSpeech = false;

      const watch = () => {
        analyser.getByteTimeDomainData(buffer);
        const now = performance.now();
        const level = frameRms(buffer);
        if (level >= SILENCE.rmsThreshold) {
          heardSpeech = true;
          quietSince = null;
        } else if (quietSince === null) {
          quietSince = now;
        }
        const decision = turnShouldEnd({
          elapsedMs: now - startedAtRef.current,
          quietMs: quietSince === null ? 0 : now - quietSince,
          heardSpeech,
        });
        if (decision.end) {
          void context.close().catch(() => {});
          stop();
          return;
        }
        silenceRafRef.current = requestAnimationFrame(watch);
      };
      silenceRafRef.current = requestAnimationFrame(watch);
    }
  }, [cleanup, releaseStream, stop]);

  // A component that unmounts mid-recording must not leave the
  // microphone open. This is the last line of that, after the explicit
  // stop paths above.
  useEffect(() => {
    return () => {
      cleanup();
      const recorder = recorderRef.current;
      if (recorder && recorder.state !== "inactive") {
        try {
          recorder.stop();
        } catch {
          // Already stopped.
        }
      }
      releaseStream(recorder?.stream ?? null);
    };
  }, [cleanup, releaseStream]);

  return { state, stream, start, stop, recording: state === "recording" };
}
