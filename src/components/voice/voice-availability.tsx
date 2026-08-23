"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";

/**
 * IS VOICE AVAILABLE HERE, AT ALL, RIGHT NOW.
 *
 * Read ONCE per session and shared, because every mic button and every
 * "Listen" button in the app needs the same three answers and a fetch
 * per button is a fetch per button.
 *
 * WHAT `configured` MEANS AND WHY IT IS NOT AN IMPLEMENTATION DETAIL.
 * The two provider keys are optional to a deployment and mandatory to
 * the feature. A microphone that renders on a deployment without them is
 * a button that takes somebody's breath and gives back "something went
 * wrong" — so the buttons do not render at all, and the settings screen
 * says why.
 *
 * Fails to UNAVAILABLE. A voice control that renders because a status
 * call failed is the same broken promise one step later.
 */

export type VoiceAvailability = {
  loaded: boolean;
  transcribeAvailable: boolean;
  speakAvailable: boolean;
  /** False when the plan does not include voice at all, which is a
   *  different sentence from "you have used this month's minutes". */
  included: boolean;
  hasMinutes: boolean;
  limitMinutes: number;
  usedSeconds: number;
  remainingSeconds: number;
  creditsPerMinute: { transcribe: number; speak: number };
  refresh: () => void;
};

const EMPTY: Omit<VoiceAvailability, "refresh"> = {
  loaded: false,
  transcribeAvailable: false,
  speakAvailable: false,
  included: false,
  hasMinutes: false,
  limitMinutes: 0,
  usedSeconds: 0,
  remainingSeconds: 0,
  creditsPerMinute: { transcribe: 0, speak: 0 },
};

const VoiceAvailabilityContext = createContext<VoiceAvailability | null>(null);

export function VoiceAvailabilityProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState(EMPTY);
  const [nonce, setNonce] = useState(0);

  const refresh = useCallback(() => setNonce((n) => n + 1), []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const response = await fetch("/api/voice/usage");
        const data = await response.json();
        if (cancelled) return;
        if (!data.ok) {
          setState({ ...EMPTY, loaded: true });
          return;
        }
        const included = data.included === true;
        const remainingSeconds = Number(data.remainingSeconds ?? 0);
        setState({
          loaded: true,
          // BOTH HALVES MUST BE TRUE. A configured provider on a plan
          // that does not include voice is still not a microphone
          // somebody can use.
          transcribeAvailable: data.configured?.transcribe === true && included,
          speakAvailable: data.configured?.speak === true && included,
          included,
          hasMinutes: included && remainingSeconds > 0,
          limitMinutes: Number(data.limitMinutes ?? 0),
          usedSeconds: Number(data.usedSeconds ?? 0),
          remainingSeconds,
          creditsPerMinute: {
            transcribe: Number(data.creditsPerMinute?.transcribe ?? 0),
            speak: Number(data.creditsPerMinute?.speak ?? 0),
          },
        });
      } catch {
        if (!cancelled) setState({ ...EMPTY, loaded: true });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [nonce]);

  const value = useMemo<VoiceAvailability>(() => ({ ...state, refresh }), [state, refresh]);

  return (
    <VoiceAvailabilityContext.Provider value={value}>{children}</VoiceAvailabilityContext.Provider>
  );
}

/**
 * Outside the provider this returns the UNAVAILABLE shape rather than
 * throwing. A voice control is an enhancement, and a page that renders
 * one without the provider should lose the button — not crash.
 */
export function useVoiceAvailability(): VoiceAvailability {
  const ctx = useContext(VoiceAvailabilityContext);
  const noop = useCallback(() => {}, []);
  return ctx ?? { ...EMPTY, loaded: true, refresh: noop };
}
