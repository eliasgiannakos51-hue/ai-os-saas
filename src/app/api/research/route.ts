import { NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
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
import { effectiveCreditPriceEurForAccount } from "@/lib/billing/credit-formula";
import { CostAccumulator } from "@/lib/billing/cost-accumulator";
import { estimateForAction } from "@/lib/billing/estimate";
import { resolvePricingConfig } from "@/lib/billing/pricing-config";
import { reserveCredits, settleReservation } from "@/lib/billing/reservations";
import {
  checkAiCallAllowed,
  fingerprintRequest,
  recordAiCallForDailySpend,
} from "@/lib/ai-circuit-breaker";
import { checkRateLimit } from "@/lib/rate-limit";
import { logApiError } from "@/lib/log-error";
import { RESEARCH_MODEL } from "@/lib/files/file-models";
import { maxResearchRunsForPlan } from "@/lib/files/limits";
import { RESEARCH_MAX_SEARCHES } from "@/lib/research/research-limits";
import { planResearch, validateTopic } from "@/lib/research/research";
import { resolveLanguage } from "@/lib/text/resolve-language";

export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";
export const maxDuration = 60;

/**
 * Start a Deep Research job — the PLANNING half only.
 *
 * This route is deliberately cheap and deliberately stops. It turns the
 * topic into questions, saves them, quotes the price of running them, and
 * returns. Nothing is searched and nothing expensive is reserved.
 *
 * That stop is the feature. Deep Research is the most expensive single
 * action in the product, and the only honest moment to show someone the
 * bill is before it is incurred — with the actual plan in front of them,
 * so "is this worth 80 credits" is a question they can answer rather than
 * guess at. api/research/[id]/run is where they say yes.
 *
 * The MONTHLY cap is checked here rather than at run time, so a user
 * finds out they are out of runs before the AI writes them a plan they
 * cannot execute.
 */
export async function POST(request: Request) {
  const costs = new CostAccumulator();

  try {
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ ok: false, error: "Not authenticated." }, { status: 401 });
    }

    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ ok: false, error: "The AI service is not configured." }, { status: 503 });
    }

    const limited = await checkRateLimit({
      scope: "research_plan",
      identifier: user.id,
      maxAttempts: 20,
      windowMinutes: 60,
    });
    if (!limited.allowed) {
      return NextResponse.json(
        { ok: false, code: "rate_limited", error: "Too many research requests. Try again shortly." },
        { status: 429 }
      );
    }

    const body = await request.json().catch(() => null);
    const topicCheck = validateTopic(body?.topic);
    if (!topicCheck.ok) {
      return NextResponse.json({ ok: false, error: topicCheck.error }, { status: 400 });
    }
    // THE TOPIC DECIDES, not the interface. `body.language` is the UI
    // locale the browser sent; a Greek topic typed into an
    // English-language interface used to produce an English report,
    // because the settings were asked and the user was not. Resolved
    // server-side rather than in the client so it holds for every caller
    // of this route, and because the topic is right here.
    const uiLocale = typeof body?.language === "string" ? body.language.slice(0, 12) : "en";
    const language = resolveLanguage(topicCheck.topic, uiLocale);

    const isAdmin = isAdminEmail(user.email);
    const planSlug = await resolveEffectivePlanSlug(user);
    const monthlyCap = isAdmin ? Number.POSITIVE_INFINITY : maxResearchRunsForPlan(planSlug);

    if (monthlyCap <= 0) {
      return NextResponse.json(
        { ok: false, upgradeRequired: true, error: "Deep Research is available on paid plans." },
        { status: 403 }
      );
    }
    if (Number.isFinite(monthlyCap)) {
      // Calendar month, matching how the plan allowance is described.
      const since = new Date();
      since.setUTCDate(1);
      since.setUTCHours(0, 0, 0, 0);

      const { count, error } = await supabase
        .from("research_reports")
        .select("id", { count: "exact", head: true })
        .eq("user_id", user.id)
        .gte("created_at", since.toISOString());

      // Fails CLOSED. This cap bounds the most expensive action in the
      // product; a counting error must not be the way around it.
      if (error) {
        logApiError("/api/research", error, { stage: "count_monthly" });
        return NextResponse.json({ ok: false, error: "Could not check your research allowance." }, { status: 503 });
      }
      if ((count ?? 0) >= monthlyCap) {
        return NextResponse.json(
          {
            ok: false,
            limitReached: true,
            error: `Your plan includes ${monthlyCap} research report${monthlyCap === 1 ? "" : "s"} a month.`,
          },
          { status: 403 }
        );
      }
    }

    const breaker = await checkAiCallAllowed(
      user.id,
      "research_plan",
      fingerprintRequest(user.id, topicCheck.topic)
    );
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

    // Two numbers: what the planning call costs (charged now, small) and
    // what the full run will cost (quoted now, charged by the run route).
    const planEstimate = estimateForAction(
      "agentBuild",
      { model: RESEARCH_MODEL, inputChars: topicCheck.topic.length, planSlug: plan?.slug ?? null },
      pricingConfig,
      accountCreditPriceEur
    );
    const runEstimate = estimateForAction(
      "deepResearch",
      {
        model: RESEARCH_MODEL,
        inputChars: topicCheck.topic.length,
        expectedWebSearches: RESEARCH_MAX_SEARCHES,
        planSlug: plan?.slug ?? null,
      },
      pricingConfig,
      accountCreditPriceEur
    );

    let reservationId = "";
    if (!bypassCredits && plan) {
      // Checked against the FULL run, not the plan: quoting somebody a
      // plan they provably cannot afford to run is a worse experience
      // than telling them now.
      const affordable = await hasEnoughCredits(user.id, runEstimate.reserveCredits, plan);
      if (!affordable.ok) {
        return NextResponse.json(
          {
            ok: false,
            insufficientCredits: true,
            error: `A research report costs about ${runEstimate.estimatedCredits} credits, and you do not have enough.`,
          },
          { status: 402 }
        );
      }
      const reservation = await reserveCredits(user.id, planEstimate.reserveCredits, "research_plan", {
        estimatedCredits: planEstimate.estimatedCredits,
      });
      if (!reservation.ok) {
        return NextResponse.json(
          { ok: false, insufficientCredits: true, error: "Not enough credits." },
          { status: 402 }
        );
      }
      reservationId = reservation.reservationId;
    }
    void recordAiCallForDailySpend(planEstimate.estimatedCredits);

    const anthropic = new Anthropic({ apiKey });
    const planned = await planResearch({
      anthropic,
      topic: topicCheck.topic,
      language,
      costs,
    });

    // Settled either way: the planning call spent tokens whether or not
    // it produced a usable plan.
    await settleReservation({
      userId: user.id,
      reservationId,
      feature: "research_plan",
      costs,
      plan,
      bypassCharge: bypassCredits || !plan,
      metadata: { outcome: planned.ok ? "planned" : planned.reason },
    });

    if (!planned.ok) {
      return NextResponse.json(
        { ok: false, error: "The AI could not break that topic into research questions. Try describing it differently." },
        { status: 502 }
      );
    }

    const { data: report, error } = await supabase
      .from("research_reports")
      .insert({
        user_id: user.id,
        topic: topicCheck.topic,
        language,
        status: "pending",
        questions: planned.questions,
      })
      .select("id, topic, status, questions, created_at")
      .single();

    if (error || !report) {
      logApiError("/api/research", error, { stage: "insert" });
      return NextResponse.json({ ok: false, error: "Could not save the research plan." }, { status: 500 });
    }

    return NextResponse.json({
      ok: true,
      report,
      estimate: {
        credits: runEstimate.estimatedCredits,
        maxSearches: RESEARCH_MAX_SEARCHES,
      },
    });
  } catch (err) {
    logApiError("/api/research", err, {});
    return NextResponse.json({ ok: false, error: "Something went wrong." }, { status: 500 });
  }
}

/** The user's reports, newest first. The heavy columns (`sections`,
 *  `sources`) are left out: a list does not need them and they are the
 *  bulk of the row. */
export async function GET() {
  try {
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ ok: false, error: "Not authenticated." }, { status: 401 });
    }

    const { data, error } = await supabase
      .from("research_reports")
      .select("id, topic, status, questions, credits_charged, error, created_at, completed_at, document_id")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(200);

    if (error) {
      logApiError("/api/research", error, { stage: "list" });
      return NextResponse.json({ ok: false, error: "Could not load your reports." }, { status: 500 });
    }

    const planSlug = await resolveEffectivePlanSlug(user);
    return NextResponse.json({
      ok: true,
      reports: data ?? [],
      monthlyCap: isAdminEmail(user.email) ? null : maxResearchRunsForPlan(planSlug),
    });
  } catch (err) {
    logApiError("/api/research", err, {});
    return NextResponse.json({ ok: false, error: "Something went wrong." }, { status: 500 });
  }
}
