"use client";

import { useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { RefreshCw, Zap } from "lucide-react";
import { ThinkingIndicator } from "@/components/ui/thinking-indicator";
import { InsightList, type Insight } from "@/components/onboarding/insight-list";
import { useToast } from "@/components/toast/toast-context";
import { useCredits } from "@/components/credits/credits-context";
import { estimateForAction } from "@/lib/billing/estimate";
import { DEFAULTS } from "@/lib/billing/pricing-config";
// The model the route really prices — read from the same constant
// api/insights/generate uses, so the estimate cannot quote a model the
// server is not going to call.
import { INSIGHT_MODEL } from "@/lib/insights/insight-models";
import { getErrorMessage } from "@/lib/get-error-message";

/**
 * THE PATTERNS THIS ACCOUNT'S OWN ROWS CONTAIN, ON A PAGE OF THEIR OWN.
 *
 * They were computed already — lib/insights/detectors.ts finds them in
 * TypeScript, with a sample size, and lib/insights/narrate.ts only puts
 * them into a sentence. What did not exist was anywhere to go and look:
 * the cards were rendered inside /dashboard/overview and inside the
 * owner-only business-health page, so a user who scrolled past one had
 * no route back to it, and nobody could ask for a fresh pass.
 *
 * WHAT THIS COMPONENT DOES NOT DO is compute anything. It lists what the
 * server already stored and offers one button that asks for another
 * pass. Every claim on a card still carries its sample size and a link
 * to the rows it was computed from — see components/onboarding/
 * insight-list.tsx, which this reuses rather than reimplements, so a
 * change to how a claim is presented cannot apply to one surface and not
 * the other.
 */
export function PredictionsPanel({ initial }: { initial: Insight[] }) {
  const t = useTranslations("dashboard.predictions");
  const tCredits = useTranslations("credits.estimate");
  const locale = useLocale();
  const router = useRouter();
  const { addToast } = useToast();
  const { refresh: refreshCredits } = useCredits();
  // THE PRICE BEFORE THE CLICK. A pass reserves and settles like any
  // other AI call here, and this project has already shipped one form
  // that charged without naming a number first — see the `creditCost`
  // paragraph in lib/build-modules.ts. `insightNarrate` is the action the
  // route really prices (api/insights/generate), so this is the same
  // profile the server will use, not a second guess at it.
  //
  // CALLED DIRECTLY RATHER THAN THROUGH components/credits/
  // cost-estimate.tsx, and the reason is a real gate rather than taste:
  // that module also exports LargeActionConfirm, whose modal carries a
  // filled orange button — and scripts/tests/one-primary-action.test.mjs
  // counts filled accent controls per PAGE by walking what the page
  // imports, so importing the hint for its six lines of markup gave this
  // screen two primary actions where its own comment says the target is
  // one. `accountCreditPriceEur` still comes from the server, because a
  // credit is not worth the same on every plan.
  const { accountCreditPriceEur, planSlug } = useCredits();
  const credits = estimateForAction(
    "insightNarrate",
    { model: INSIGHT_MODEL, inputChars: 0, planSlug },
    DEFAULTS,
    accountCreditPriceEur ?? undefined
  ).estimatedCredits;

  const [insights, setInsights] = useState<Insight[]>(initial);
  const [running, setRunning] = useState(false);
  // NOT DERIVED FROM insights.length. A pass that ran and found nothing
  // is a different sentence from a page that has never been asked, and
  // the empty state below says which — "no patterns yet" would be a
  // claim about the data when it is a claim about what has been run.
  const [ran, setRan] = useState(false);
  const [needMoreData, setNeedMoreData] = useState(false);

  async function run() {
    if (running) return;
    setRunning(true);
    try {
      const response = await fetch("/api/insights/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ language: locale }),
      });
      const data = await response.json();
      if (!data.ok) {
        addToast(data.error ?? t("error"), "error");
        return;
      }
      setInsights((data.insights ?? []) as Insight[]);
      setNeedMoreData(Boolean(data.needMoreData));
      setRan(true);
      // The balance moved: the pass reserves and settles like every other
      // AI call in this app, so the header would otherwise keep showing
      // the number from before the click.
      refreshCredits();
      router.refresh();
    } catch (err) {
      addToast(getErrorMessage(err, t("error")), "error");
    } finally {
      setRunning(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-border bg-panel/50 p-4">
        <p className="max-w-prose text-sm text-muted">{t("whatItDoes")}</p>
        <button
          type="button"
          onClick={run}
          disabled={running}
          className="flex min-h-[44px] shrink-0 items-center gap-2 rounded-xl bg-orange-500 px-4 text-sm font-semibold text-black transition-all duration-200 hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {/* NOT A SPINNER. A model call is running behind this button —
              the narration pass in api/insights/generate — and this
              project's rule is that the globe stands for a model
              thinking, never a rotating ring. scripts/tests/
              globe-mark.test.mjs caught exactly this file spinning and
              said so by name. */}
          {running ? (
            <ThinkingIndicator size="sm" tone="inherit" />
          ) : (
            <RefreshCw className="h-4 w-4" aria-hidden="true" />
          )}
          {running ? t("running") : t("run")}
        </button>
      </div>
      {credits > 0 ? (
        <p className="flex items-center gap-1.5 text-[11px] text-muted">
          <Zap className="h-3 w-3 text-orange-400/70" aria-hidden="true" />
          {tCredits("approx", { count: credits })}
        </p>
      ) : null}

      {insights.length > 0 ? (
        <InsightList
          insights={insights}
          onDismissed={(id) => setInsights((current) => current.filter((i) => i.id !== id))}
        />
      ) : (
        <div className="rounded-2xl border border-border bg-panel/50 p-6">
          <p className="text-sm font-semibold text-foreground">
            {needMoreData ? t("needMoreData") : ran ? t("foundNothing") : t("neverRun")}
          </p>
          <p className="mt-2 max-w-prose text-sm text-muted">
            {needMoreData ? t("needMoreDataWhy") : ran ? t("foundNothingWhy") : t("neverRunWhy")}
          </p>
        </div>
      )}
    </div>
  );
}
