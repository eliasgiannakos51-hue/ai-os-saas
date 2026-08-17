"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { AiJobProgress } from "@/components/ui/ai-job-progress";
import type { AiJob } from "@/lib/jobs/use-ai-job";
import { useRouter } from "next/navigation";
import { Loader2, Rocket } from "lucide-react";
import { useTranslations } from "next-intl";
import { getErrorMessage } from "@/lib/get-error-message";
import { startAndWatchJob } from "@/lib/jobs/start-and-watch";
import { useCredits } from "@/components/credits/credits-context";
import { CostEstimateHint, LargeActionConfirm, useCostEstimate } from "@/components/credits/cost-estimate";
import { OutOfCreditsNotice } from "@/components/credits/out-of-credits-notice";
import { useToast } from "@/components/toast/toast-context";

const MAX_GOAL_LENGTH = 20000;

// Planner step's entry point — POSTs to /api/mission/plan, which calls the
// Planner Agent (lib/mission-agents.ts) and creates the new ai_missions
// row. router.refresh() afterward re-fetches the mission list server-side
// (dashboard/mission/page.tsx), same pattern as every other add-form in
// this app.
export function MissionForm({
  onCreated,
  prefill,
}: {
  onCreated?: () => void;
  /**
   * A worked example pressed on the empty screen. Same contract as
   * GenericAddForm's: keyed on a nonce so a second press of the same
   * example is a second request rather than a no-op.
   */
  prefill?: { text: string; nonce: number } | null;
} = {}) {
  const t = useTranslations("dashboard.mission");
  const router = useRouter();
  const { refresh: refreshCredits } = useCredits();
  const { addToast } = useToast();
  const [goal, setGoal] = useState("");
  const goalRef = useRef<HTMLTextAreaElement | null>(null);
  const nonce = prefill?.nonce;
  useEffect(() => {
    if (nonce === undefined || !prefill) return;
    setGoal(prefill.text);
    goalRef.current?.focus();
    goalRef.current?.setSelectionRange(prefill.text.length, prefill.text.length);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nonce]);
  const [outOfCredits, setOutOfCredits] = useState(false);
  const [pendingConfirm, setPendingConfirm] = useState(false);
  // Live estimate from the SAME estimator the server reserves against, at
  // this account's own per-credit rate.
  const { credits: estimatedCredits, needsConfirmation } = useCostEstimate("missionPlan", {
    inputChars: goal.trim().length,
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // The worker's real step, so a long plan is not a bare spinner.
  // The whole job row, not just its label. This tracked `stepLabel`,
  // updated it on every poll, and rendered it nowhere — the button said
  // "Planning…" through all three steps. AiJobProgress needs the row
  // (status, step, stepTotal), so the row is what is kept.
  const [job, setJob] = useState<AiJob | null>(null);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const trimmed = goal.trim();
    if (!trimmed || loading) return;

    // Above the large-action threshold, ask first. An undoable charge of
    // this size deserves an explicit yes rather than a surprise.
    if (needsConfirmation && !pendingConfirm) {
      setPendingConfirm(true);
      return;
    }
    setPendingConfirm(false);

    setLoading(true);
    setError(null);
    setOutOfCredits(false);
    try {
      // PLANNING IS A BACKGROUND JOB NOW. This still awaits an outcome,
      // but the work is no longer attached to the request: closing the page
      // here leaves the worker running, and the mission is waiting on the
      // missions list when the user comes back.
      const outcome = await startAndWatchJob("/api/mission/plan", { goal: trimmed }, {
        onProgress: setJob,
      });
      void refreshCredits();

      if (!outcome.ok) {
        if (outcome.code === "insufficient") {
          setOutOfCredits(true);
          return;
        }
        // "still_running" is not a failure of the JOB — this page simply
        // stopped watching. Saying "it failed" would be untrue and would
        // invite a second, duplicate plan.
        const message =
          outcome.code === "still_running"
            ? t("stillPlanning")
            : outcome.code === "stalled"
              ? t("planStalled")
              : getErrorMessage(outcome.error, "Could not create a plan.");
        setError(message);
        addToast(`✗ ${message}`, outcome.code === "still_running" ? "success" : "error");
        return;
      }
      const data = outcome.result as { planned?: boolean; message?: string };
      if (!data.planned) {
        const message = data.message ?? "Could not create a plan.";
        setError(message);
        addToast(`✗ ${message}`, "error");
        return;
      }

      setGoal("");
      addToast(`✓ ${t("createPlan")}`);
      onCreated?.();
      router.refresh();
    } catch {
      const message = "Network error — please try again.";
      setError(message);
      addToast(`✗ ${message}`, "error");
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
    {pendingConfirm && (
      <LargeActionConfirm
        credits={estimatedCredits}
        onConfirm={() => {
          setPendingConfirm(false);
          void handleSubmit(new Event("submit") as unknown as FormEvent);
        }}
        onCancel={() => setPendingConfirm(false)}
      />
    )}
    <form onSubmit={handleSubmit} className="space-y-3 rounded-2xl border border-border bg-panel p-5 pr-14">
      <label htmlFor="mission-goal" className="block text-sm font-semibold text-foreground">
        {t("goalLabel")}
      </label>
      <div className="flex flex-col gap-2">
        <textarea
          id="mission-goal"
          ref={goalRef}
          required
          maxLength={MAX_GOAL_LENGTH}
          value={goal}
          onChange={(e) => setGoal(e.target.value)}
          placeholder={t("goalPlaceholder")}
          className="input min-h-24 resize-y"
        />
        <button
          type="submit"
          disabled={loading || !goal.trim()}
          className="inline-flex min-h-[44px] items-center justify-center gap-1.5 self-start rounded-xl bg-orange-500 px-4 py-2 text-sm font-semibold text-black transition-all duration-200 hover:opacity-90 hover:shadow-[0_0_16px_rgba(249,115,22,0.35)] disabled:cursor-not-allowed disabled:opacity-50"
        >
          {loading ? (
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
          ) : (
            <Rocket className="h-4 w-4" aria-hidden="true" />
          )}
          {loading ? t("planning") : t("createPlan")}
        </button>
        {/* The worker's real step, under the button. Three steps take long
            enough that one static word for all of them reads as a hang. */}
        <AiJobProgress job={job} />
      </div>

      {/* Shown before submit, not after — the whole point is that the cost
          is never a surprise. */}
      <CostEstimateHint credits={estimatedCredits} />

      {outOfCredits && <OutOfCreditsNotice />}

      {error && (
        <p className="rounded-lg border border-red-900 bg-red-950/40 px-3 py-2 text-xs text-red-400">
          {error}
        </p>
      )}
    </form>
    </>
  );
}
