"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Rocket } from "lucide-react";
import { getErrorMessage } from "@/lib/get-error-message";
import { startAndWatchJob } from "@/lib/jobs/start-and-watch";
import { useCredits } from "@/components/credits/credits-context";
import { useTranslations } from "next-intl";

// Mission Control preset: posts a fixed, trading-focused goal straight to
// the existing Planner (/api/mission/plan, same endpoint + credit cost as
// mission-form.tsx) — the AI naturally produces trading-relevant first
// steps from the goal text itself, no separate "no-AI" bypass needed here
// (only the pattern-detection insight above is required to skip AI).
export function TradingMissionButton({
  label,
  creatingLabel,
  goal,
  description,
}: {
  label: string;
  creatingLabel: string;
  goal: string;
  description: string;
}) {
  const router = useRouter();
  const { refresh: refreshCredits } = useCredits();
  const tCommon = useTranslations("common");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleClick() {
    if (loading) return;
    setLoading(true);
    setError(null);
    try {
      // PLANNING IS A BACKGROUND JOB, and this button did not know it.
      //
      // /api/mission/plan stopped answering `{ planned: true }` and started
      // answering 202 `{ jobId }` when planning moved into a worker. The
      // test below was `if (!data.planned)`, which is now never true — so
      // this button reported "Could not create a plan." on every press
      // while the worker planned the mission and charged for it. A user
      // who believes it failed presses it again, and pays twice for the
      // same plan. Same fix, same helper as mission-form.tsx and
      // product-mission-button.tsx.
      const outcome = await startAndWatchJob("/api/mission/plan", { goal });
      void refreshCredits();

      if (!outcome.ok) {
        // "still_running" means the worker is fine and this page stopped
        // watching. The missions list is where the plan appears, so
        // sending the user there is the truthful answer — and it does not
        // invite the duplicate press that "it failed" would.
        if (outcome.code === "still_running") {
          router.push("/dashboard/mission");
          return;
        }
        setError(getErrorMessage(outcome.error, "Could not create a plan."));
        return;
      }
      const data = outcome.result as { planned?: boolean; message?: string };
      if (!data.planned) {
        setError(data.message ?? "Could not create a plan.");
        return;
      }

      router.push("/dashboard/mission");
    } catch {
      setError(tCommon("networkError"));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="rounded-2xl border border-border bg-panel p-4">
      <button
        type="button"
        onClick={handleClick}
        disabled={loading}
        className="flex w-full items-center gap-3 text-left transition-opacity duration-150 disabled:opacity-60"
      >
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-orange-500/10 text-orange-400">
          <Rocket className="h-4 w-4" aria-hidden="true" />
        </span>
        <div className="min-w-0">
          <p className="text-sm font-semibold text-foreground">{loading ? creatingLabel : label}</p>
          <p className="mt-0.5 text-xs text-muted">{description}</p>
        </div>
      </button>
      {error && (
        <p className="mt-2 rounded-lg border border-red-900 bg-red-950/40 px-3 py-2 text-xs text-red-400">
          {error}
        </p>
      )}
    </div>
  );
}
