import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { logApiError } from "@/lib/log-error";
import { checkRateLimit } from "@/lib/rate-limit";
import {
  AGENT_LIMITS,
  sanitiseAgentText,
  isAgentOutputFormat,
  isAgentDeliveryMethod,
  isSlackChannelAllowed,
  normaliseSlackChannel,
  normaliseDeliveryTarget,
  isDeliveryTargetAllowed,
  type UserAgent,
} from "@/lib/agents/agent-config";
import { listSlackChannels } from "@/lib/integrations/read";
import { validateAgentCron, isValidTimeZone, nextRunAt } from "@/lib/agents/cron-expression";

export const dynamic = "force-dynamic";

// Pause / resume / edit / delete for one agent.
//
// OWNERSHIP, not just authentication: every query below goes through the
// user-scoped client, so RLS (select/update/delete_own_user_agents) scopes
// it to the caller's own rows. A stranger's id is simply not found —
// there is no code path where an id from the request body selects the row
// that gets written.

type PatchBody = {
  name?: unknown;
  description?: unknown;
  prompt?: unknown;
  scheduleCron?: unknown;
  timezone?: unknown;
  status?: unknown;
  needsWebSearch?: unknown;
  outputFormat?: unknown;
  deliveryMethod?: unknown;
  deliveryTarget?: unknown;
};

export async function PATCH(request: Request, { params }: { params: { id: string } }) {
  try {
    const agentId = params.id;
    if (!agentId) {
      return NextResponse.json({ ok: false, error: "Missing agent id." }, { status: 400 });
    }

    let body: PatchBody;
    try {
      body = (await request.json()) as PatchBody;
    } catch {
      return NextResponse.json({ ok: false, error: "Invalid request body." }, { status: 400 });
    }

    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ ok: false, error: "Not authenticated." }, { status: 401 });
    }

    const limited = await checkRateLimit({
      scope: "agent_update",
      identifier: user.id,
      maxAttempts: 60,
      windowMinutes: 60,
    });
    if (!limited.allowed) {
      return NextResponse.json({ ok: false, error: "Too many changes — try again shortly." }, { status: 429 });
    }

    const { data: existing, error: fetchError } = await supabase
      .from("user_agents")
      .select("*")
      .eq("id", agentId)
      .maybeSingle();

    if (fetchError || !existing) {
      return NextResponse.json({ ok: false, error: "Agent not found." }, { status: 404 });
    }
    const agent = existing as UserAgent;

    const updates: Record<string, unknown> = {};

    if (typeof body.name === "string") {
      const name = body.name.trim();
      if (!name || name.length > AGENT_LIMITS.name) {
        return NextResponse.json({ ok: false, error: "That name isn't valid." }, { status: 400 });
      }
      updates.name = name;
    }

    if (typeof body.description === "string") {
      const description = body.description.trim();
      if (description.length > AGENT_LIMITS.description) {
        return NextResponse.json({ ok: false, error: "That description is too long." }, { status: 400 });
      }
      updates.description = description || null;
    }

    if (typeof body.prompt === "string") {
      const raw = body.prompt.trim();
      if (!raw || raw.length > AGENT_LIMITS.prompt) {
        return NextResponse.json({ ok: false, error: "That task isn't valid." }, { status: 400 });
      }
      // Re-sanitised on every edit: an override phrase added later is
      // exactly as dangerous as one present at creation.
      updates.prompt = sanitiseAgentText(raw).text.slice(0, AGENT_LIMITS.prompt);
    }

    // Anything that changes WHEN it runs has to recompute next_run_at in
    // the same write — a schedule the user changed and a next_run_at from
    // the old one is an agent that visibly fires at the wrong time.
    let scheduleChanged = false;
    let scheduleCron = agent.schedule_cron;
    let timezone = agent.timezone;

    if (typeof body.scheduleCron === "string") {
      const candidate = body.scheduleCron.trim();
      const check = validateAgentCron(candidate);
      if (!check.ok) return NextResponse.json({ ok: false, error: check.error }, { status: 400 });
      scheduleCron = candidate;
      updates.schedule_cron = candidate;
      scheduleChanged = true;
    }

    if (typeof body.timezone === "string") {
      const candidate = body.timezone.trim();
      if (!isValidTimeZone(candidate)) {
        return NextResponse.json({ ok: false, error: "That is not a recognised timezone." }, { status: 400 });
      }
      timezone = candidate;
      updates.timezone = candidate;
      scheduleChanged = true;
    }

    // Only the two states a user can choose. 'disabled' is set by the
    // system after repeated failures and is cleared by resuming, which is
    // an 'active' write — so a client can never put an agent INTO the
    // disabled state and fake a failure history.
    let statusChanged = false;
    let status = agent.status;
    if (body.status === "active" || body.status === "paused") {
      status = body.status;
      updates.status = status;
      statusChanged = true;
      // Resuming clears the streak: the user has looked at it and decided
      // it is fine, so it gets a full five attempts again rather than
      // disabling itself on the next single failure.
      if (status === "active" && agent.consecutive_failures > 0) updates.consecutive_failures = 0;
    } else if (body.status !== undefined) {
      return NextResponse.json({ ok: false, error: "Invalid status." }, { status: 400 });
    }

    // Changing WHERE an agent sends goes through the same server-side
    // ownership proof as creating one: the channel must be in the caller's
    // own connected workspace, resolved here and never taken from the body.
    // Leaving this out was the quiet gap — an agent created for email could
    // otherwise never be pointed at Slack, and a half-implemented PATCH
    // that accepted the field without the check would be worse than either.
    if (body.deliveryMethod !== undefined || body.deliveryTarget !== undefined) {
      const method = body.deliveryMethod === undefined ? agent.delivery_method : body.deliveryMethod;
      if (!isAgentDeliveryMethod(method)) {
        return NextResponse.json({ ok: false, error: "That delivery method is not available." }, { status: 400 });
      }

      if (method === "slack") {
        const channel = normaliseSlackChannel(
          typeof body.deliveryTarget === "string" ? body.deliveryTarget : agent.delivery_target
        );
        const channels = await listSlackChannels(user.id);
        if (!channels.ok) {
          return NextResponse.json(
            { ok: false, error: "Connect Slack in Integrations before an agent can post to it." },
            { status: 400 }
          );
        }
        if (!isSlackChannelAllowed(channel, channels.channels.map((c) => c.id))) {
          return NextResponse.json(
            { ok: false, error: "An agent can only post to a channel in your own connected Slack workspace." },
            { status: 400 }
          );
        }
        updates.delivery_method = "slack";
        updates.delivery_target = channel;
      } else {
        const target = normaliseDeliveryTarget(
          typeof body.deliveryTarget === "string" && body.deliveryTarget.trim()
            ? body.deliveryTarget
            : user.email
        );
        if (!isDeliveryTargetAllowed(target, user.email)) {
          return NextResponse.json(
            { ok: false, error: "An agent can only send results to your own account email address." },
            { status: 400 }
          );
        }
        updates.delivery_method = "email";
        updates.delivery_target = target;
      }
    }

    if (body.needsWebSearch !== undefined || body.outputFormat !== undefined) {
      updates.config = {
        ...agent.config,
        ...(body.needsWebSearch !== undefined ? { needsWebSearch: body.needsWebSearch === true } : {}),
        ...(isAgentOutputFormat(body.outputFormat) ? { outputFormat: body.outputFormat } : {}),
      };
    }

    if (scheduleChanged || statusChanged) {
      if (status === "active") {
        const next = nextRunAt(scheduleCron, new Date(), timezone);
        if (!next) {
          return NextResponse.json(
            { ok: false, error: "That schedule never fires — pick a different one." },
            { status: 400 }
          );
        }
        updates.next_run_at = next.toISOString();
      } else {
        // Paused/disabled agents carry no next_run_at at all, so the
        // cron's `next_run_at <= now()` query cannot pick them up even if
        // the status filter were ever wrong.
        updates.next_run_at = null;
      }
    }

    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ ok: true, agent });
    }

    const { data: updated, error: updateError } = await supabase
      .from("user_agents")
      .update(updates)
      .eq("id", agentId)
      .select()
      .single();

    if (updateError || !updated) {
      logApiError("/api/agents/[id]", updateError, { stage: "update", agentId });
      return NextResponse.json({ ok: false, error: "Could not save that change." }, { status: 500 });
    }

    return NextResponse.json({ ok: true, agent: updated });
  } catch (err) {
    logApiError("/api/agents/[id]", err);
    return NextResponse.json({ ok: false, error: "Something went wrong." }, { status: 500 });
  }
}

export async function DELETE(_request: Request, { params }: { params: { id: string } }) {
  try {
    const agentId = params.id;
    if (!agentId) {
      return NextResponse.json({ ok: false, error: "Missing agent id." }, { status: 400 });
    }

    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ ok: false, error: "Not authenticated." }, { status: 401 });
    }

    // agent_runs cascades from user_agents, so the history goes with it.
    const { error, count } = await supabase
      .from("user_agents")
      .delete({ count: "exact" })
      .eq("id", agentId);

    if (error) {
      logApiError("/api/agents/[id]", error, { stage: "delete", agentId });
      return NextResponse.json({ ok: false, error: "Could not delete that agent." }, { status: 500 });
    }
    if ((count ?? 0) === 0) {
      return NextResponse.json({ ok: false, error: "Agent not found." }, { status: 404 });
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    logApiError("/api/agents/[id]", err);
    return NextResponse.json({ ok: false, error: "Something went wrong." }, { status: 500 });
  }
}
