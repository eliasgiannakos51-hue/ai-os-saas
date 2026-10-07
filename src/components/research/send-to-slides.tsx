"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { Presentation, Zap } from "lucide-react";
import { ThinkingIndicator } from "@/components/ui/thinking-indicator";
import { useCredits } from "@/components/credits/credits-context";
import { useCostEstimate } from "@/components/credits/use-cost-estimate";
import { DEFAULT_SLIDES, deckEstimateInputChars } from "@/lib/presentations/deck";
import { researchBrief } from "@/lib/research/research-to-slides";

/**
 * «ΤΗ ΣΤΕΛΝΩ ΣΤΟ SLIDES ΜΕ ΕΝΑ ΠΑΤΗΜΑ» (MASTER 16, package 11), behind the
 * switch "research-slides". On the Research shell and on the Research page,
 * one component.
 *
 * The price is on the button before it is pressed, from the same estimator
 * the server holds against, sized on the brief the server will build from
 * this report (lib/research/research-to-slides.ts). A large one asks once
 * more before anything is spent, as every large action in the app does.
 * The report goes by its id (api/presentations/generate reads it, owner
 * only); the finished deck opens in Slides, where it can be changed and
 * downloaded. Every refusal is said, in the reader's language.
 *
 * Held by scripts/tests/research-slides.test.mjs.
 */
export function SendToSlides({
  report,
  className,
}: {
  report: { id: string; topic: string; sections?: unknown; sources?: unknown };
  className: string;
}) {
  const t = useTranslations("dashboard.deepResearch.toSlides");
  const tSlides = useTranslations("presentations");
  const locale = useLocale();
  const router = useRouter();
  const { refresh: refreshCredits } = useCredits();
  const [state, setState] = useState<"idle" | "confirm" | "working">("idle");
  const [error, setError] = useState<string | null>(null);

  const brief = researchBrief({ topic: report.topic, sections: report.sections, sources: report.sources });
  const estimate = useCostEstimate("presentationGenerate", { inputChars: deckEstimateInputChars(brief?.brief.length ?? 0, DEFAULT_SLIDES) });

  function refusal(code: string): string {
    return code === "insufficient_credits" || code === "reserve_failed"
      ? tSlides("errors.insufficient")
      : code === "rate_limited" || code === "bypass_ceiling"
        ? tSlides("errors.rateLimited")
        : code === "ai_unavailable" || code === "not_configured"
          ? tSlides("errors.unavailable")
          : code === "unusable"
            ? tSlides("errors.unusable")
            : code === "not_included"
              ? tSlides("edit.notIncluded")
              : code === "research_not_ready" || code === "research_not_found"
                ? t("notReady")
                : tSlides("errors.failed");
  }

  async function send() {
    if (!brief || state === "working") return;
    if (estimate.needsConfirmation && state !== "confirm") {
      setState("confirm");
      return;
    }
    setState("working");
    setError(null);
    try {
      const response = await fetch("/api/presentations/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ researchId: report.id, slideCount: DEFAULT_SLIDES, imageSource: "none", locale }),
      });
      const body = await response.json().catch(() => null);
      void refreshCredits();
      if (!response.ok || !body?.id) {
        setError(refusal(String(body?.error ?? "")));
        setState("idle");
        return;
      }
      router.push(`/dashboard/presentations?record=${encodeURIComponent(String(body.id))}`);
    } catch {
      setError(t("offline"));
      setState("idle");
    }
  }

  if (!brief) return null;
  return (
    <span className="inline-flex flex-wrap items-center gap-2">
      <button
        type="button"
        onClick={() => void send()}
        disabled={state === "working"}
        data-testid="research-to-slides"
        className={`${className} disabled:opacity-60`}
      >
        {state === "working" ? <ThinkingIndicator size="sm" /> : <Presentation className="h-3.5 w-3.5" aria-hidden="true" />}
        {state === "working" ? t("working") : state === "confirm" ? t("confirm", { count: estimate.credits }) : t("send")}
        {state === "idle" && (
          <span className="inline-flex items-center gap-0.5 text-[11px] text-muted">
            <Zap className="h-3 w-3" aria-hidden="true" />
            {t("price", { count: estimate.credits })}
          </span>
        )}
      </button>
      {state === "confirm" && (
        <button type="button" onClick={() => setState("idle")} data-testid="research-to-slides-cancel" className="min-h-[44px] px-2 text-xs text-muted hover:text-foreground">
          {t("cancel")}
        </button>
      )}
      {error && (
        <span role="alert" data-testid="research-to-slides-error" className="basis-full text-xs text-danger">
          {error}
        </span>
      )}
    </span>
  );
}
