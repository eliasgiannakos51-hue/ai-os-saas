"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Flag } from "lucide-react";
import { getErrorMessage } from "@/lib/get-error-message";
import { startAndWatchJob } from "@/lib/jobs/start-and-watch";
import { useCredits } from "@/components/credits/credits-context";
import { useTranslations } from "next-intl";

// Mission Control preset: posts a fixed, product-launch-focused goal
// straight to the existing Planner (/api/mission/plan, same endpoint +
// credit cost as mission-form.tsx). Structurally identical to
// trading-mission-button.tsx — duplicated rather than shared for the same
// reason as product-mentor-button.tsx (Trading Workflow's existing files
// were explicitly off-limits).
export function ProductMissionButton({
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
      const outcome = await startAndWatchJob("/api/mission/plan", { goal });
      void refreshCredits();

      if (!outcome.ok) {
        // still_running means the worker is fine and this page stopped
        // watching — sending the user to the missions list is the honest
        // response, because that is where the plan will appear.
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
          <Flag className="h-4 w-4" aria-hidden="true" />
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
