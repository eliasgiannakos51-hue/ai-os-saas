"use client";

import { useEffect, useRef } from "react";
import { useTranslations } from "next-intl";
import { GlobeMark } from "@/components/ui/globe-mark";
import { orbFrame, staticFrame, STATE_COLOR_VAR, type VoiceState } from "@/lib/voice/voice-visual";

/**
 * THE GLOBE THAT PULSES WITH THE SOUND (#23).
 *
 * The same globe as everywhere else in the product — GlobeMark, drawn
 * from lib/brand/globe.ts — at 180px, with a halo behind it.
 *
 * WHAT MOVES, AND NOTHING ELSE MOVES:
 *
 *   --orb-scale     -> transform: scale()   on the globe and the halo
 *   --orb-halo      -> opacity              on the halo
 *   --orb-rotate    -> transform: rotate()  on the halo ring
 *
 * Three custom properties, two compositor properties. No width, no
 * filter, no box-shadow, no background-position — every one of those
 * would take the animation off the compositor and onto the main thread,
 * which is exactly how this codebase's old full-viewport backdrop
 * reached 120ms of keystroke latency.
 *
 * THE VALUES ARE WRITTEN FROM A FRAME LOOP, NOT FROM STATE. Sixty
 * setStates a second would re-render this subtree sixty times a second
 * to change two numbers. `style.setProperty` on a ref does not involve
 * React at all — React re-renders when the STATE changes (listening to
 * thinking), which is a handful of times per conversation.
 *
 * REDUCED MOTION GETS THE SAME GLOBE, STILL. Not a hidden one and not a
 * different component: somebody who asked for less motion still has to
 * know whether the microphone is open, so the colour and the label stay
 * and only the movement goes.
 */
export function VoiceOrb({
  state,
  readLevel,
  size = 180,
}: {
  state: VoiceState;
  /** Reads the current 0..1 amplitude. A function rather than a value,
   *  so the parent is not re-rendering sixty times a second to pass one
   *  down — see components/voice/use-audio-level.ts. */
  readLevel: () => number;
  size?: number;
}) {
  const t = useTranslations("voice.states");
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const rafRef = useRef<number | null>(null);
  const startedRef = useRef<number>(0);

  useEffect(() => {
    const node = wrapRef.current;
    if (!node) return;

    // BOTH SWITCHES, matching globals.css: the explicit data-motion
    // toggle a user set inside the product, and the OS-level media
    // query. Checking only the media query would ignore somebody who
    // turned motion off here, which is the one this product controls.
    const prefersReduced =
      document.documentElement.dataset.motion === "reduce" ||
      (document.documentElement.dataset.motion !== "full" &&
        window.matchMedia?.("(prefers-reduced-motion: reduce)").matches === true);

    const write = (frame: { scale: number; halo: number; rotation: number }) => {
      node.style.setProperty("--orb-scale", frame.scale.toFixed(4));
      node.style.setProperty("--orb-halo", frame.halo.toFixed(4));
      node.style.setProperty("--orb-rotate", `${frame.rotation.toFixed(2)}deg`);
    };

    if (prefersReduced) {
      write(staticFrame(state));
      return;
    }

    startedRef.current = performance.now();
    const tick = (now: number) => {
      write(orbFrame(state, readLevel(), now - startedRef.current));
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);

    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    };
  }, [state, readLevel]);

  return (
    <div
      ref={wrapRef}
      className="voice-orb relative flex items-center justify-center"
      style={
        {
          width: size,
          height: size,
          // The colour is a variable per state, resolved in globals.css
          // so it has a light and a dark definition.
          "--orb-color": `var(${STATE_COLOR_VAR[state]})`,
        } as React.CSSProperties
      }
      // ONE LIVE REGION FOR THE WHOLE ORB. A screen reader gets the state
      // in words; it must not also get the globe's own title, or every
      // change is announced twice.
      role="status"
      aria-live="polite"
      aria-label={t(state)}
    >
      <span className="voice-orb-halo" aria-hidden="true" />
      <span className="voice-orb-ring" aria-hidden="true" />
      <span className="voice-orb-globe">
        <GlobeMark size={Math.round(size * 0.44)} detail="full" />
      </span>
    </div>
  );
}
