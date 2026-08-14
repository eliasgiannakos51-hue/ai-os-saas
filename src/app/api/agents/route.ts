import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { isAdminEmail } from "@/lib/admin";
import { resolveEffectivePlanSlug } from "@/lib/billing/credits";
import { checkRateLimit } from "@/lib/rate-limit";
import { logApiError } from "@/lib/log-error";
import { logSecurityCheck } from "@/lib/security-check-log";
import { validateAgentDraft, sanitiseAgentText, type AgentDraft } from "@/lib/agents/agent-config";
import { resolveDeliveryOwnership } from "@/lib/agents/delivery-ownership";
import { nextRunAt } from "@/lib/agents/cron-expression";
import { maxAgentsForPlan } from "@/lib/agents/agent-limits";

export const dynamic = "force-dynamic";

// Creates the agent the user confirmed on the preview screen.
//
// Makes NO AI call and charges nothing: the design call already happened
// and was already settled in /api/agents/build. This route's whole job is
// to validate the draft a second time (a client-side check is never a
// boundary), enforce the per-plan cap, and write the row.
export async function POST(request: Request) {
  try {
    let draft: Partial<AgentDraft>;
    try {
      const body = await request.json();
      draft = (body?.draft ?? {}) as Partial<AgentDraft>;
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
      scope: "agent_create",
      identifier: user.id,
      maxAttempts: 20,
      windowMinutes: 60,
    });
    if (!limited.allowed) {
      return NextResponse.json(
        { ok: false, error: "Too many agents created in the last hour. Try again shortly." },
        { status: 429 }
      );
    }

    // WHERE THIS USER IS ALLOWED TO SEND, resolved SERVER-SIDE from their
    // own rows and handed to the validator. Nothing here comes from the
    // request body — that is the entire ownership guarantee: a Slack
    // channel id, a Telegram chat or a Discord webhook in the body can
    // only be accepted if the caller's own connection actually offers it.
    //
    // Fetched per channel, so an email agent still costs no extra call.
    const ownership = await resolveDeliveryOwnership(user.id, draft.deliveryMethod);
    if (!ownership.ok) {
      return NextResponse.json({ ok: false, error: ownership.message }, { status: 400 });
    }

    const validated = validateAgentDraft(draft, user.email, ownership.context);
    if (!validated.ok) {
      return NextResponse.json(
        { ok: false, error: validated.issues[0]?.message ?? "That agent isn't valid.", issues: validated.issues },
        { status: 400 }
      );
    }
    const agent = validated.draft;

    const isAdmin = isAdminEmail(user.email);
    const planSlug = await resolveEffectivePlanSlug(user);
    const cap = maxAgentsForPlan(planSlug);

    if (!isAdmin) {
      if (cap <= 0) {
        return NextResponse.json(
          { ok: false, upgradeRequired: true, error: "Autonomous agents are available on paid plans." },
          { status: 403 }
        );
      }
      // Counted through the user-scoped client, so RLS scopes it to this
      // user's own rows — the count cannot be influenced by anyone else's.
      const { count, error: countError } = await supabase
        .from("user_agents")
        .select("id", { count: "exact", head: true })
        .eq("user_id", user.id);
      if (countError) {
        logApiError("/api/agents", countError, { stage: "count_agents" });
        return NextResponse.json({ ok: false, error: "Could not check your agent limit." }, { status: 500 });
      }
      if ((count ?? 0) >= cap) {
        return NextResponse.json(
          {
            ok: false,
            limitReached: true,
            error: `You've reached your plan's limit of ${cap} agents — delete one or upgrade to add another.`,
          },
          { status: 403 }
        );
      }
    }

    const next = nextRunAt(agent.scheduleCron, new Date(), agent.timezone);
    if (!next) {
      return NextResponse.json(
        { ok: false, error: "That schedule never fires — pick a different one." },
        { status: 400 }
      );
    }

    // Idempotency guard — a double-submit of "Create" would otherwise
    // produce two identical agents both emailing the user forever. Same
    // two-minute window as api/automations/create.
    const twoMinutesAgo = new Date(Date.now() - 2 * 60 * 1000).toISOString();
    const { data: recentDuplicate } = await supabase
      .from("user_agents")
      .select("*")
      .eq("user_id", user.id)
      .eq("name", agent.name)
      .eq("schedule_cron", agent.scheduleCron)
      .gte("created_at", twoMinutesAgo)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (recentDuplicate) {
      return NextResponse.json({ ok: true, agent: recentDuplicate, duplicateSuppressed: true });
    }

    const { data: created, error: insertError } = await supabase
      .from("user_agents")
      .insert({
        user_id: user.id,
        name: agent.name,
        description: agent.description || null,
        prompt: agent.prompt,
        schedule_cron: agent.scheduleCron,
        timezone: agent.timezone,
        delivery_method: agent.deliveryMethod,
        delivery_target: agent.deliveryTarget,
        status: "active",
        config: agent.config,
        next_run_at: next.toISOString(),
      })
      .select()
      .single();

    if (insertError || !created) {
      logApiError("/api/agents", insertError, { stage: "insert" });
      return NextResponse.json({ ok: false, error: "Could not save the agent." }, { status: 500 });
    }

    // AI Output Protection Layer record. What was actually checked, named
    // honestly: the harmful/unsupervised-agent safety check that runs
    // inside the shared clarification pre-check, the instruction-override
    // sanitisation applied to the stored prompt, and the delivery-target
    // restriction.
    const { neutralised } = sanitiseAgentText(agent.prompt);
    void logSecurityCheck(supabase, {
      userId: user.id,
      resourceType: "agent",
      resourceId: created.id,
      result: {
        passed: true,
        checks: [
          "harmful/unsupervised-agent safety check (clarification pre-check, kind=agent)",
          "prompt-injection sanitisation of the stored task text",
          agent.deliveryMethod === "slack"
            ? "delivery target restricted to a channel in the user's own connected Slack workspace"
            : "delivery target restricted to the account's own email address",
          "schedule validated (max one run per hour)",
        ],
        issues:
          neutralised > 0
            ? [`${neutralised} instruction-override phrase(s) neutralised in the task text`]
            : [],
      },
    });

    return NextResponse.json({ ok: true, agent: created });
  } catch (err) {
    logApiError("/api/agents", err);
    return NextResponse.json({ ok: false, error: "Something went wrong." }, { status: 500 });
  }
}
