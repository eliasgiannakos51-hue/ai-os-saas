"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { Logo } from "@/components/logo";
import { GlobeMark } from "@/components/ui/globe-mark";

/** The three lines, in order. Their words are auth.splash in messages/*.json. */
const STEPS = ["loading", "syncing", "ready"] as const;
const STEP_MS = 380;

// Brief (~1.1s) transition shown after a successful login/signup, before the
// dashboard route takes over. Purely presentational — it doesn't touch auth
// state, it just delays the redirect by a beat so the handoff doesn't feel
// abrupt.
//
// IN THE READER'S LANGUAGE. The three lines were English literals, so a
// Greek sign-in passed through "Loading workspace..." on its way to the
// first task; scripts/tests/first-task-edges.prodtest.mjs collects every
// text the screen shows from the login page to the answer.
export function LoginSplash({ onDone }: { onDone: () => void }) {
  const t = useTranslations("auth.splash");
  const [step, setStep] = useState(0);
  // Literal keys, so the message slicer can bound what this screen needs.
  const lines: Record<(typeof STEPS)[number], string> = {
    loading: t("loading"),
    syncing: t("syncing"),
    ready: t("ready"),
  };

  useEffect(() => {
    if (step >= STEPS.length - 1) {
      const timer = setTimeout(onDone, STEP_MS);
      return () => clearTimeout(timer);
    }
    const timer = setTimeout(() => setStep((s) => s + 1), STEP_MS);
    return () => clearTimeout(timer);
  }, [step, onDone]);

  return (
    <div className="fixed inset-0 z-[100] flex flex-col items-center justify-center gap-4 bg-background">
      <Logo iconOnly px={40} />
      {/* 32px crosses the threshold where the interior bands stop being
          noise, so this is the full globe rather than the mark — the one
          place in the product where a person is looking at nothing else. */}
      <GlobeMark size={32} spin />
      <p className="text-sm text-muted transition-opacity duration-200" aria-live="polite">
        {lines[STEPS[step]]}
      </p>
    </div>
  );
}
