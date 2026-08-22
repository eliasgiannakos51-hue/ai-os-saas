"use client";

import { useTranslations } from "next-intl";
import { Sparkles, Wrench } from "lucide-react";

export type TemplateMatch = {
  slug: string;
  title: string;
  description: string;
  taskPattern: string;
  scheduleCron: string;
  depth: string;
  needsWebSearch: boolean;
  outputFormat: string;
  useCount: number;
  rank: number;
};

/**
 * "I FOUND ONE THAT ALREADY DOES THIS."
 *
 * Shown while the user is still typing their request, before anything is
 * built and before anything is charged — because after the builder has
 * run, offering a cheaper route is offering a refund.
 *
 * THREE RULES THIS COMPONENT EXISTS TO KEEP:
 *
 *   THE USER SEES THAT IT IS READY-MADE. It says so, it names the
 *   template, and it shows the task it will actually run with the slot
 *   still visible — because "we found one" is only useful if you can see
 *   what you are agreeing to.
 *
 *   BOTH PRICES, SIDE BY SIDE. A cheaper option whose price is not next
 *   to the expensive one's is a claim, not a comparison.
 *
 *   "BUILD A NEW ONE" IS ALWAYS THERE. It is rendered outside the
 *   `matches.length > 0` branch on purpose: no match, a bad match, or a
 *   perfect one, the button is in the same place and always enabled.
 */
export function TemplateMatches({
  matches,
  onUse,
  onBuildNew,
  templateCredits,
  buildNewLabel,
  busy,
}: {
  matches: TemplateMatch[];
  onUse: (match: TemplateMatch) => void;
  onBuildNew: () => void;
  /** What adopting costs — one small fill call. From the server. */
  templateCredits: number;
  /** THE WHOLE LABEL, from the parent — because it has to say
   *  "Designing..." while the builder is running, and `building` lives up
   *  there with the job row. Passing the number alone would leave the
   *  button reading "Build a new one — 3 credits" for the forty seconds
   *  it is already building one. */
  buildNewLabel: string;
  busy?: boolean;
}) {
  const t = useTranslations("dashboard.agents.templates");

  return (
    <div className="space-y-3">
      {matches.length > 0 && (
        <div className="space-y-2 rounded-xl border border-orange-500/25 bg-orange-500/[0.06] p-3">
          <p className="flex items-center gap-2 text-sm font-medium text-orange-300">
            <Sparkles className="h-4 w-4 shrink-0" aria-hidden="true" />
            {t("found", { count: matches.length })}
          </p>
          <ul className="space-y-2">
            {matches.map((match) => (
              <li key={match.slug} className="rounded-lg border border-border bg-panel p-3">
                <p className="text-sm font-medium text-foreground">{match.title}</p>
                <p className="mt-0.5 text-[11px] leading-relaxed text-muted">{match.description}</p>
                {/* THE ACTUAL TASK, with the slot still showing. */}
                <p className="mt-2 line-clamp-3 rounded bg-black/20 p-2 text-[11px] leading-relaxed text-muted">
                  {match.taskPattern}
                </p>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => onUse(match)}
                  className="mt-2 flex min-h-[44px] w-full items-center justify-center gap-2 rounded-lg bg-orange-500/90 px-3 text-sm font-medium text-white transition-colors hover:bg-orange-500 disabled:opacity-50"
                >
                  {t("use", { credits: templateCredits })}
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* ALWAYS RENDERED, ALWAYS ENABLED. Outside the branch above. */}
      <button
        type="button"
        disabled={busy}
        onClick={onBuildNew}
        className="flex min-h-[44px] w-full items-center justify-center gap-2 rounded-lg border border-border px-3 text-sm text-foreground transition-colors hover:bg-panel-hover disabled:opacity-50"
      >
        <Wrench className="h-4 w-4 shrink-0" aria-hidden="true" />
        {buildNewLabel}
      </button>
    </div>
  );
}
