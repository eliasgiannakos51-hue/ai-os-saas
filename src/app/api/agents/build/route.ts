import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { isAdminEmail } from "@/lib/admin";
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
import { checkAiCallAllowed, fingerprintRequest, recordAiCallForDailySpend } from "@/lib/ai-circuit-breaker";
import { checkRateLimit } from "@/lib/rate-limit";
import { logApiError } from "@/lib/log-error";
import { getUserFullContext, buildUserContextPromptAdditionEnglish } from "@/lib/user-context";
import { AGENT_BUILDER_MODEL } from "@/lib/agents/agent-models";
import { AGENT_LIMITS, normaliseDeliveryTarget } from "@/lib/agents/agent-config";
import { isValidTimeZone } from "@/lib/agents/cron-expression";
import { maxAgentsForPlan } from "@/lib/agents/agent-limits";
import { checkAgentActivationCap } from "@/lib/agents/agent-cap";
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
      // ACTIVE agents against the plan's capacity, and total rows (any
      // status) against a generous multiple of it — see
      // lib/agents/agent-cap.ts. Checked here, before the build, for the
      // same reason the cap<=0 check above runs first: a preview the
      // user can never turn into an agent is a charge for nothing.
      const capCheck = await checkAgentActivationCap(user.id, agentCap);
      if (!capCheck.ok) {
        if (capCheck.reason === "check_failed") {
          logApiError("/api/agents/build", new Error(capCheck.message), { stage: "count_agents" });
          return NextResponse.json({ ok: false, error: capCheck.message }, { status: 500 });
        }
        return NextResponse.json({ ok: false, limitReached: true, error: capCheck.message }, { status: 403 });
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
    // THE BYPASS EUR CEILING. checkAiCallAllowed above caps volume for
    // every account; this caps real Anthropic SPEND specifically for the
    // accounts credits do not — admin and active beta. See
    // lib/billing/bypass-ceiling.ts for why this is one check in euros
    // rather than a counter re-implemented per feature.
    if (bypassCredits) {
      const ceiling = await checkBypassCeiling(user.id, isAdmin, bypassCredits && !isAdmin);
      if (!ceiling.allowed) {
        return NextResponse.json({ ok: false, error: ceiling.reason }, { status: 429 });
      }
    }
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
    // WHAT THE APP ALREADY KNOWS, captured here and only here.
    //
    // (δ) of the brief: the clarifying-questions check must not ask for
    // something the AI Life Context already answers. Two constraints
    // decide where this runs:
    //
    //   It CANNOT run in the worker. getUserFullContext queries
    //   ai_missions with no user_id filter and relies entirely on RLS to
    //   scope it; the worker holds the service-role client, so the same
    //   call there would fold every user's missions into this user's
    //   prompt.
    //
    //   It only runs when the check will. On the resubmission
    //   (skipClarification) there is no check to inform, and this is
    //   ~15 queries — paying for them to build a string nobody reads is
    //   latency on the one route whose whole point is answering fast.
    //
    // Best-effort throughout: a context lookup that fails costs the user
    // a slightly less well-informed question, never their build.
    let knownContext: string | null = null;
    if (!skipClarification) {
      try {
        knownContext = buildUserContextPromptAdditionEnglish(
          await getUserFullContext(supabase, user.id)
        );
      } catch (err) {
        logApiError("/api/agents/build", err, { stage: "user_context" });
      }
    }

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
        knownContext,
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
