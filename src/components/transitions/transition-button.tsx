"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowRight, X } from "lucide-react";
import { useTranslations } from "next-intl";
import { detectTransition } from "@/lib/transitions/destinations";

/**
 * "GO TO THE CODE TOOL" BECOMES A BUTTON THAT GOES THERE.
 *
 * ONE BUTTON, NEVER TWO. lib/transitions/destinations.ts returns a single
 * destination or null; three buttons under an answer stop being a
 * suggestion and become a menu, which is what the sidebar was cut from 45
 * rows to 23 to avoid.
 *
 * IT NAVIGATES, IT DOES NOT ACT. That is the answer to "what if it picks
 * the wrong destination": the id comes from a closed list, the href comes
 * from that list rather than from any text, and pressing it opens a page
 * of this product. A wrong suggestion costs one click. Nothing here
 * creates, sends or spends.
 *
 * FREE. The detector is a fold and a regex — no model call, no latency,
 * no credits — so it can run on every finished answer without anyone
 * having to decide whether it is worth it.
 *
 * WHAT IS NOT MEASURED, and it is the honest gap: how often somebody
 * dismisses one. nav_events records the navigation if a button is TAKEN
 * (path + referrer, already), and there is no column anywhere for "shown
 * and refused". Until there is, "it suggests the wrong thing too often"
 * is an argument rather than a number, and this comment is the reason
 * that sentence is not in the closing report as a measurement.
 */
export function TransitionButton({ text }: { text: string }) {
  const t = useTranslations();
  const tCommon = useTranslations("common");
  const [dismissed, setDismissed] = useState(false);

  const destination = detectTransition(text);
  if (!destination || dismissed) return null;

  return (
    <div className="mt-2 flex items-center gap-2">
      <Link
        href={destination.href}
        className="flex min-h-[44px] items-center gap-1.5 rounded-xl border border-orange-500/30 px-3 text-xs font-medium text-orange-200 transition-colors duration-150 hover:border-orange-500/60 hover:bg-orange-500/10"
      >
        {t(destination.labelKey)}
        <ArrowRight className="h-3 w-3 shrink-0" aria-hidden="true" />
      </Link>
      <button
        type="button"
        onClick={() => setDismissed(true)}
        aria-label={tCommon("dismissSuggestion")}
        className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-muted transition-colors duration-150 hover:text-foreground"
      >
        <X className="h-3.5 w-3.5" aria-hidden="true" />
      </button>
    </div>
  );
}
