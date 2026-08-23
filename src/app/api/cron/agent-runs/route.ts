import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { checkCronAuth } from "@/lib/cron-auth";
import { logApiError } from "@/lib/log-error";
import { drainDeferredNotifications } from "@/lib/notify/dispatch";
import { executeAgent, pauseAgentForNoCredits } from "@/lib/agents/execute-agent";
import { trySubmitAsBatch } from "@/lib/ai/batch/agent-batch";
import { batchEnabled } from "@/lib/ai/batch/batch-policy";
import { nextRunAt } from "@/lib/agents/cron-expression";
import type { UserAgent } from "@/lib/agents/agent-config";

export const dynamic = "force-dynamic";
export const maxDuration = 300; // @function-limit 300

// The Autonomous Agents execution engine.
//
// Runs every 15 minutes (vercel.json). It is NOT folded into the existing
// api/cron/scheduled-runs daily cron on purpose: that one fires once a day
// at a fixed UTC hour, and an agent whose whole point is "every morning,
// my time" cannot be served by a scheduler that only wakes up once a day
// in one timezone. A 15-minute tick plus per-agent timezone-aware
// next_run_at gives every user their own schedule.
//
// AUTH. CRON_SECRET via the shared fail-closed guard — the same one the
// other three scheduler routes use. Without a secret configured this route
// refuses to run on any deployment, because a single unauthenticated call
// would execute every due agent in the system on every user's credits.
//
// Per invocation this route can spend real money on many accounts, so
// every cost control is applied per agent, inside executeAgent: the
// per-user hourly execution cap, the AI circuit breaker, an affordability
// check, and a credit hold before the first token.

// A safety ceiling on ONE invocation, independent of everything else. If a
// backlog somehow builds (a long outage, a clock jump), this bounds the
// blast radius of the recovery: the rest keep their next_run_at in the
// past and are picked up by the following tick, in the same order.
const MAX_AGENTS_PER_INVOCATION = 40;
// Per user, per invocation. Stops one account with 50 agents from
// consuming an entire tick while everyone else waits.
const MAX_AGENTS_PER_USER_PER_INVOCATION = 5;
// A claim older than this belonged to an invocation that died — same
// mechanism and same window as user_automations' processing_started_at.
const STALE_CLAIM_MINUTES = 10;

export async function GET(request: Request) {
  try {
    const auth = checkCronAuth(request);
    if (!auth.ok) {
      return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });
    }

    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      return NextResponse.json(
        { ok: false, error: "ANTHROPIC_API_KEY is not configured on the server." },
        { status: 500 }
      );
    }

    const admin = createAdminClient();
    const nowIso = new Date().toISOString();

    const { data: dueAgents, error: dueError } = await admin
      .from("user_agents")
      .select("*")
      .eq("status", "active")
      .not("next_run_at", "is", null)
      .lte("next_run_at", nowIso)
      .order("next_run_at", { ascending: true })
      .limit(MAX_AGENTS_PER_INVOCATION);

    if (dueError) {
      logApiError("/api/cron/agent-runs", dueError, { stage: "load_due_agents" });
      return NextResponse.json({ ok: false, error: dueError.message }, { status: 500 });
    }

    const agents = (dueAgents as UserAgent[] | null) ?? [];

    // Fairness: oldest-due first within each user, at most N per user.
    const perUser = new Map<string, UserAgent[]>();
    for (const agent of agents) {
      const list = perUser.get(agent.user_id) ?? [];
      if (list.length >= MAX_AGENTS_PER_USER_PER_INVOCATION) continue;
      list.push(agent);
      perUser.set(agent.user_id, list);
    }

    let succeeded = 0;
    let failed = 0;
    let skipped = 0;
    let pausedForCredits = 0;
    let batched = 0;

    for (const [userId, userAgents] of perUser) {
      const { data: authUser, error: authUserError } = await admin.auth.admin.getUserById(userId);
      if (authUserError || !authUser?.user) {
        logApiError("/api/cron/agent-runs", authUserError, { stage: "load_auth_user", userId });
        skipped += userAgents.length;
        continue;
      }
      const user = authUser.user;

      for (const agent of userAgents) {
        // Atomic claim, so two overlapping invocations cannot both run the
        // same due agent — which would double-charge and double-email.
        const staleCutoff = new Date(Date.now() - STALE_CLAIM_MINUTES * 60 * 1000).toISOString();
        const { data: claimed } = await admin
          .from("user_agents")
          .update({ processing_started_at: new Date().toISOString() })
          .eq("id", agent.id)
          .or(`processing_started_at.is.null,processing_started_at.lt.${staleCutoff}`)
          .select("id");
        if (!claimed || claimed.length === 0) {
          skipped++;
          continue;
        }

        try {
          // THE CHEAP PATH (V4 #13), and it is unreachable unless an
          // operator turned it on: batchEnabled() is false by default, so
          // with no configuration this branch never executes and the tick
          // behaves exactly as it did before.
          //
          // trySubmitAsBatch decides for itself whether THIS agent
          // qualifies — scheduled, daily or slower, no web research, no
          // batch already in flight, affordable — and says why when it
          // does not. A queued agent is finished for this tick: its
          // result is collected by api/cron/agent-batches.
          if (batchEnabled(process.env)) {
            const queued = await trySubmitAsBatch({ admin, apiKey, user, agent });
            if (queued.queued) {
              // Rescheduled here rather than at collection: the agent's
              // NEXT run is a function of its schedule, not of when this
              // batch happens to come back. Skipping it would leave the
              // agent permanently due and re-submitting on every tick.
              const next = nextRunAt(agent.schedule_cron, new Date(), agent.timezone);
              await admin
                .from("user_agents")
                .update({ last_run_at: new Date().toISOString(), next_run_at: next?.toISOString() ?? null })
                .eq("id", agent.id);
              batched++;
              continue;
            }
          }

          const result = await executeAgent({
            admin,
            user,
            agent,
            triggerSource: "schedule",
            apiKey,
          });

          if (result.ok) {
            succeeded++;
            continue;
          }

          if (result.reason === "insufficient_credits") {
            // Auto-pause, per the brief. NOT a failure: the agent is fine,
            // the account is empty, and counting it toward the disable
            // streak would delete a working agent for a billing reason.
            await pauseAgentForNoCredits({ admin, userId, email: user.email ?? "", agent });
            pausedForCredits++;
            continue;
          }

          if (result.reason === "rate_limited" || result.reason === "circuit_breaker") {
            // Neither is the agent's fault, so neither counts as a
            // failure. Push next_run_at forward to its normal next slot so
            // the agent does not sit permanently due and re-enter this
            // branch on every single tick.
            const next = nextRunAt(agent.schedule_cron, new Date(), agent.timezone);
            await admin
              .from("user_agents")
              .update({ next_run_at: next?.toISOString() ?? null })
              .eq("id", agent.id);
            skipped++;
            continue;
          }

          failed++;
        } catch (err) {
          // One agent's unhandled failure must not stop the tick — the
          // remaining users' agents are still due.
          logApiError("/api/cron/agent-runs", err, { stage: "execute", agentId: agent.id });
          failed++;
        } finally {
          const { error: releaseError } = await admin
            .from("user_agents")
            .update({ processing_started_at: null })
            .eq("id", agent.id);
          if (releaseError) {
            logApiError("/api/cron/agent-runs", releaseError, {
              stage: "release_claim",
              agentId: agent.id,
            });
          }
        }
      }
    }

    // Housekeeping: a run row still 'running' long after any possible
    // maxDuration belonged to an invocation the platform killed. Left
    // alone it shows in the user's history as permanently in progress.
    //
    // 'running' EXACTLY, never "anything unfinished". A batched run sits
    // at 'queued' for up to 24 hours by design, and widening this filter
    // to catch it would close every outstanding batch an hour after
    // submission — silently, on a schedule, for every user at once.
    // api/cron/agent-batches owns expiry for those (batchHasExpired).
    const stuckCutoff = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    const { error: stuckError, count: stuckCount } = await admin
      .from("agent_runs")
      .update(
        {
          status: "failed",
          finished_at: new Date().toISOString(),
          error: "The run was interrupted and did not finish.",
        },
        { count: "exact" }
      )
      .eq("status", "running")
      .lt("started_at", stuckCutoff);
    if (stuckError) {
      logApiError("/api/cron/agent-runs", stuckError, { stage: "sweep_stuck_runs" });
    }

    // THE OTHER HALF OF QUIET HOURS (V4 #18). A notification held
    // overnight is only "deferred" rather than "dropped" if something
    // later picks it up, and this is the only sweep that runs often
    // enough for a window that ends at 08:00 to mean 08:00 rather than
    // "some time tomorrow". It rides on this cron instead of taking its
    // own schedule slot because it is a few hundred milliseconds of work
    // and a ninth cron entry is a platform limit somebody hits later.
    let deferredNotifications = { examined: 0, sent: 0 };
    try {
      deferredNotifications = await drainDeferredNotifications();
    } catch (drainError) {
      logApiError("/api/cron/agent-runs", drainError, { stage: "drain_deferred_notifications" });
    }

    return NextResponse.json({
      ok: true,
      due: agents.length,
      succeeded,
      failed,
      skipped,
      pausedForCredits,
      batched,
      stuckRunsClosed: stuckCount ?? 0,
      deferredNotifications,
    });
  } catch (err) {
    logApiError("/api/cron/agent-runs", err);
    return NextResponse.json({ ok: false, error: "Something went wrong." }, { status: 500 });
  }
}
