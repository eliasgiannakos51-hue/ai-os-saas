"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { frameRms } from "@/lib/voice/voice-config";
import { smoothAmplitude } from "@/lib/voice/voice-visual";

/**
 * THE AUDIO LEVEL, AS A NUMBER THE ORB CAN USE.
 *
 * One AnalyserNode, one requestAnimationFrame loop, one 0..1 value.
 *
 * WHY THE VALUE IS KEPT IN A REF AND NOT IN STATE. This updates sixty
 * times a second. A setState per frame is sixty React renders a second
 * of whatever subtree reads it — which on this app's dashboard is a page
 * of cards. The orb reads the ref inside its own frame loop and writes a
 * CSS custom property; React renders when the STATE changes (listening
 * to speaking), not when the amplitude does.
 *
 * That is the difference between this and the two performance disasters
 * this codebase already fixed (NetworkField, AuthBackground): those
 * animated inside a filtered full-viewport SVG on the main thread. This
 * writes two custom properties that feed a transform and an opacity, and
 * the compositor does the rest.
 */

export type AudioLevelSource =
  | { kind: "stream"; stream: MediaStream }
  | { kind: "element"; element: HTMLAudioElement }
  | { kind: "none" };

export function useAudioLevel(source: AudioLevelSource) {
  const levelRef = useRef(0);
  const rafRef = useRef<number | null>(null);
  const contextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  // Typed as Uint8Array<ArrayBuffer>, not the bare alias: TypeScript 5.7
  // made the element type generic over its backing buffer, and
  // getByteTimeDomainData will not accept one that could be backed by a
  // SharedArrayBuffer.
  const bufferRef = useRef<Uint8Array<ArrayBuffer> | null>(null);
  // A source node created from an <audio> element can only be created
  // ONCE per element per context — a second call throws. Kept so a
  // pause/play cycle reuses it instead of tearing the graph down.
  const elementSourceRef = useRef<MediaElementAudioSourceNode | null>(null);
  const [active, setActive] = useState(false);

  const readLevel = useCallback(() => levelRef.current, []);

  useEffect(() => {
    if (source.kind === "none") {
      levelRef.current = 0;
      setActive(false);
      return;
    }

    let cancelled = false;
    // The constructor is behind a vendor prefix on older Safari, and a
    // browser with neither simply gets no pulse — the orb still shows
    // its state colour, which is the part that carries the meaning.
    const Ctor =
      typeof window !== "undefined"
        ? window.AudioContext ??
          (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
        : undefined;
    if (!Ctor) return;

    const context = contextRef.current ?? new Ctor();
    contextRef.current = context;
    const analyser = context.createAnalyser();
    // 512 is the smallest window that still resolves a syllable. Larger
    // costs nothing visibly and smooths away the thing being shown.
    analyser.fftSize = 512;
    analyserRef.current = analyser;
    bufferRef.current = new Uint8Array(new ArrayBuffer(analyser.fftSize));

    try {
      if (source.kind === "stream") {
        context.createMediaStreamSource(source.stream).connect(analyser);
        // NOT connected to the destination. Routing a microphone to the
        // speakers is feedback, and it is the single most unpleasant
        // thing a voice feature can do to somebody wearing headphones.
      } else {
        const node =
          elementSourceRef.current ?? context.createMediaElementSource(source.element);
        elementSourceRef.current = node;
        node.connect(analyser);
        // Playback DOES go to the speakers — an element routed through a
        // graph that never reaches the destination is silent, and the
        // user pressed play.
        analyser.connect(context.destination);
      }
    } catch {
      // A graph that cannot be built means no pulse, never a crash: the
      // orb falls back to its state colour and the audio still plays.
      return;
    }

    setActive(true);
    // Browsers start a context suspended until a gesture. This one always
    // follows a press, so resume is safe and its rejection is ignorable.
    void context.resume().catch(() => {});

    const tick = () => {
      if (cancelled) return;
      const buffer = bufferRef.current;
      const node = analyserRef.current;
      if (buffer && node) {
        node.getByteTimeDomainData(buffer);
        // The raw RMS of speech sits around 0.05-0.2, so it is scaled to
        // fill the 0..1 the visual expects. x4, clamped: without it the
        // orb moves by a twentieth of its range and reads as broken.
        const raw = Math.min(1, frameRms(buffer) * 4);
        levelRef.current = smoothAmplitude(levelRef.current, raw);
      }
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);

    return () => {
      cancelled = true;
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
      try {
        analyser.disconnect();
      } catch {
        // Already torn down.
      }
      analyserRef.current = null;
      bufferRef.current = null;
      levelRef.current = 0;
      setActive(false);
    };
  }, [source]);

  // The context is closed only when the hook itself goes away, not on
  // every source change: a browser allows a small number of AudioContexts
  // per page, and a conversation that alternates listening and speaking
  // would exhaust them within a few turns.
  useEffect(() => {
    return () => {
      const context = contextRef.current;
      contextRef.current = null;
      elementSourceRef.current = null;
      if (context && context.state !== "closed") void context.close().catch(() => {});
    };
  }, []);

  return { readLevel, active };
}
