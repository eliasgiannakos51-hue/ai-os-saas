import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { isAdminEmail } from "@/lib/admin";
import { hasActiveBetaBypass } from "@/lib/beta";
import {
  hasEnoughCredits,
  resolveEffectivePlan,
  resolveEffectivePlanSlug,
  getPurchasedPackCreditPriceEur,
} from "@/lib/billing/credits";
import { CostAccumulator } from "@/lib/billing/cost-accumulator";
import { estimateForAction } from "@/lib/billing/estimate";
import { resolvePricingConfig } from "@/lib/billing/pricing-config";
import { effectiveCreditPriceEurForAccount } from "@/lib/billing/credit-formula";
import { reserveCredits, settleReservation } from "@/lib/billing/reservations";
import { checkAiCallAllowed, fingerprintRequest, recordAiCallForDailySpend } from "@/lib/ai-circuit-breaker";
import { checkRateLimit } from "@/lib/rate-limit";
import { checkNeedsClarification } from "@/lib/clarification";
import { logApiError } from "@/lib/log-error";
import { AGENT_BUILDER_MODEL } from "@/lib/agents/agent-models";
import { buildAgentFromRequest } from "@/lib/agents/agent-builder";
import { AGENT_LIMITS, normaliseDeliveryTarget } from "@/lib/agents/agent-config";
import { isValidTimeZone, nextRuns } from "@/lib/agents/cron-expression";
import { maxAgentsForPlan } from "@/lib/agents/agent-limits";
import { estimateAgentRun } from "@/lib/agents/execute-agent";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// The Agent Builder endpoint: one sentence in, a complete runnable
// configuration out. It CREATES NOTHING — the user sees a preview first
// and confirms it via POST /api/agents. Splitting build from create is
// what makes "the AI misunderstood me" a discarded draft rather than a
// scheduled thing quietly spending credits.
//
// Billing: two AI calls (the shared clarifying-questions pre-check and the
// builder itself), both recorded onto one CostAccumulator and settled once
// against a single reservation — margin-guaranteed like every other AI
// call in this app.
export async function POST(request: Request) {
  try {
    let userRequest: string;
    let skipClarification: boolean;
    let timezone: string;
    try {
      const body = await request.json();
      userRequest = typeof body?.request === "string" ? body.request.trim() : "";
      skipClarification = body?.skipClarification === true;
      timezone = typeof body?.timezone === "string" ? body.timezone.trim() : "UTC";
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

    // Input validation runs AFTER authentication, deliberately.
    //
    // The other order — which this route originally had — answers an
    // anonymous POST with 400 and a description of the size limits, so an
    // unauthenticated caller can map the endpoint's rules and, worse, the
    // route does work before it knows who is asking. 401 first is both the
    // less informative answer to a stranger and the cheaper one.
    if (!userRequest) {
      return NextResponse.json({ ok: false, error: "Describe what the agent should do." }, { status: 400 });
    }
    if (userRequest.length > AGENT_LIMITS.request) {
      return NextResponse.json(
        {
          ok: false,
          error: `That description is too long (${userRequest.length}/${AGENT_LIMITS.request} characters).`,
        },
        { status: 400 }
      );
    }
    if (!isValidTimeZone(timezone)) timezone = "UTC";

    const deliveryTarget = normaliseDeliveryTarget(user.email);
    if (!deliveryTarget) {
      return NextResponse.json(
        { ok: false, error: "Your account has no email address, so an agent has nowhere to send results." },
        { status: 400 }
      );
    }

    // Rate limit before anything costs money. Building is cheap but it is
    // still an Anthropic call per press of a button.
    const limited = await checkRateLimit({
      scope: "agent_build",
      identifier: user.id,
      maxAttempts: 20,
      windowMinutes: 60,
    });
    if (!limited.allowed) {
      return NextResponse.json(
        { ok: false, error: "Too many agent drafts in the last hour. Try again shortly." },
        { status: 429 }
      );
    }

    const isAdmin = isAdminEmail(user.email);
    const planSlug = await resolveEffectivePlanSlug(user);
    const agentCap = maxAgentsForPlan(planSlug);

    // Refuse before spending anything if this plan cannot own an agent at
    // all. Building a preview the user can never turn into an agent is a
    // charge for nothing.
    if (!isAdmin && agentCap <= 0) {
      return NextResponse.json(
        {
          ok: false,
          upgradeRequired: true,
          error: "Autonomous agents are available on paid plans.",
        },
        { status: 403 }
      );
    }
    if (!isAdmin) {
      const { count, error: countError } = await supabase
        .from("user_agents")
        .select("id", { count: "exact", head: true })
        .eq("user_id", user.id);
      if (countError) {
        logApiError("/api/agents/build", countError, { stage: "count_agents" });
        return NextResponse.json({ ok: false, error: "Could not check your agent limit." }, { status: 500 });
      }
      if ((count ?? 0) >= agentCap) {
        return NextResponse.json(
          {
            ok: false,
            limitReached: true,
            error: `You've reached your plan's limit of ${agentCap} agents — delete one or upgrade to add another.`,
          },
          { status: 403 }
        );
      }
    }

    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      return NextResponse.json(
        { ok: false, error: "The AI service is not configured on the server." },
        { status: 500 }
      );
    }

    const breaker = await checkAiCallAllowed(user.id, "agent_build", fingerprintRequest(userRequest));
    if (!breaker.allowed) {
      return NextResponse.json({ ok: false, error: breaker.reason }, { status: 429 });
    }

    const bypassCredits = isAdmin || (await hasActiveBetaBypass(user));
    const plan = await resolveEffectivePlan(user);
    const pricingConfig = resolvePricingConfig();
    const accountCreditPriceEur = bypassCredits
      ? pricingConfig.creditPriceEur
      : effectiveCreditPriceEurForAccount(
          plan,
          await getPurchasedPackCreditPriceEur(user.id),
          pricingConfig
        );
    const estimate = estimateForAction(
      "agentBuild",
      { model: AGENT_BUILDER_MODEL, inputChars: userRequest.length, planSlug: plan?.slug ?? null },
      pricingConfig,
      accountCreditPriceEur
    );

    if (!bypassCredits && plan) {
      const check = await hasEnoughCredits(user.id, estimate.reserveCredits, plan);
      if (!check.ok) {
        return NextResponse.json(
          { ok: false, insufficientCredits: true, error: "Not enough credits to build an agent." },
          { status: 402 }
        );
      }
    }

    const costs = new CostAccumulator();
    let reservationId = "";
    if (!bypassCredits && plan) {
      const reservation = await reserveCredits(user.id, estimate.reserveCredits, "agent_build", {
        estimatedCredits: estimate.estimatedCredits,
      });
      if (!reservation.ok) {
        return NextResponse.json(
          { ok: false, insufficientCredits: true, error: "Not enough credits to build an agent." },
          { status: 402 }
        );
      }
      reservationId = reservation.reservationId;
    }
    void recordAiCallForDailySpend(estimate.estimatedCredits);

    // The clarifying-questions pre-check — the EXISTING shared one, kind
    // "agent". Its cost lands on the same accumulator, so a build that
    // stops here is still paid for.
    if (!skipClarification) {
      try {
        const clarification = await checkNeedsClarification(apiKey, "agent", userRequest, costs);
        if (clarification.needsClarification) {
          await settleReservation({
            userId: user.id,
            reservationId,
            feature: "agent_build",
            costs,
            plan,
            bypassCharge: bypassCredits || !plan,
            metadata: { outcome: "clarification_requested" },
          });
          return NextResponse.json({
            ok: true,
            built: false,
            needsClarification: true,
            questions: clarification.questions,
          });
        }
      } catch (err) {
        // Best-effort, exactly as in api/automations/create: a hiccup in
        // the pre-check must not block a real agent from being designed.
        logApiError("/api/agents/build", err, { stage: "clarification_check" });
      }
    }

    const result = await buildAgentFromRequest({
      apiKey,
      request: userRequest,
      timezone,
      deliveryTarget,
      costs,
    });

    if (!result.ok) {
      // The builder ran and cost real tokens even though it produced
      // nothing usable, so this settles rather than releases.
      await settleReservation({
        userId: user.id,
        reservationId,
        feature: "agent_build",
        costs,
        plan,
        bypassCharge: bypassCredits || !plan,
        metadata: { outcome: result.reason },
      });
      return NextResponse.json(
        {
          ok: false,
          error:
            result.reason === "invalid_schedule"
              ? `Couldn't work out a valid schedule: ${result.detail} Try saying when it should run, e.g. "every morning".`
              : "Couldn't design that agent. Try describing it a little differently.",
        },
        { status: 422 }
      );
    }

    const settlement = await settleReservation({
      userId: user.id,
      reservationId,
      feature: "agent_build",
      costs,
      plan,
      bypassCharge: bypassCredits || !plan,
      metadata: { outcome: "built" },
    });

    const { draft, understood, unsupported } = result.built;
    const perRun = estimateAgentRun({
      promptChars: draft.prompt.length,
      needsWebSearch: draft.config.needsWebSearch,
      accountCreditPriceEur,
      planSlug: plan?.slug ?? null,
    });

    return NextResponse.json({
      ok: true,
      built: true,
      draft,
      understood,
      unsupported,
      // The preview: what it understood, when it will run, and what each
      // run will cost. All three before the agent exists.
      upcomingRuns: nextRuns(draft.scheduleCron, new Date(), draft.timezone, 3).map((d) =>
        d.toISOString()
      ),
      estimatedCreditsPerRun: perRun.estimatedCredits,
      creditsChargedForBuild: settlement.creditsCharged,
    });
  } catch (err) {
    logApiError("/api/agents/build", err);
    return NextResponse.json({ ok: false, error: "Something went wrong." }, { status: 500 });
  }
}
