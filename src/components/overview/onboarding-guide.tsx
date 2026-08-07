"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { Check, Compass, X } from "lucide-react";
import type { OnboardingGuide } from "@/lib/onboarding";

export const ONBOARDING_DISMISSED_KEY = "ionexa_onboarding_dismissed";

/**
 * The guided start, for the first fortnight only.
 *
 * The server has already decided WHETHER there is anything to show (see
 * lib/onboarding.ts — earned from real rows, expires by itself, never
 * points at a locked feature). This component's only additional job is
 * the dismissal, which lives in the browser and therefore cannot be read
 * during render without a hydration mismatch — hence the effect.
 *
 * It renders as a quiet panel on the overview, not a modal and not a
 * tour. Nobody has ever wanted a tour. What a new user actually needs is
 * a short list of things worth doing first that they can ignore, come
 * back to, or finish out of order — and which visibly knows what they
 * have already done.
 */
export function OnboardingGuideCard({ guide }: { guide: OnboardingGuide }) {
  const t = useTranslations("onboarding");
  // Starts hidden and is revealed by the effect. The alternative —
  // rendering it and hiding it if dismissed — flashes the card at every
  // user who already closed it, on every page load.
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (guide.kind !== "guide") return;
    try {
      if (window.localStorage.getItem(ONBOARDING_DISMISSED_KEY) === "1") return;
    } catch {
      // Storage throws in some private modes. Failing OPEN shows the
      // guide to somebody who dismissed it, which is a smaller harm than
      // hiding it from every private-mode user in their first week.
    }
    setVisible(true);
  }, [guide.kind]);

  if (guide.kind !== "guide" || !visible) return null;

  const dismiss = () => {
    setVisible(false);
    try {
      window.localStorage.setItem(ONBOARDING_DISMISSED_KEY, "1");
    } catch {
      // Then it comes back next load. Acceptable; it expires on its own.
    }
  };

  return (
    <section className="mt-6 rounded-2xl border border-border bg-panel/60 p-4">
      <div className="mb-3 flex items-start gap-2">
        <h2 className="flex flex-1 items-center gap-2 text-xs font-medium text-muted">
          <Compass className="h-4 w-4" aria-hidden="true" />
          {t("title")}
        </h2>
        <span className="text-[11px] tabular-nums text-muted">
          {t("progress", { done: guide.completed, total: guide.steps.length })}
        </span>
        <button
          type="button"
          onClick={dismiss}
          aria-label={t("dismiss")}
          className="-mt-0.5 rounded p-1 text-muted transition-colors hover:text-foreground"
        >
          <X className="h-3.5 w-3.5" aria-hidden="true" />
        </button>
      </div>

      <ol className="space-y-1.5">
        {guide.steps.map((step) => {
          const isNext = guide.next?.id === step.id;
          return (
            <li key={step.id}>
              <Link
                href={step.href}
                className={`flex items-start gap-2.5 rounded-xl border p-2.5 transition-colors ${
                  isNext
                    ? "border-orange-500/30 bg-orange-500/[0.06] hover:border-orange-500/50"
                    : "border-transparent hover:border-border hover:bg-panel"
                }`}
              >
                <span
                  aria-hidden="true"
                  className={`mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full border ${
                    step.done ? "border-emerald-500/50 bg-emerald-500/20" : "border-border"
                  }`}
                >
                  {step.done ? <Check className="h-2.5 w-2.5 text-emerald-400" /> : null}
                </span>
                <span className="min-w-0 flex-1">
                  <span
                    className={`block text-xs font-medium ${
                      step.done ? "text-muted line-through" : "text-foreground"
                    }`}
                  >
                    {t(`steps.${step.id}.title`)}
                  </span>
                  {/* The explanation is only worth the line for the step
                      they are on. Five paragraphs of why is a wall. */}
                  {isNext ? (
                    <span className="mt-0.5 block text-[11px] leading-relaxed text-muted">
                      {t(`steps.${step.id}.body`)}
                    </span>
                  ) : null}
                </span>
              </Link>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
