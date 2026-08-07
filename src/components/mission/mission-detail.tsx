"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  CalendarClock,
  CheckCircle2,
  Circle,
  ClipboardCheck,
  Clock,
  ListChecks,
  Loader2,
  RotateCw,
  Sparkles,
  Users,
  X,
} from "lucide-react";
import { useTranslations, useLocale } from "next-intl";
import { createClient } from "@/lib/supabase/client";
import { getErrorMessage } from "@/lib/get-error-message";
import { CelebrationBurst } from "@/components/celebration/celebration-burst";
import { ThinkingIndicator } from "@/components/ui/thinking-indicator";
import { useFormatRelativeTime } from "@/lib/use-relative-time";
import { useCredits } from "@/components/credits/credits-context";
import { MessageContent } from "@/components/chat/message-content";
import { getStuckStep } from "@/lib/mission-progress";
import { buildPriorStepsContext, MAX_STEP_ATTEMPTS, stepAttemptsExhausted } from "@/lib/mission-context";
import { updateMissionPlanSteps } from "@/lib/mission-plan-steps";
import { CollaborationPanel } from "@/components/collaboration/collaboration-panel";
import { fetchWithAuthRetry } from "@/lib/fetch-with-auth-retry";
import { AGENT_ROLES, type AgentRole } from "@/lib/agent-roles";
import { SecurityCheckedBadge } from "@/components/security/security-checked-badge";
import { MISSION_ICON, WEBSITE_BUILDER_ICON } from "@/lib/module-icons";
import { DetailPanel, type DetailTab } from "@/components/ui/detail-panel";
import { FavoriteButton } from "@/components/favorites/favorite-button";
import type { Mission } from "@/types/mission";
import { formatDateTime } from "@/lib/format-number";

// A step whose text is clearly about building a website/landing page
// can never be classified into any of the 13 business modules "Create
// with AI"'s classifier knows about — Website Builder is a separate real
// AI generator (api/websites/generate), not one of api/create's
// CLASSIFIER_MODULES. Offers a direct link there instead, alongside
// "Create with AI", so a plan step like Product Workflow's launch
// mission's "Create a landing page" is actually actionable, not just
// descriptive text nothing here can act on.
const WEBSITE_STEP_KEYWORDS = ["landing page", "landing σελίδα", "σελίδα προορισμού", "website", "ιστοσελίδα"];
function looksLikeWebsiteStep(text: string): boolean {
  const lower = text.toLowerCase();
  return WEBSITE_STEP_KEYWORDS.some((keyword) => lower.includes(keyword));
}

// "AI Company" — translation key per agent role (see lib/agent-roles.ts),
// used both for the per-step picker options and the "Built by X" badge on
// completed steps.
const AGENT_ROLE_LABEL_KEYS: Record<AgentRole, string> = {
  general: "agentRole.general",
  marketing: "agentRole.marketing",
  finance: "agentRole.finance",
  research: "agentRole.research",
};

// Builder step (per-step "Create with AI") and Reviewer step both live
// here. Builder calls the EXISTING /api/create (Create Anything) with the
// step's own text — its classifier decides the module, this component
// never does. On success, the step is marked completed via a direct
// client-side update to ai_missions (RLS-scoped, same pattern as
// chat-workspace.tsx's togglePin/renameConversation), then
// router.refresh() reloads the mission from the server so this card is
// always rendering real, persisted state rather than a hand-mirrored copy.
export type MissionDetailTab = "steps" | "review" | "share";

export function MissionDetail({
  mission,
  scheduledStepIndices = [],
  initialFavorited = false,
  initialTab = "steps",
  accessRole = "owner",
  onClose,
}: {
  mission: Mission;
  /** Whether this mission is already starred, resolved server-side in one
   *  batched query rather than a fetch per card. */
  initialFavorited?: boolean;
  // Indices of steps that already have a pending scheduled_agent_runs row
  // for this mission (see dashboard/mission/page.tsx) — used to show
  // "Scheduled" instead of offering to schedule the same step twice.
  scheduledStepIndices?: number[];
  initialTab?: MissionDetailTab;
  /** Collaboration (V3 Task 11). "owner" is the default and today's
   *  behaviour; a mission shared with this user arrives as "editor"
   *  (may tick sub-steps — the RLS update policy is the server truth
   *  this mirrors) or "viewer" (read only). Non-owners never see the
   *  AI-build, schedule or share controls: building and scheduling stay
   *  owner concerns, and hiding what RLS would refuse beats offering
   *  buttons that 403. */
  accessRole?: "owner" | "editor" | "viewer";
  onClose: () => void;
}) {
  const formatRelativeTime = useFormatRelativeTime();
  const t = useTranslations("dashboard.mission");
  const locale = useLocale();
  const tCommon = useTranslations("common");
  const tCollab = useTranslations("collaboration");
  const router = useRouter();
  const supabase = createClient();
  const { refresh: refreshCredits } = useCredits();
  const steps = mission.plan_steps?.steps ?? [];
  const review = mission.plan_steps?.review;
  const stuckStep = getStuckStep(mission);
  const [buildingIndex, setBuildingIndex] = useState<number | null>(null);
  // Index of the step that JUST completed — drives the confetti burst
  // and the pop on that one row. Cleared by the burst's onDone so a
  // later completion can fire it again.
  const [celebratingIndex, setCelebratingIndex] = useState<number | null>(null);
  const [schedulingIndex, setSchedulingIndex] = useState<number | null>(null);
  const [reviewing, setReviewing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // "AI Company" — per-step agent role picker (lib/agent-roles.ts), keyed
  // by step index. Defaults to "general" (today's exact behavior) until
  // the user picks something else for that step.
  const [stepAgentRoles, setStepAgentRoles] = useState<Record<number, AgentRole>>({});
  const [tab, setTab] = useState<MissionDetailTab>(initialTab);

  useEffect(() => {
    setTab(initialTab);
  }, [mission.id, initialTab]);

  const allCompleted = steps.length > 0 && steps.every((s) => s.status === "completed");
  const completedCount = steps.filter((s) => s.status === "completed").length;

  // Mission Control retry: persists the step's incremented attempt count
  // on failure (previously failures were purely ephemeral, never written
  // back) so the 3-attempt cap survives a page reload.
  async function persistStepFailure(index: number) {
    const result = await updateMissionPlanSteps(supabase, mission.id, ({ planSteps }) => ({
      planSteps: {
        ...planSteps,
        steps: (planSteps.steps ?? []).map((s, i) =>
          i === index ? { ...s, attempts: (s.attempts ?? 0) + 1 } : s
        ),
      },
    }));
    if (result.ok) {
      router.refresh();
    }
  }

  // Sub-steps are ticked by hand — no AI call, no credits. Persisted the
  // same optimistic-concurrency way every other plan mutation is, so two
  // tabs can't clobber each other's ticks.
  const [togglingSubstep, setTogglingSubstep] = useState<string | null>(null);
  async function toggleSubstep(stepIndex: number, substepIndex: number) {
    const key = `${stepIndex}:${substepIndex}`;
    if (togglingSubstep) return;
    setTogglingSubstep(key);
    const result = await updateMissionPlanSteps(supabase, mission.id, ({ planSteps }) => ({
      planSteps: {
        ...planSteps,
        steps: (planSteps.steps ?? []).map((step, i) =>
          i !== stepIndex
            ? step
            : {
                ...step,
                substeps: (step.substeps ?? []).map((sub, j) =>
                  j !== substepIndex
                    ? sub
                    : { ...sub, status: sub.status === "completed" ? "pending" : "completed" }
                ),
              }
        ),
      },
    }));
    setTogglingSubstep(null);
    if (result.ok) {
      router.refresh();
      return;
    }
    // Same two failure shapes every other plan mutation handles: another
    // tab won the write (conflict), or the write itself failed.
    if (result.conflict) {
      setError(t("updatedElsewhere"));
      router.refresh();
      return;
    }
    setError(getErrorMessage(result.error, "Could not update that sub-step."));
  }

  async function buildStep(index: number) {
    const step = steps[index];
    if (!step || step.status === "completed" || buildingIndex !== null) return;
    if (stepAttemptsExhausted(step.attempts)) return;
    const agentRole = stepAgentRoles[index] ?? step.agentRole ?? "general";

    // "AI Company" real collaboration — every earlier completed step's
    // output (see types/mission.ts) is handed to this step as context, so
    // e.g. a Finance Agent step can see numbers a prior Marketing Agent
    // step actually produced instead of re-deriving them.
    const priorContext = buildPriorStepsContext(steps, index);

    setBuildingIndex(index);
    setError(null);
    try {
      const res = await fetchWithAuthRetry("/api/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: step.text,
          agentRole,
          // The Planner Agent already refuses to create vague filler
          // steps (see clarificationNeeded in lib/mission-agents.ts) —
          // step.text is always a concrete, specific action by the time
          // it reaches here, so api/create's own clarifying-questions
          // pre-check (lib/clarification.ts) would essentially never
          // fire for it. Explicitly skipped rather than left to chance:
          // this card has no inline UI for answering clarification
          // questions, and a needsClarification response here would
          // otherwise be misread as a real failure (see the !data.matched
          // branch below), wrongly burning one of this step's limited
          // attempts.
          skipClarification: true,
          ...(priorContext ? { context: priorContext } : {}),
        }),
      });
      const data = await res.json();
      void refreshCredits();

      if (!res.ok || !data.ok) {
        await persistStepFailure(index);
        setError(getErrorMessage(data?.error, "Could not create this entry."));
        return;
      }
      if (!data.matched) {
        await persistStepFailure(index);
        setError(data.message ?? "Couldn't route this step to a module — try rephrasing it.");
        return;
      }

      const result = await updateMissionPlanSteps(supabase, mission.id, ({ planSteps, status }) => ({
        planSteps: {
          ...planSteps,
          steps: (planSteps.steps ?? []).map((s, i) =>
            i === index
              ? {
                  ...s,
                  status: "completed" as const,
                  module: data.module,
                  moduleTitle: data.moduleTitle,
                  href: data.href,
                  agentRole,
                  output: typeof data.outputSummary === "string" ? data.outputSummary : undefined,
                }
              : s
          ),
        },
        extraFields: { status: status === "planning" ? "in_progress" : status },
      }));

      if (!result.ok) {
        if (result.conflict) {
          setError(t("updatedElsewhere"));
          router.refresh();
        } else {
          setError(getErrorMessage(result.error, "Entry created, but couldn't update the mission."));
        }
        return;
      }

      setCelebratingIndex(index);
      router.refresh();
    } catch {
      await persistStepFailure(index);
      setError(tCommon("networkError"));
    } finally {
      setBuildingIndex(null);
    }
  }

  // "Schedule for tomorrow" — records the user's explicit approval to run
  // this exact step a day later via the daily cron
  // (api/cron/scheduled-runs/route.ts), instead of building it live right
  // now. No credit check or AI call happens here — that's entirely the
  // cron job's responsibility once the scheduled day arrives.
  async function scheduleStep(index: number) {
    const step = steps[index];
    if (!step || step.status === "completed" || schedulingIndex !== null) return;
    const agentRole = stepAgentRoles[index] ?? step.agentRole ?? "general";

    setSchedulingIndex(index);
    setError(null);
    try {
      const res = await fetchWithAuthRetry("/api/mission/schedule-step", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ missionId: mission.id, stepIndex: index, agentRole }),
      });
      const data = await res.json();

      if (!res.ok || !data.ok) {
        setError(getErrorMessage(data?.error, "Could not schedule this step."));
        return;
      }

      router.refresh();
    } catch {
      setError(tCommon("networkError"));
    } finally {
      setSchedulingIndex(null);
    }
  }

  async function runReview() {
    if (reviewing) return;
    setReviewing(true);
    setError(null);
    try {
      const res = await fetchWithAuthRetry("/api/mission/review", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ missionId: mission.id }),
      });
      const data = await res.json();
      void refreshCredits();

      if (!res.ok || !data.ok) {
        setError(getErrorMessage(data?.error, "Could not review this mission."));
        return;
      }
      if (data.rateLimited) {
        setError(data.message);
        return;
      }

      router.refresh();
    } catch {
      setError(tCommon("networkError"));
    } finally {
      setReviewing(false);
    }
  }


  const tabs: DetailTab[] = [
    { key: "steps", label: t("tabSteps"), icon: ListChecks, badge: steps.length || undefined },
    { key: "review", label: t("tabReview"), icon: ClipboardCheck },
    // Sharing is granting access, and only the owner grants access.
    ...(accessRole === "owner"
      ? [{ key: "share", label: tCollab("tabShare"), icon: Users } as DetailTab]
      : []),
  ];

  return (
    <DetailPanel
      icon={MISSION_ICON}
      accentSlug="missionControl"
      title={mission.goal}
      subtitle={
        <span
          title={formatDateTime(mission.created_at, locale)}
          suppressHydrationWarning
        >
          {t("started", { time: formatRelativeTime(mission.created_at) })}
        </span>
      }
      corner={
        <>
          <SecurityCheckedBadge resourceType="mission_plan" resourceId={mission.id} />
          <FavoriteButton
            table="ai_missions"
            recordId={mission.id}
            headline={mission.goal}
            initialFavorited={initialFavorited}
            variant="inline"
          />
          <button
            type="button"
            onClick={onClose}
            aria-label={tCommon("cancel")}
            title={tCommon("cancel")}
            className="flex h-8 w-8 items-center justify-center rounded-lg text-muted transition-colors duration-150 hover:bg-panel-hover hover:text-foreground"
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </>
      }
      tabs={tabs}
      activeTab={tab}
      onTabChange={(key) => setTab(key as MissionDetailTab)}
      actions={
        <>
          {allCompleted && !review && (
            <button
              type="button"
              onClick={runReview}
              disabled={reviewing}
              className="inline-flex min-h-[40px] items-center gap-1.5 rounded-lg bg-orange-500 px-4 py-2 text-xs font-semibold text-black transition-all duration-200 hover:opacity-90 hover:shadow-[0_0_16px_rgba(249,115,22,0.35)] disabled:cursor-not-allowed disabled:opacity-50 sm:min-h-0"
            >
              <ClipboardCheck className="h-3.5 w-3.5" aria-hidden="true" />
              {reviewing ? t("reviewing") : t("reviewMission")}
            </button>
          )}
          <span className="text-xs text-muted">
            {t("stepsProgress", { done: completedCount, total: steps.length })}
          </span>
        </>
      }
    >
      {error && (
        <p className="mb-3 rounded-lg border border-red-900 bg-red-950/40 px-3 py-2 text-xs text-red-400">
          {error}
        </p>
      )}

      {tab === "steps" && (
        <>
          {stuckStep && (
            <div className="mb-3 flex items-start gap-2.5 rounded-xl border border-amber-800/50 bg-amber-500/5 px-3 py-2.5 text-xs text-amber-300">
              <Clock className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
              <p>{t("stillWorkingOn", { step: stuckStep.text })}</p>
            </div>
          )}

          {steps.length === 0 ? (
            <p className="text-sm text-muted">{t("noSteps")}</p>
          ) : (
            <ul className="space-y-2">
              {steps.map((step, index) => (
                <li
                  key={index}
                  className={`relative flex items-start gap-2.5 rounded-xl border border-border bg-input px-3 py-2.5 ${
                    celebratingIndex === index ? "celebration-pop" : ""
                  }`}
                >
                  <CelebrationBurst
                    trigger={celebratingIndex === index}
                    onDone={() => setCelebratingIndex(null)}
                  />
                  {step.status === "completed" ? (
                    <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-400" aria-hidden="true" />
                  ) : (
                    <Circle className="mt-0.5 h-4 w-4 shrink-0 text-muted" aria-hidden="true" />
                  )}
                  <div className="min-w-0 flex-1">
                    <p
                      className={`text-sm ${
                        step.status === "completed" ? "text-muted line-through" : "text-foreground"
                      }`}
                    >
                      {step.text}
                    </p>
                    {step.status === "completed" && step.href && (
                      <Link
                        href={step.href}
                        className="mt-0.5 inline-block text-xs text-orange-400 hover:underline"
                      >
                        {t("viewIn", { module: step.moduleTitle ?? step.module ?? "" })}
                      </Link>
                    )}
                    {step.status === "completed" && step.agentRole && step.agentRole !== "general" && (
                      <p className="mt-0.5 text-[11px] text-muted">
                        {t("builtByAgent", { agent: t(AGENT_ROLE_LABEL_KEYS[step.agentRole]) })}
                      </p>
                    )}
                    {step.status === "completed" && step.output && (
                      <p className="mt-1 line-clamp-2 text-[11px] text-muted/80">{step.output}</p>
                    )}

                    {/* What you will have when it's done, and roughly how
                        long it takes — both come from the Planner, and both
                        are simply absent on missions planned before they
                        existed. */}
                    {(step.outcome || step.estimatedMinutes) && (
                      <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] text-muted">
                        {step.outcome && (
                          <span>
                            <span className="text-emerald-400/80">→</span> {step.outcome}
                          </span>
                        )}
                        {step.estimatedMinutes ? (
                          <span className="inline-flex items-center gap-1 text-muted/80">
                            <Clock className="h-3 w-3" aria-hidden="true" />
                            {t("stepMinutes", { count: step.estimatedMinutes })}
                          </span>
                        ) : null}
                      </p>
                    )}

                    {step.substeps && step.substeps.length > 0 && (
                      <ul className="mt-2 space-y-1 border-l border-border pl-3">
                        {step.substeps.map((sub, subIndex) => {
                          const done = sub.status === "completed";
                          return (
                            <li key={subIndex}>
                              <button
                                type="button"
                                onClick={() => toggleSubstep(index, subIndex)}
                                // Viewers are read-only: the RLS update
                                // policy would refuse the write anyway;
                                // disabling is honesty, not enforcement.
                                disabled={togglingSubstep !== null || accessRole === "viewer"}
                                aria-pressed={done}
                                className="flex w-full items-start gap-2 rounded-md px-1 py-0.5 text-left transition-colors duration-150 hover:bg-panel-hover disabled:cursor-not-allowed disabled:opacity-60"
                              >
                                {done ? (
                                  <CheckCircle2
                                    className="mt-[3px] h-3.5 w-3.5 shrink-0 text-emerald-400"
                                    aria-hidden="true"
                                  />
                                ) : (
                                  <Circle
                                    className="mt-[3px] h-3.5 w-3.5 shrink-0 text-muted"
                                    aria-hidden="true"
                                  />
                                )}
                                <span
                                  className={`text-xs ${done ? "text-muted line-through" : "text-foreground/90"}`}
                                >
                                  {sub.text}
                                </span>
                              </button>
                            </li>
                          );
                        })}
                      </ul>
                    )}
                  </div>
                  {/* Building with AI and scheduling stay owner concerns:
                      the routes behind them are owner-scoped, and a
                      collaborator's contribution surface is the sub-step
                      ticks and the outputs, not spending decisions on a
                      project they do not own. */}
                  {step.status !== "completed" && accessRole === "owner" && (
                    <div className="flex shrink-0 flex-col items-end gap-1.5">
                      {stepAttemptsExhausted(step.attempts) ? (
                        <p className="max-w-[160px] text-right text-[11px] text-red-400">
                          {t("stepFailedMax", { max: MAX_STEP_ATTEMPTS })}
                        </p>
                      ) : (
                        <>
                          {looksLikeWebsiteStep(step.text) && (
                            <Link
                              href="/dashboard/website-builder"
                              className="inline-flex items-center gap-1.5 rounded-lg border border-orange-500/40 px-2.5 py-1.5 text-xs font-medium text-orange-400 transition-colors duration-150 hover:bg-orange-500/10"
                            >
                              <WEBSITE_BUILDER_ICON className="h-3.5 w-3.5" aria-hidden="true" />
                              {t("openWebsiteBuilder")}
                            </Link>
                          )}
                          <select
                            value={stepAgentRoles[index] ?? step.agentRole ?? "general"}
                            onChange={(e) =>
                              setStepAgentRoles((prev) => ({
                                ...prev,
                                [index]: e.target.value as AgentRole,
                              }))
                            }
                            disabled={buildingIndex !== null}
                            aria-label={t("agentRoleLabel")}
                            className="rounded-lg border border-border bg-input px-2 py-1 text-[11px] text-foreground outline-none transition-colors duration-150 focus:border-orange-500/60 disabled:cursor-not-allowed disabled:opacity-50"
                          >
                            {AGENT_ROLES.map((role) => (
                              <option key={role} value={role}>
                                {t(AGENT_ROLE_LABEL_KEYS[role])}
                              </option>
                            ))}
                          </select>
                          <button
                            type="button"
                            onClick={() => buildStep(index)}
                            disabled={buildingIndex !== null}
                            className="inline-flex items-center gap-1.5 rounded-lg border border-border px-2.5 py-1.5 text-xs font-medium text-foreground transition-colors duration-150 hover:border-orange-500 hover:text-orange-400 disabled:cursor-not-allowed disabled:opacity-50"
                          >
                            {buildingIndex === index ? (
                              <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
                            ) : (step.attempts ?? 0) > 0 ? (
                              <RotateCw className="h-3.5 w-3.5" aria-hidden="true" />
                            ) : (
                              <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
                            )}
                            {buildingIndex === index
                              ? t("creating")
                              : (step.attempts ?? 0) > 0
                                ? t("retry", { attempts: step.attempts ?? 0, max: MAX_STEP_ATTEMPTS })
                                : t("createWithAi")}
                          </button>
                          {/* Real in-flight AI work — this only renders while
                              buildStep's request for THIS step is actually
                              open (buildingIndex is cleared in its finally
                              block), so it can never show without work
                              behind it. */}
                          {buildingIndex === index && <ThinkingIndicator label={t("creating")} />}
                          {scheduledStepIndices.includes(index) ? (
                            <p className="inline-flex items-center gap-1.5 text-[11px] text-muted">
                              <CalendarClock className="h-3 w-3" aria-hidden="true" />
                              {t("scheduledForTomorrow")}
                            </p>
                          ) : (
                            <button
                              type="button"
                              onClick={() => scheduleStep(index)}
                              disabled={buildingIndex !== null || schedulingIndex !== null}
                              className="inline-flex items-center gap-1.5 rounded-lg border border-border px-2.5 py-1.5 text-xs font-medium text-muted transition-colors duration-150 hover:border-orange-500 hover:text-orange-400 disabled:cursor-not-allowed disabled:opacity-50"
                            >
                              {schedulingIndex === index ? (
                                <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
                              ) : (
                                <CalendarClock className="h-3.5 w-3.5" aria-hidden="true" />
                              )}
                              {schedulingIndex === index ? t("scheduling") : t("scheduleForTomorrow")}
                            </button>
                          )}
                        </>
                      )}
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}
        </>
      )}

      {tab === "review" && (
        <div>
          {review ? (
            <div className="rounded-xl border border-emerald-800 bg-emerald-950/20 p-4">
              <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-emerald-400">
                {t("reviewerLabel")}
              </p>
              <MessageContent content={review} />
            </div>
          ) : (
            <p className="text-sm text-muted">
              {allCompleted ? t("reviewNotRunYet") : t("reviewLocked")}
            </p>
          )}
        </div>
      )}

      {/* Owner-only by the tab's own existence check above, and repeated
          here so a stray tab state can never render the grant surface. */}
      {tab === "share" && accessRole === "owner" && <CollaborationPanel projectId={mission.id} />}
    </DetailPanel>
  );
}
