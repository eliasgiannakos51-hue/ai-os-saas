"use client";

import { useLocale, useTranslations } from "next-intl";
import { Zap, Layers, Telescope, type LucideIcon } from "lucide-react";
import { formatNumber } from "@/lib/format-number";
import { AGENT_DEPTHS, type AgentDepth } from "@/lib/agents/agent-depth";

export type DepthFact = {
  model: string;
  steps: number;
  sources: number;
  seconds: [number, number];
  credits: number;
};
export type DepthFacts = Record<string, DepthFact>;

const ICONS: Record<AgentDepth, LucideIcon> = {
  simple: Zap,
  standard: Layers,
  deep: Telescope,
};

/**
 * THE PRICE IS NOT OPTIONAL, and that is why it is a required prop.
 *
 * A picker whose options differ twelvefold in what they cost, every day,
 * forever, and which shows only three adjectives, is a picker that sells
 * the expensive one. `credits` comes from the server — priced by the same
 * function that sizes the hold — so the number beside the option is the
 * number that gets charged, not a second implementation of it.
 *
 * The same component is used on the create preview, in the edit panel and
 * in the run dialog. One list of tiers, one set of prices, three places:
 * a second copy is how "deep" comes to mean ten sources in one screen and
 * four in another.
 */
export function DepthPicker({
  value,
  onChange,
  facts,
  suggested,
  disabled,
  compact,
}: {
  value: AgentDepth;
  onChange: (depth: AgentDepth) => void;
  facts: DepthFacts;
  /** The tier the builder suggested, marked so the user can see it was a
   *  suggestion rather than a default they never chose. */
  suggested?: AgentDepth;
  disabled?: boolean;
  /** The run dialog has less room and already knows the agent's task. */
  compact?: boolean;
}) {
  const t = useTranslations("dashboard.agents.depth");
  const locale = useLocale();

  return (
    <div className="space-y-2" role="radiogroup" aria-label={t("legend")}>
      {AGENT_DEPTHS.map((depth) => {
        const fact = facts[depth];
        const Icon = ICONS[depth];
        const selected = value === depth;
        return (
          <button
            key={depth}
            type="button"
            role="radio"
            aria-checked={selected}
            disabled={disabled}
            onClick={() => onChange(depth)}
            className={`flex w-full items-start gap-3 rounded-xl border p-3 text-left transition-colors duration-150 disabled:opacity-50 ${
              selected
                ? "border-orange-500/50 bg-orange-500/10"
                : "border-border hover:bg-panel-hover"
            }`}
          >
            <Icon
              className={`mt-0.5 h-4 w-4 shrink-0 ${selected ? "text-orange-400" : "text-muted"}`}
              aria-hidden="true"
            />
            <span className="min-w-0 flex-1">
              <span className="flex flex-wrap items-center gap-2">
                <span className="text-sm font-medium text-foreground">{t(`${depth}.title`)}</span>
                {suggested === depth && (
                  <span className="rounded-full border border-orange-500/40 px-2 py-0.5 text-[10px] text-orange-300">
                    {t("suggested")}
                  </span>
                )}
              </span>
              <span className="mt-0.5 block text-[11px] leading-relaxed text-muted">
                {t(`${depth}.what`)}
              </span>
              {!compact && fact && (
                <span className="mt-1 block text-[11px] text-muted">
                  {t("facts", {
                    sources: fact.sources,
                    steps: fact.steps,
                    seconds: `${fact.seconds[0]}-${fact.seconds[1]}`,
                  })}
                </span>
              )}
            </span>
            {/* THE NUMBER, on its own, right-aligned, in every state —
                including the unselected ones, because the comparison is
                the decision. */}
            <span className="shrink-0 text-right">
              <span className="block text-sm font-medium text-foreground">
                {fact ? formatNumber(fact.credits, locale) : "—"}
              </span>
              <span className="block text-[10px] text-muted">{t("perRun")}</span>
            </span>
          </button>
        );
      })}
    </div>
  );
}
