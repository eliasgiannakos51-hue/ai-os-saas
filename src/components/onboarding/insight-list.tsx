"use client";

import { useState } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { Lightbulb, X, ArrowRight, Info } from "lucide-react";
import { useToast } from "@/components/toast/toast-context";
import { getErrorMessage } from "@/lib/get-error-message";

export type Insight = {
  id: string | null;
  detector: string;
  module_slug: string | null;
  headline: string;
  detail: string;
  evidence: Record<string, unknown>;
  sample_size: number;
};

/** Module slug to the route that shows the rows behind an insight. Only
 *  the modules the detectors actually point at — a map with every module
 *  in it would rot silently. */
const MODULE_ROUTES: Record<string, string> = {
  trading: "/dashboard/trading",
  finance: "/dashboard/finance",
  ideas: "/dashboard",
  sales: "/dashboard/sales",
  analytics: "/dashboard/analytics",
};

/**
 * "Here's what I found."
 *
 * Two things on every card that a normal insights widget leaves off, and
 * both are the difference between a claim and a checkable claim:
 *
 *   - THE SAMPLE SIZE. A pattern in nine rows is a hint. Saying which it
 *     is costs one line and is the whole distinction between an insight
 *     and a horoscope.
 *   - A LINK TO THE ROWS. Every claim here was computed from the user's
 *     own records, so the user can go and look at them. An insight that
 *     cannot be checked is one you have to take on faith, and nobody
 *     should take a claim about their own revenue on faith.
 */
export function InsightList({
  insights,
  onDismissed,
}: {
  insights: Insight[];
  onDismissed?: (id: string) => void;
}) {
  const t = useTranslations("dashboard.insights");
  const { addToast } = useToast();
  const [busy, setBusy] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);

  async function dismiss(id: string) {
    setBusy(id);
    try {
      const response = await fetch(`/api/insights/${id}`, { method: "POST" });
      const data = await response.json();
      if (!data.ok) {
        addToast(data.error ?? t("dismissError"), "error");
        return;
      }
      onDismissed?.(id);
    } catch (err) {
      addToast(getErrorMessage(err, t("dismissError")), "error");
    } finally {
      setBusy(null);
    }
  }

  if (insights.length === 0) return null;

  return (
    <ul className="space-y-2.5">
      {insights.map((insight, index) => {
        const route = insight.module_slug ? MODULE_ROUTES[insight.module_slug] : undefined;
        const key = insight.id ?? `${insight.detector}-${index}`;
        const isOpen = expanded === key;

        return (
          <li
            key={key}
            className="rounded-2xl border border-orange-500/30 bg-orange-500/[0.04] p-4"
          >
            <div className="flex items-start gap-3">
              <Lightbulb className="mt-0.5 h-4 w-4 shrink-0 text-orange-400" aria-hidden="true" />
              <div className="min-w-0 flex-1 space-y-1.5">
                <p className="text-sm font-semibold leading-snug text-foreground">{insight.headline}</p>
                <p className="text-xs leading-relaxed text-muted">{insight.detail}</p>

                {/* THE TOUCH TARGETS, MEASURED. Both controls in this row
                    were 17px tall — text links with no height of their
                    own — and scripts/tests/layout-stress.prodtest.mjs
                    counted them at 375px in both locales. `min-h-[44px]`
                    with `-my-3` keeps the hit area at the 44px minimum
                    without changing where the row sits: the negative
                    margin gives back exactly the 27px the min-height
                    adds, so the card's height is unchanged and only the
                    pressable area grows. */}
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1 pt-0.5">
                  {/* Said on every card, never hidden behind a tooltip. */}
                  <span className="text-[11px] text-muted">
                    {t("basedOn", { count: insight.sample_size })}
                  </span>

                  {route && (
                    <Link
                      href={route}
                      className="-my-3 inline-flex min-h-[44px] items-center gap-1 text-[11px] font-medium text-orange-400 transition-colors duration-150 hover:text-orange-300"
                    >
                      {t("checkIt")}
                      <ArrowRight className="h-3 w-3" aria-hidden="true" />
                    </Link>
                  )}

                  <button
                    type="button"
                    onClick={() => setExpanded(isOpen ? null : key)}
                    className="-my-3 inline-flex min-h-[44px] items-center gap-1 text-[11px] font-medium text-muted transition-colors duration-150 hover:text-foreground"
                    aria-expanded={isOpen}
                  >
                    <Info className="h-3 w-3" aria-hidden="true" />
                    {isOpen ? t("hideNumbers") : t("showNumbers")}
                  </button>
                </div>

                {/* The numbers the claim was computed from. Not a debug
                    panel — it is the evidence, and it is here so a user
                    can disagree with the conclusion on the facts. */}
                {isOpen && (
                  <dl className="mt-1 grid grid-cols-1 gap-x-4 gap-y-0.5 rounded-lg border border-border bg-panel/60 p-2.5 sm:grid-cols-2">
                    {Object.entries(insight.evidence).map(([name, value]) => (
                      <div key={name} className="flex items-baseline justify-between gap-2">
                        <dt className="truncate font-mono text-[10px] text-muted">{name}</dt>
                        <dd className="shrink-0 font-mono text-[10px] text-foreground">
                          {Array.isArray(value) ? value.join(", ") : String(value)}
                        </dd>
                      </div>
                    ))}
                  </dl>
                )}
              </div>

              {insight.id && (
                <button
                  type="button"
                  onClick={() => void dismiss(insight.id!)}
                  disabled={busy === insight.id}
                  aria-label={t("dismiss")}
                  className="-mr-1 -mt-1 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-muted transition-colors duration-150 hover:text-foreground disabled:opacity-50"
                >
                  <X className="h-3.5 w-3.5" aria-hidden="true" />
                </button>
              )}
            </div>
          </li>
        );
      })}
    </ul>
  );
}
