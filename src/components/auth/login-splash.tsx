"use client";

import { useEffect, useState } from "react";
import { Logo } from "@/components/logo";
import { GlobeMark } from "@/components/ui/globe-mark";

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
    <div className="fixed inset-0 z-[100] flex flex-col items-center justify-center gap-4 bg-background">
      <Logo iconOnly className="h-10 w-10" />
      {/* 32px crosses the threshold where the interior bands stop being
          noise, so this is the full globe rather than the mark — the one
          place in the product where a person is looking at nothing else. */}
      <GlobeMark size={32} spin />
      <p className="text-sm text-muted transition-opacity duration-200" aria-live="polite">
        {MESSAGES[step]}
      </p>
    </div>
  );
}
