import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isAdminEmail } from "@/lib/auth/admin-emails";
import { hasActiveBetaBypass } from "@/lib/beta";
import { checkBypassCeiling } from "@/lib/billing/bypass-ceiling";
import {
  hasEnoughCredits,
  resolveEffectivePlan,
  resolveEffectivePlanSlug,
  getPurchasedPackCreditPriceEur,
} from "@/lib/billing/credits";
import { estimateForAction } from "@/lib/billing/estimate";
import { resolvePricingConfig } from "@/lib/billing/pricing-config";
import { effectiveCreditPriceEurForAccount } from "@/lib/billing/credit-formula";
import { CostAccumulator } from "@/lib/billing/cost-accumulator";
import { reserveCredits, settleReservation, releaseReservation } from "@/lib/billing/reservations";
import { buildUsageReceipt } from "@/lib/billing/usage-receipt";
import { checkAiCallAllowed, fingerprintRequest } from "@/lib/ai-circuit-breaker";
import { checkRateLimit } from "@/lib/rate-limit";
import { logApiError } from "@/lib/log-error";
import { validateAgentDraft, type AgentDraft } from "@/lib/agents/agent-config";
import { resolveDeliveryOwnership } from "@/lib/agents/delivery-ownership";
import { isValidTimeZone, nextRunAt, UNSCHEDULABLE_MESSAGE } from "@/lib/agents/cron-expression";
import { maxAgentsForAccount } from "@/lib/agents/agent-limits";
import { checkAgentActivationCap } from "@/lib/agents/agent-cap";
import { parseAgentDepth, TEMPLATE_FILL_MODEL } from "@/lib/agents/agent-depth";
import { fillTemplate, TEMPLATE_SLOT } from "@/lib/agents/agent-templates";
import { fillTemplateFromRequest } from "@/lib/agents/template-fill";

export const dynamic = "force-dynamic";
export const maxDuration = 60; // @function-limit 60

/**
 * "USE THIS ONE" — a ready-made agent, created in one step.
 *
 * WHAT MAKES IT CHEAP, precisely: the full builder is a Sonnet tool call
 * that decides ten fields. Here the template already decided the task,
 * the schedule, the search flag, the output shape and the depth. The only
 * unknowns are what the user wants it pointed at and what to call it in
 * their language — one Haiku call with a ~500-token system prompt.
 *
 * The saving is real work not done, not a discount applied to the same
 * work: that is what keeps the margin identical to every other AI call
 * here rather than thinner. See scripts/tests/agent-depth.test.mjs.
 *
 * IT DEGRADES INSTEAD OF FAILING. With no ANTHROPIC_API_KEY, or if the
 * fill call throws, the agent is still created — from the user's own text
 * as the subject and the template's own title — and NOTHING IS CHARGED,
 * because nothing was spent. A library that only works when the AI
 * service does is a library that is unavailable exactly when the builder
 * is too.
 */
export async function POST(request: Request) {
  try {
    let slug: string;
    let userRequest: string;
    let subjectOverride: string;
    let timezone: string;
    try {
      const body = await request.json();
      slug = typeof body?.slug === "string" ? body.slug.trim().slice(0, 80) : "";
      userRequest = typeof body?.request === "string" ? body.request.trim().slice(0, 2000) : "";
      // The user may type the subject themselves — the create screen
      // shows it as an editable field after the fill, and a second
      // adoption of the same template needs no model call at all.
      subjectOverride = typeof body?.subject === "string" ? body.subject.trim().slice(0, 200) : "";
      timezone = typeof body?.timezone === "string" ? body.timezone.trim() : "UTC";
    } catch {
      return NextResponse.json({ ok: false, error: "Invalid request body." }, { status: 400 });
    }

    if (!slug) return NextResponse.json({ ok: false, error: "Missing template." }, { status: 400 });
    if (!subjectOverride && !userRequest) {
      return NextResponse.json(
        { ok: false, error: "Say what this agent should be about." },
        { status: 400 }
      );
    }

    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ ok: false, error: "Not authenticated." }, { status: 401 });

    const limited = await checkRateLimit({
      scope: "agent_template_adopt",
      identifier: user.id,
      maxAttempts: 20,
      windowMinutes: 60,
    });
    if (!limited.allowed) {
      return NextResponse.json(
        { ok: false, code: "rate_limited", error: "Too many agents created in the last hour. Try again shortly." },
        { status: 429 }
      );
    }

    // READ THROUGH THE CALLER'S OWN CLIENT, so the select policy decides
    // which templates exist for them.
    const { data: template, error: templateError } = await supabase
      .from("agent_templates")
      .select("slug, title, description, task_pattern, schedule_cron, depth, needs_web_search, output_format")
      .eq("slug", slug)
      .maybeSingle();
    if (templateError || !template) {
      return NextResponse.json({ ok: false, error: "That template no longer exists." }, { status: 404 });
    }

    // THE PLAN CAP, BEFORE ANY MONEY IS SPENT. Adopting is creating, and
    // a user at their cap must not pay for a fill call that cannot become
    // an agent.
    const planSlug = await resolveEffectivePlanSlug(user);
    const cap = isAdminEmail(user.email)
      ? Number.POSITIVE_INFINITY
      : await maxAgentsForAccount(user.id, planSlug);
    const capCheck = await checkAgentActivationCap(user.id, cap);
    if (!capCheck.ok) {
      return NextResponse.json({ ok: false, code: capCheck.reason, error: capCheck.message }, { status: 403 });
    }

    const isAdmin = isAdminEmail(user.email);
    const bypassCredits = isAdmin || (await hasActiveBetaBypass(user));
    if (bypassCredits) {
      const ceiling = await checkBypassCeiling(user.id, isAdmin, bypassCredits && !isAdmin);
      if (!ceiling.allowed) {
        return NextResponse.json({ ok: false, error: ceiling.reason }, { status: 429 });
      }
    }

    const apiKey = process.env.ANTHROPIC_API_KEY;
    // NO MODEL CALL AT ALL when the user already typed the subject, or
    // when the service is not configured. Both paths charge nothing,
    // because nothing is spent.
    const needsFill = Boolean(apiKey) && !subjectOverride;

    const plan = await resolveEffectivePlan(user);
    const pricingConfig = resolvePricingConfig();
    const estimate = estimateForAction(
      "agentTemplateFill",
      { model: TEMPLATE_FILL_MODEL, inputChars: userRequest.length, planSlug: plan?.slug ?? null },
      pricingConfig,
      plan
        ? effectiveCreditPriceEurForAccount(plan, await getPurchasedPackCreditPriceEur(user.id), pricingConfig)
        : undefined
    );

    let reservationId = "";
    if (needsFill && !bypassCredits && plan) {
      const affordable = await hasEnoughCredits(user.id, estimate.reserveCredits, plan);
      if (!affordable.ok) {
        return NextResponse.json(
          { ok: false, insufficientCredits: true, error: "Not enough credits." },
          { status: 402 }
        );
      }
      const reservation = await reserveCredits(user.id, estimate.reserveCredits, "agent_build", {
        templateSlug: slug,
        estimatedCredits: estimate.estimatedCredits,
      });
      if (!reservation.ok) {
        return NextResponse.json(
          { ok: false, insufficientCredits: reservation.reason === "insufficient", error: "Could not reserve credits." },
          { status: 402 }
        );
      }
      reservationId = reservation.reservationId;
    }

    const costs = new CostAccumulator();
    let subject = subjectOverride;
    let name = String(template.title);
    let description = String(template.description ?? "");
    let language = "en";

    if (needsFill && apiKey) {
      const breaker = await checkAiCallAllowed(
        user.id,
        "agent_build",
        fingerprintRequest(slug, userRequest)
      );
      if (!breaker.allowed) {
        await releaseReservation(user.id, reservationId);
        return NextResponse.json({ ok: false, error: breaker.reason }, { status: 429 });
      }
      try {
        const filled = await fillTemplateFromRequest({
          apiKey,
          request: userRequest,
          templateTitle: String(template.title),
          templateDescription: String(template.description ?? ""),
          costs,
        });
        if (filled.ok) {
          subject = filled.fill.subject || userRequest.slice(0, 200);
          name = filled.fill.name;
          description = filled.fill.description;
          language = filled.fill.language;
        }
      } catch (err) {
        // NOT FATAL. The agent is still created from the user's own
        // words; the settlement below charges for the tokens that were
        // genuinely spent, which for a throw before any response is
        // nothing at all.
        logApiError("/api/agents/templates/adopt", err, { stage: "fill", slug });
      }
    }

    if (!subject) subject = userRequest.slice(0, 200);

    // THE TASK COMES FROM THE TEMPLATE, ALWAYS. The model filled a slot;
    // it did not write an instruction. This is what makes the
    // anonymisation guarantee a statement about the thing that actually
    // runs.
    const pattern = String(template.task_pattern);
    const prompt = fillTemplate(pattern, subject);

    // Email only. A template is a shape somebody else shared; it must
    // not carry a delivery channel, and adopting one must not quietly
    // point an agent at a Slack channel the adopter never chose.
    const ownership = await resolveDeliveryOwnership(user.id, "email");
    if (!ownership.ok) {
      await releaseReservation(user.id, reservationId);
      return NextResponse.json({ ok: false, error: ownership.message }, { status: 400 });
    }
    const draft: Partial<AgentDraft> = {
      name,
      description,
      prompt,
      scheduleCron: String(template.schedule_cron),
      timezone: isValidTimeZone(timezone) ? timezone : "UTC",
      deliveryMethod: "email",
      deliveryTarget: user.email ?? "",
      config: {
        needsWebSearch: template.needs_web_search === true,
        depth: parseAgentDepth(template.depth),
        outputFormat: (template.output_format as AgentDraft["config"]["outputFormat"]) ?? "summary",
        language,
        builderSummary: `From the "${template.title}" template.`,
      },
    };

    // VALIDATED LIKE ANY OTHER DRAFT. A template row is data too — it
    // carries a cron expression, and a bad one would schedule something
    // that never fires or fires constantly.
    const validated = validateAgentDraft(draft, user.email, ownership.context);
    if (!validated.ok) {
      await releaseReservation(user.id, reservationId);
      return NextResponse.json(
        { ok: false, error: "That template could not be turned into an agent.", issues: validated.issues },
        { status: 422 }
      );
    }

    // AN ACTIVE AGENT WITH NO next_run_at IS AN AGENT THAT NEVER RUNS.
    //
    // The dispatcher selects on `.not("next_run_at","is","null")`, and
    // nothing ever recomputes the column, so a null written here is
    // permanent — the row sits in the list looking active while the cron
    // can never see it. This used to be `?? null`, which turned a
    // schedule that could not be resolved into exactly that row, AFTER
    // the fill had been reserved for.
    //
    // validateAgentDraft above now rejects an impossible date through
    // validateAgentCron, and the timezone was normalised to UTC if it did
    // not parse, so reaching this branch means something changed that
    // this route has not been taught about. It refuses and releases the
    // reservation rather than charging for an agent that cannot run.
    const nextRun = nextRunAt(
      validated.draft.scheduleCron,
      new Date(),
      validated.draft.timezone
    );
    if (!nextRun) {
      await releaseReservation(user.id, reservationId);
      logApiError("/api/agents/templates/adopt", new Error("unresolvable_schedule"), {
        stage: "next_run_at",
        slug,
        scheduleCron: validated.draft.scheduleCron,
        timezone: validated.draft.timezone,
      });
      return NextResponse.json(
        { ok: false, error: UNSCHEDULABLE_MESSAGE },
        { status: 400 }
      );
    }

    const admin = createAdminClient();
    const { data: created, error: insertError } = await admin
      .from("user_agents")
      .insert({
        user_id: user.id,
        name: validated.draft.name,
        description: validated.draft.description,
        prompt: validated.draft.prompt,
        schedule_cron: validated.draft.scheduleCron,
        timezone: validated.draft.timezone,
        delivery_method: validated.draft.deliveryMethod,
        delivery_target: validated.draft.deliveryTarget,
        status: "active",
        config: validated.draft.config,
        next_run_at: nextRun.toISOString(),
      })
      .select("*")
      .maybeSingle();

    if (insertError || !created) {
      await releaseReservation(user.id, reservationId);
      logApiError("/api/agents/templates/adopt", insertError, { stage: "insert", slug });
      return NextResponse.json({ ok: false, error: "Could not create the agent." }, { status: 500 });
    }

    // SETTLED AFTER THE ROW EXISTS. Charging for a fill whose agent then
    // failed to insert is charging for nothing the user can see.
    let creditsCharged = 0;
    if (costs.callCount > 0) {
      const settlement = await settleReservation({
        userId: user.id,
        reservationId,
        feature: "agent_build",
        costs,
        plan,
        bypassCharge: bypassCredits || !plan,
        metadata: {
          templateSlug: slug,
          fromTemplate: true,
          agentId: created.id,
          estimatedCredits: estimate.estimatedCredits,
        },
      });
      creditsCharged = settlement.creditsCharged;
    } else if (reservationId) {
      await releaseReservation(user.id, reservationId);
    }

    // The counter moves only once the agent really exists. Best-effort:
    // a failed count must not fail an adoption.
    const { error: countError } = await admin.rpc("record_template_use", { p_slug: slug });
    if (countError) logApiError("/api/agents/templates/adopt", countError, { stage: "count", slug });

    return NextResponse.json({
      ok: true,
      agent: created,
      subject,
      // Echoed so the create screen can show what filled the slot and
      // offer to change it — a wrong subject is the one mistake this
      // path can make, and it must be visible.
      slot: TEMPLATE_SLOT,
      usage: buildUsageReceipt({ creditsCharged, bypass: bypassCredits, wouldHaveCharged: null }),
    });
  } catch (err) {
    logApiError("/api/agents/templates/adopt", err);
    return NextResponse.json({ ok: false, error: "Something went wrong." }, { status: 500 });
  }
}
