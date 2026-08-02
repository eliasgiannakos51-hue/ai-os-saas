"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Rocket } from "lucide-react";
import { getErrorMessage } from "@/lib/get-error-message";
import { useCredits } from "@/components/credits/credits-context";

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
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleClick() {
    if (loading) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/mission/plan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ goal }),
      });
      const data = await res.json();
      void refreshCredits();

      if (!res.ok || !data.ok) {
        setError(getErrorMessage(data?.error, "Could not create a plan."));
        return;
      }
      if (!data.planned) {
        setError(data.message ?? "Could not create a plan.");
        return;
      }

      router.push("/dashboard/mission");
    } catch {
      setError("Network error — please try again.");
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
