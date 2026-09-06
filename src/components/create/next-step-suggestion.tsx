"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowRight, X } from "lucide-react";
import { useTranslations } from "next-intl";
import { getNextStepSuggestion, slugFromHref } from "@/lib/next-step-suggestions";

// Discrete, dismissible nudge shown under a successful "matched" Create
// Anything result — a plain lookup (lib/next-step-suggestions.ts), not an
// AI call. Resets naturally per result since the parent only ever renders
// one instance per turn (keyed by turn id in assistant-chat.tsx, replaced
// wholesale on each new submission in create-chat.tsx).
export function NextStepSuggestion({ sourceHref }: { sourceHref: string }) {
  const t = useTranslations("common");
  // THE MESSAGE IS A KEY NOW, NOT A SENTENCE. This component used to
  // render `{suggestion.message}` — thirteen English questions, shown to
  // every user in all ten languages, invisible to every gate because the
  // strings lived in a `.ts` data file. See lib/next-step-suggestions.ts
  // for why nothing caught it and what stops it now. `useTranslations()`
  // with no namespace takes a full dotted key.
  const tRoot = useTranslations();
  const [dismissed, setDismissed] = useState(false);
  const suggestion = getNextStepSuggestion(slugFromHref(sourceHref));

  if (!suggestion || dismissed) return null;

  return (
    <div className="mt-2 flex items-center justify-between gap-2 rounded-xl border border-border bg-background/40 px-3 py-2 text-xs text-muted transition-colors duration-150">
      <Link
        href={suggestion.href}
        className="flex min-w-0 items-center gap-1.5 transition-colors duration-150 hover:text-orange-400"
      >
        <span className="truncate">{tRoot(suggestion.messageKey)}</span>
        <ArrowRight className="h-3 w-3 shrink-0" aria-hidden="true" />
      </Link>
      <button
        type="button"
        onClick={() => setDismissed(true)}
        aria-label={t("dismissSuggestion")}
        className="shrink-0 rounded p-1 text-muted transition-colors duration-150 hover:text-foreground"
      >
        <X className="h-3.5 w-3.5" aria-hidden="true" />
      </button>
    </div>
  );
}
