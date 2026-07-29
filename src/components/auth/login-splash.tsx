"use client";

import { useEffect, useState } from "react";

const MESSAGES = ["Loading workspace...", "Syncing data...", "Ready."];
const STEP_MS = 380;

// Brief (~1.1s) transition shown after a successful login/signup, before the
// dashboard route takes over. Purely presentational — it doesn't touch auth
// state, it just delays the redirect by a beat so the handoff doesn't feel
// abrupt.
export function LoginSplash({ onDone }: { onDone: () => void }) {
  const [step, setStep] = useState(0);

  useEffect(() => {
    if (step >= MESSAGES.length - 1) {
      const timer = setTimeout(onDone, STEP_MS);
      return () => clearTimeout(timer);
    }
    const timer = setTimeout(() => setStep((s) => s + 1), STEP_MS);
    return () => clearTimeout(timer);
  }, [step, onDone]);

  return (
    <div className="fixed inset-0 z-[100] flex flex-col items-center justify-center gap-4 bg-background font-mono">
      <p className="text-sm tracking-widest text-amber-500">Nexa AI //</p>
      <div
        className="h-8 w-8 animate-spin rounded-full border-2 border-amber-500/25 border-t-amber-500"
        aria-hidden="true"
      />
      <p className="text-sm text-muted transition-opacity duration-200" aria-live="polite">
        {MESSAGES[step]}
      </p>
    </div>
  );
}
