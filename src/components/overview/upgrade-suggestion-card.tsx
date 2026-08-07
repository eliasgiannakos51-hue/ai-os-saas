"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { ArrowUpRight, TrendingUp } from "lucide-react";
import {
  SUGGESTION_COOLDOWN_DAYS,
  SUGGESTION_STORAGE_KEY,
  type UpgradeSuggestion,
} from "@/lib/upgrade-suggestion";

/**
 * The 30-day personalised suggestion (V3 Task 9).
 *
 * The server has already decided whether there is anything worth saying
 * (lib/upgrade-suggestion.ts: thirty days old, a cap ≥80% used this
 * month, a next plan that actually raises it). This component adds only
 * the browser-side cooldown — same split as UpgradeMoment and for the
 * same reason: the decision is testable on the server, the politeness
 * state lives where clearing it costs one extra banner at worst.
 *
 * The copy names THEIR numbers — "9 of 10 research reports" — because a
 * personalised suggestion that does not show its evidence is
 * indistinguishable from the campaign banner it is trying not to be.
 */
export function UpgradeSuggestionCard({ suggestion }: { suggestion: UpgradeSuggestion }) {
  const t = useTranslations("upgradeSuggestion");
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (suggestion.kind !== "suggest") return;
    try {
      const last = window.localStorage.getItem(SUGGESTION_STORAGE_KEY);
      if (last) {
        const ms = new Date(last).getTime();
        if (
          !Number.isNaN(ms) &&
          Date.now() - ms < SUGGESTION_COOLDOWN_DAYS * 24 * 60 * 60 * 1000
        ) {
          return;
        }
      }
    } catch {
      // Storage throws in some private modes; failing open shows one
      // extra banner, failing closed silences a true statement forever.
    }
    setVisible(true);
    try {
      window.localStorage.setItem(SUGGESTION_STORAGE_KEY, new Date().toISOString());
    } catch {
      // Then the cooldown is not recorded. Acceptable for politeness.
    }
  }, [suggestion.kind]);

  if (suggestion.kind !== "suggest" || !visible) return null;

  const evidence = t("evidence", {
    used: suggestion.used,
    cap: suggestion.cap,
    resource: t(`resources.${suggestion.resource}`),
  });
  const pitch = Number.isFinite(suggestion.nextCap)
    ? t("pitch", { plan: suggestion.nextPlan, nextCap: suggestion.nextCap, resource: t(`resources.${suggestion.resource}`) })
    : t("pitchUnlimited", { plan: suggestion.nextPlan, resource: t(`resources.${suggestion.resource}`) });

  return (
    <section className="mt-6 flex flex-wrap items-center gap-3 rounded-2xl border border-border bg-panel/60 p-4">
      <TrendingUp className="h-4 w-4 shrink-0 text-orange-400" aria-hidden="true" />
      <p className="min-w-0 flex-1 text-xs leading-relaxed text-foreground/90">
        {evidence} {pitch}
      </p>
      <Link
        href="/pricing"
        className="inline-flex items-center gap-1 text-xs font-semibold text-orange-400 hover:underline"
      >
        {t("seePlans")}
        <ArrowUpRight className="h-3 w-3" aria-hidden="true" />
      </Link>
    </section>
  );
}
