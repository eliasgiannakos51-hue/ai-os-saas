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
import { estimateForAction } from "@/lib/billing/estimate";
import { resolvePricingConfig } from "@/lib/billing/pricing-config";
import { effectiveCreditPriceEurForAccount } from "@/lib/billing/credit-formula";
import { checkAiCallAllowed, fingerprintRequest, recordAiCallForDailySpend } from "@/lib/ai-circuit-breaker";
import { checkRateLimit } from "@/lib/rate-limit";
import { logApiError } from "@/lib/log-error";
import { AGENT_BUILDER_MODEL } from "@/lib/agents/agent-models";
import { AGENT_LIMITS, normaliseDeliveryTarget } from "@/lib/agents/agent-config";
import { isValidTimeZone } from "@/lib/agents/cron-expression";
import { maxAgentsForPlan } from "@/lib/agents/agent-limits";
import { startJob } from "@/lib/jobs/start-job";

export const dynamic = "force-dynamic";
export const maxDuration = 60; // @function-limit 60

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
        { ok: false, code: "rate_limited", error: "Too many agent drafts in the last hour. Try again shortly." },
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

    // FROM HERE THE ROUTE DOES NOT DO THE WORK.
    //
    // It used to await two sequential model calls under a 60-second
    // ceiling, which is where the reported failure lived: on a 60s
    // platform the second call could be killed outright, and a kill runs
    // no catch block — no settlement, no status, and the reservation held
    // against work the user never received. Their first impression of the
    // product was paying for a spinner.
    //
    // Now: hold the credits, write a job row, kick a worker, return the
    // id. The work continues whether or not this connection survives, and
    // the client watches the row rather than the socket.
    const started = await startJob({
      userId: user.id,
      kind: "agent_build",
      reserve: bypassCredits || !plan ? 0 : estimate.reserveCredits,
      reserveMetadata: { estimatedCredits: estimate.estimatedCredits },
      input: {
        request: userRequest,
        timezone,
        deliveryTarget,
        skipClarification,
        // Captured NOW, not looked up by the worker. The estimate the user
        // was quoted is the estimate the preview must show, and a plan
        // change between the press and the worker must not silently
        // reprice a job already in flight.
        accountCreditPriceEur,
        planSlug: plan?.slug ?? null,
      },
    });

    if (!started.ok) {
      if (started.reason === "insufficient") {
        return NextResponse.json(
          { ok: false, insufficientCredits: true, error: "Not enough credits to build an agent." },
          { status: 402 }
        );
      }
      return NextResponse.json({ ok: false, error: started.message }, { status: 500 });
    }

    void recordAiCallForDailySpend(estimate.estimatedCredits);

    // 202: accepted, not finished. The client polls /api/jobs/<id>.
    return NextResponse.json({ ok: true, jobId: started.jobId, queued: true }, { status: 202 });
  } catch (err) {
    logApiError("/api/agents/build", err);
    return NextResponse.json({ ok: false, error: "Something went wrong." }, { status: 500 });
  }
}
