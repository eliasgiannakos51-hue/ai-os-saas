import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isAdminEmail } from "@/lib/admin";
import { hasActiveBetaBypass } from "@/lib/beta";
import { CREDIT_COSTS, deductCredits, hasEnoughCredits, resolveEffectivePlan } from "@/lib/billing/credits";
import { runMissionStepForUser } from "@/lib/mission-step-runner";
import { buildPriorStepsContext } from "@/lib/mission-context";
import { computeNextRunAt } from "@/lib/automation-schedule";
import { checkAiCallAllowed, fingerprintRequest, recordAiCallForDailySpend } from "@/lib/ai-circuit-breaker";
import { sendScheduledRunCompleteEmail } from "@/lib/email/send-scheduled-run-complete-email";
import { logApiError } from "@/lib/log-error";
import type { Mission } from "@/types/mission";
import type { ScheduledAgentRun } from "@/types/scheduled-agent-run";
import type { UserAutomation } from "@/types/user-automation";

export const dynamic = "force-dynamic";

// Safety cap, per the brief: at most this many scheduled runs are actually
// EXECUTED per user per cron invocation (once/day). Anything beyond that
// stays 'pending' — created_at ordering means it's simply first in line
// for tomorrow's run, never lost, never executed twice.
const MAX_RUNS_PER_USER_PER_DAY = 5;

// Scheduled Agent Runs — executes whatever the user explicitly approved
// via "Schedule for tomorrow" (mission-card.tsx / api/mission/schedule-step)
// once its scheduled day has arrived. This is NOT an autonomous agent
// deciding what to do — every row here is a specific action a human
// already picked; this route's only job is running it a day later than
// they clicked it, with a credit check first.
//
// If CRON_SECRET is set, callers must send it as `Authorization: Bearer
// <CRON_SECRET>` (the header Vercel Cron sends automatically when a cron
// job has a secret configured) — same convention as
// api/cron/reset-credits and api/weekly-digest.
export async function GET(request: Request) {
  try {
    const secret = process.env.CRON_SECRET;
    if (secret) {
      const authHeader = request.headers.get("authorization");
      if (authHeader !== `Bearer ${secret}`) {
        return NextResponse.json({ ok: false, error: "Unauthorized." }, { status: 401 });
      }
    }

    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      return NextResponse.json(
        { ok: false, error: "ANTHROPIC_API_KEY is not configured on the server." },
        { status: 500 }
      );
    }

    const admin = createAdminClient();
    const today = new Date().toISOString().slice(0, 10);

    const { data: dueRuns, error: dueError } = await admin
      .from("scheduled_agent_runs")
      .select("*")
      .eq("status", "pending")
      .lte("scheduled_for", today)
      .order("created_at", { ascending: true });

    if (dueError) {
      logApiError("/api/cron/scheduled-runs", dueError, { stage: "load_due_runs" });
      return NextResponse.json({ ok: false, error: dueError.message }, { status: 500 });
    }

    const runsByUser = new Map<string, ScheduledAgentRun[]>();
    for (const run of (dueRuns as ScheduledAgentRun[] | null) ?? []) {
      const list = runsByUser.get(run.user_id) ?? [];
      list.push(run);
      runsByUser.set(run.user_id, list);
    }

    let completed = 0;
    let failed = 0;
    let deferred = 0;

    for (const [userId, allDueForUser] of runsByUser) {
      // The safety cap: only the first MAX_RUNS_PER_USER_PER_DAY (oldest
      // first) are processed this invocation — the rest stay untouched
      // ('pending', scheduled_for unchanged), so tomorrow's run picks them
      // up first again, same FIFO fairness for every user regardless of
      // how many they've queued up.
      const toProcess = allDueForUser.slice(0, MAX_RUNS_PER_USER_PER_DAY);
      deferred += allDueForUser.length - toProcess.length;
      if (toProcess.length === 0) continue;

      const { data: authUser, error: authUserError } = await admin.auth.admin.getUserById(userId);
      if (authUserError || !authUser?.user) {
        logApiError("/api/cron/scheduled-runs", authUserError, { stage: "load_auth_user", userId });
        continue;
      }
      const user = authUser.user;
      const isAdmin = isAdminEmail(user.email);
      const bypassCredits = isAdmin || (await hasActiveBetaBypass(user));
      const plan = bypassCredits ? null : await resolveEffectivePlan(user);

      for (const run of toProcess) {
        // Read-only check first — never call the AI, never touch the
        // mission, if there obviously isn't enough balance. Same
        // check-then-call-then-deduct shape as every other AI-calling
        // endpoint in this app.
        if (!bypassCredits && plan) {
          const check = await hasEnoughCredits(userId, CREDIT_COSTS.createAnything, plan);
          if (!check.ok) {
            await admin
              .from("scheduled_agent_runs")
              .update({ status: "failed", result: "insufficient_credits", executed_at: new Date().toISOString() })
              .eq("id", run.id);
            failed++;
            void sendScheduledRunCompleteEmail({
              email: user.email ?? "",
              stepText: run.step_text,
              succeeded: false,
              detail: "Not enough credits — top up or upgrade your plan, then schedule it again.",
            });
            continue;
          }
        }

        const { data: mission, error: missionError } = await admin
          .from("ai_missions")
          .select("*")
          .eq("id", run.mission_id)
          .maybeSingle();

        if (missionError || !mission) {
          await admin
            .from("scheduled_agent_runs")
            .update({ status: "failed", result: "Mission no longer exists.", executed_at: new Date().toISOString() })
            .eq("id", run.id);
          failed++;
          continue;
        }

        const typedMission = mission as Mission;
        const steps = typedMission.plan_steps?.steps ?? [];
        const step = steps[run.step_index];
        // The step may have already been completed manually (or its own
        // scheduled run already ran) between scheduling and today — a
        // no-op, not a re-run, same idempotency-guard spirit as
        // api/websites/generate/process's status check.
        if (!step || step.status === "completed") {
          await admin
            .from("scheduled_agent_runs")
            .update({ status: "completed", result: "Already completed.", executed_at: new Date().toISOString() })
            .eq("id", run.id);
          completed++;
          continue;
        }

        // Circuit breaker: independent of credits (see lib/ai-circuit-breaker.ts)
        // — a cron-triggered AI call is just as capable of runaway volume
        // as a live user request, so it's gated the same way.
        const breakerCheck = await checkAiCallAllowed(
          userId,
          "scheduled_run",
          fingerprintRequest(run.mission_id, run.step_index, run.step_text)
        );
        if (!breakerCheck.allowed) {
          await admin
            .from("scheduled_agent_runs")
            .update({ status: "failed", result: breakerCheck.reason, executed_at: new Date().toISOString() })
            .eq("id", run.id);
          failed++;
          void sendScheduledRunCompleteEmail({
            email: user.email ?? "",
            stepText: run.step_text,
            succeeded: false,
            detail: breakerCheck.reason,
          });
          continue;
        }

        const priorContext = buildPriorStepsContext(steps, run.step_index);
        void recordAiCallForDailySpend(CREDIT_COSTS.createAnything);
        const result = await runMissionStepForUser(apiKey, admin, userId, run.step_text, run.agent_role, priorContext);

        if (!result.ok) {
          await admin
            .from("scheduled_agent_runs")
            .update({ status: "failed", result: result.error, executed_at: new Date().toISOString() })
            .eq("id", run.id);
          failed++;
          void sendScheduledRunCompleteEmail({
            email: user.email ?? "",
            stepText: run.step_text,
            succeeded: false,
            detail: result.error,
          });
          continue;
        }

        if (!result.matched) {
          await admin
            .from("scheduled_agent_runs")
            .update({ status: "failed", result: result.message, executed_at: new Date().toISOString() })
            .eq("id", run.id);
          failed++;
          void sendScheduledRunCompleteEmail({
            email: user.email ?? "",
            stepText: run.step_text,
            succeeded: false,
            detail: result.message,
          });
          continue;
        }

        // Confirmed success (a real record was inserted) — write the
        // completed step back into the mission first, THEN deduct
        // credits, same "deduct only after the durable save succeeded"
        // standard as every other AI-calling route in this app.
        const nextSteps = steps.map((s, i) =>
          i === run.step_index
            ? {
                ...s,
                status: "completed" as const,
                module: result.module,
                moduleTitle: result.moduleTitle,
                href: result.href,
                agentRole: run.agent_role,
                output: result.outputSummary,
              }
            : s
        );
        await admin
          .from("ai_missions")
          .update({
            plan_steps: { ...typedMission.plan_steps, steps: nextSteps },
            status: typedMission.status === "planning" ? "in_progress" : typedMission.status,
          })
          .eq("id", run.mission_id);

        if (!bypassCredits && plan) {
          await deductCredits(userId, CREDIT_COSTS.createAnything, "create_anything", "Scheduled agent run", plan);
        }

        await admin
          .from("scheduled_agent_runs")
          .update({ status: "completed", result: result.outputSummary, executed_at: new Date().toISOString() })
          .eq("id", run.id);
        completed++;
        void sendScheduledRunCompleteEmail({
          email: user.email ?? "",
          stepText: run.step_text,
          succeeded: true,
          detail: result.outputSummary,
        });
      }
    }

    // Phase 2 — Real Automations (user_automations). Same cron invocation,
    // deliberately not a separate cron job (the brief is explicit: extend
    // the existing one). Unlike scheduled_agent_runs, these are recurring —
    // every automation ends this loop with a fresh next_run_at instead of
    // being consumed, whatever the outcome, so it always re-enters next
    // cycle rather than getting stuck retrying the same day.
    const nowIso = new Date().toISOString();
    const { data: dueAutomations, error: dueAutomationsError } = await admin
      .from("user_automations")
      .select("*")
      .eq("is_active", true)
      .lte("next_run_at", nowIso)
      .order("created_at", { ascending: true });

    if (dueAutomationsError) {
      logApiError("/api/cron/scheduled-runs", dueAutomationsError, { stage: "load_due_automations" });
      return NextResponse.json({ ok: true, completed, failed, deferred });
    }

    const automationsByUser = new Map<string, UserAutomation[]>();
    for (const automation of (dueAutomations as UserAutomation[] | null) ?? []) {
      const list = automationsByUser.get(automation.user_id) ?? [];
      list.push(automation);
      automationsByUser.set(automation.user_id, list);
    }

    let automationsCompleted = 0;
    let automationsFailed = 0;

    for (const [userId, dueForUser] of automationsByUser) {
      const { data: authUser, error: authUserError } = await admin.auth.admin.getUserById(userId);
      if (authUserError || !authUser?.user) {
        logApiError("/api/cron/scheduled-runs", authUserError, { stage: "load_auth_user_automation", userId });
        continue;
      }
      const user = authUser.user;
      const isAdmin = isAdminEmail(user.email);
      const bypassCredits = isAdmin || (await hasActiveBetaBypass(user));
      const plan = bypassCredits ? null : await resolveEffectivePlan(user);

      for (const automation of dueForUser) {
        const advancedNextRunAt = computeNextRunAt(
          automation.frequency,
          new Date(),
          automation.day_of_week,
          automation.day_of_month
        ).toISOString();

        if (!bypassCredits && plan) {
          const check = await hasEnoughCredits(userId, CREDIT_COSTS.createAnything, plan);
          if (!check.ok) {
            await admin
              .from("user_automations")
              .update({ next_run_at: advancedNextRunAt })
              .eq("id", automation.id);
            automationsFailed++;
            void sendScheduledRunCompleteEmail({
              email: user.email ?? "",
              stepText: automation.description,
              succeeded: false,
              detail: "Not enough credits — top up or upgrade your plan. This automation will try again next cycle.",
            });
            continue;
          }
        }

        // Circuit breaker: independent of credits (see lib/ai-circuit-breaker.ts).
        const breakerCheck = await checkAiCallAllowed(
          userId,
          "automation_run",
          fingerprintRequest(automation.id, automation.description)
        );
        if (!breakerCheck.allowed) {
          await admin
            .from("user_automations")
            .update({ next_run_at: advancedNextRunAt })
            .eq("id", automation.id);
          automationsFailed++;
          void sendScheduledRunCompleteEmail({
            email: user.email ?? "",
            stepText: automation.description,
            succeeded: false,
            detail: breakerCheck.reason,
          });
          continue;
        }

        void recordAiCallForDailySpend(CREDIT_COSTS.createAnything);
        const result = await runMissionStepForUser(apiKey, admin, userId, automation.description, "general", "");

        if (!result.ok || !result.matched) {
          await admin
            .from("user_automations")
            .update({ next_run_at: advancedNextRunAt })
            .eq("id", automation.id);
          automationsFailed++;
          void sendScheduledRunCompleteEmail({
            email: user.email ?? "",
            stepText: automation.description,
            succeeded: false,
            detail: result.ok ? result.message : result.error,
          });
          continue;
        }

        // Confirmed success — runMissionStepForUser already durably saved
        // the record, so credits are deducted after that, then the
        // automation is advanced to its next cycle.
        if (!bypassCredits && plan) {
          await deductCredits(userId, CREDIT_COSTS.createAnything, "create_anything", "Automation run", plan);
        }

        await admin
          .from("user_automations")
          .update({ last_run_at: new Date().toISOString(), next_run_at: advancedNextRunAt })
          .eq("id", automation.id);
        automationsCompleted++;
        void sendScheduledRunCompleteEmail({
          email: user.email ?? "",
          stepText: automation.description,
          succeeded: true,
          detail: result.outputSummary,
        });
      }
    }

    return NextResponse.json({
      ok: true,
      completed,
      failed,
      deferred,
      automationsCompleted,
      automationsFailed,
    });
  } catch (err) {
    logApiError("/api/cron/scheduled-runs", err);
    return NextResponse.json({ ok: false, error: "Something went wrong." }, { status: 500 });
  }
}
