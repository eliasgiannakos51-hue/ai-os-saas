import { NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { createClient } from "@/lib/supabase/server";
import { isAdminEmail } from "@/lib/admin";
import { hasActiveBetaBypass } from "@/lib/beta";
import {
  hasEnoughCredits,
  resolveEffectivePlan,
  resolveEffectivePlanSlug,
  getPurchasedPackCreditPriceEur,
} from "@/lib/billing/credits";
import { effectiveCreditPriceEurForAccount } from "@/lib/billing/credit-formula";
import { CostAccumulator } from "@/lib/billing/cost-accumulator";
import { estimateForPresentation } from "@/lib/billing/estimate";
import { resolvePricingConfig } from "@/lib/billing/pricing-config";
import { reserveCredits, settleReservation } from "@/lib/billing/reservations";
import { buildUsageReceipt } from "@/lib/billing/usage-receipt";
import {
  checkAiCallAllowed,
  fingerprintRequest,
  recordAiCallForDailySpend,
} from "@/lib/ai-circuit-breaker";
import { checkRateLimit } from "@/lib/rate-limit";
import { checkNeedsClarification } from "@/lib/clarification";
import { logApiError } from "@/lib/log-error";
import { PRESENTATION_MODEL, PRESENTATION_SEARCHES } from "@/lib/presentations/presentation-models";
import { maxPresentationsForPlan } from "@/lib/presentations/presentation-limits";
import { isThemeId, DEFAULT_THEME_ID } from "@/lib/presentations/themes";
import {
  composeDeck,
  gatherFacts,
  resolveDeckImages,
  resolveSlideCount,
  validateBrief,
} from "@/lib/presentations/generate";

export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";
export const maxDuration = 120;

/**
 * Generate a presentation.
 *
 * Unlike Deep Research, this route does NOT stop to quote. The reason is
 * the price: a deck is one search pass and one long structured call —
 * comparable to generating a website, which this app has always done in
 * one go — where a research run is up to six search passes plus a
 * synthesis over all of them. A confirmation step exists to stop somebody
 * spending 80 credits by accident; putting one in front of a 6-credit
 * action just adds a click to every deck.
 *
 * The MONTHLY cap is checked before any AI call, and it FAILS CLOSED: a
 * counting error must not become the way around the fair-use limit.
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

    // Rate limit BEFORE the body is read, let alone validated. An
    // anonymous-shaped mistake this route has already been taught once
    // elsewhere: /api/agents/build used to validate the request body
    // before authenticating, and answered strangers with its own size
    // limits.
    const limited = await checkRateLimit({
      scope: "presentation_generate",
      identifier: user.id,
      maxAttempts: 15,
      windowMinutes: 60,
    });
    if (!limited.allowed) {
      return NextResponse.json(
        { ok: false, error: "Too many presentations at once. Try again shortly." },
        { status: 429 }
      );
    }

    const body = await request.json().catch(() => null);
    const briefCheck = validateBrief(body?.brief);
    if (!briefCheck.ok) {
      return NextResponse.json({ ok: false, error: briefCheck.error }, { status: 400 });
    }
    const slideCount = resolveSlideCount(body?.slideCount);
    const themeId = isThemeId(body?.theme) ? String(body.theme) : DEFAULT_THEME_ID;
    const language = typeof body?.language === "string" ? body.language.slice(0, 12) : "en";
    const skipClarification = body?.skipClarification === true;

    const isAdmin = isAdminEmail(user.email);
    const planSlug = await resolveEffectivePlanSlug(user);
    const monthlyCap = isAdmin ? Number.POSITIVE_INFINITY : maxPresentationsForPlan(planSlug);

    if (monthlyCap <= 0) {
      return NextResponse.json(
        { ok: false, upgradeRequired: true, error: "The Presentation Builder is available on paid plans." },
        { status: 403 }
      );
    }
    if (Number.isFinite(monthlyCap)) {
      const since = new Date();
      since.setUTCDate(1);
      since.setUTCHours(0, 0, 0, 0);

      const { count, error } = await supabase
        .from("user_presentations")
        .select("id", { count: "exact", head: true })
        .eq("user_id", user.id)
        .gte("created_at", since.toISOString());

      if (error) {
        logApiError("/api/presentations", error, { stage: "count_monthly" });
        return NextResponse.json(
          { ok: false, error: "Could not check your presentation allowance." },
          { status: 503 }
        );
      }
      if ((count ?? 0) >= monthlyCap) {
        return NextResponse.json(
          {
            ok: false,
            limitReached: true,
            error: `Your plan includes ${monthlyCap} presentation${monthlyCap === 1 ? "" : "s"} a month.`,
          },
          { status: 403 }
        );
      }
    }

    const breaker = await checkAiCallAllowed(
      user.id,
      "presentation_generate",
      fingerprintRequest(user.id, briefCheck.brief)
    );
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

    const estimate = estimateForPresentation(
      {
        model: PRESENTATION_MODEL,
        briefChars: briefCheck.brief.length,
        slideCount,
        expectedWebSearches: PRESENTATION_SEARCHES,
      },
      pricingConfig,
      accountCreditPriceEur
    );

    let reservationId = "";
    if (!bypassCredits && plan) {
      const affordable = await hasEnoughCredits(user.id, estimate.reserveCredits, plan);
      if (!affordable.ok) {
        return NextResponse.json(
          {
            ok: false,
            insufficientCredits: true,
            error: `A ${slideCount}-slide presentation costs about ${estimate.estimatedCredits} credits, and you do not have enough.`,
          },
          { status: 402 }
        );
      }
      const reservation = await reserveCredits(user.id, estimate.reserveCredits, "presentation_generate", {
        estimatedCredits: estimate.estimatedCredits,
      });
      if (!reservation.ok) {
        return NextResponse.json(
          { ok: false, insufficientCredits: true, error: "Not enough credits." },
          { status: 402 }
        );
      }
      reservationId = reservation.reservationId;
    }
    void recordAiCallForDailySpend(estimate.estimatedCredits);

    // Settling exactly once, on every path out of here. Declared up
    // front rather than repeated at each return, because the one thing
    // that must not happen is an early return that leaves a hold on the
    // account forever.
    // `bypass`/`wouldHaveCharged` on the receipt: settleReservation
    // computes the would-have-charged figure but only persists it to the
    // reservation metadata, so a synchronous route cannot read it back.
    // Every other synchronous route (api/chat, api/records/ask) passes
    // null for the same reason; the number is still visible to the owner
    // in the margin report, which is where it is actually used.
    const settle = async (outcome: string) =>
      settleReservation({
        userId: user.id,
        reservationId,
        feature: "presentation_generate",
        costs,
        plan,
        bypassCharge: bypassCredits || !plan,
        metadata: { outcome, slideCount },
      });

    const anthropic = new Anthropic({ apiKey });

    // The clarifying-questions pre-check, before anything expensive.
    if (!skipClarification) {
      try {
        const clarification = await checkNeedsClarification(
          apiKey,
          "presentation",
          briefCheck.brief,
          costs
        );
        if (clarification.needsClarification) {
          const settled = await settle("clarification_requested");
          return NextResponse.json({
            ok: true,
            needsClarification: true,
            questions: clarification.questions,
            usage: buildUsageReceipt({
              creditsCharged: settled.creditsCharged,
              bypass: bypassCredits,
              wouldHaveCharged: null,
            }),
          });
        }
      } catch (err) {
        // Fail OPEN: a broken pre-check must not block the feature it
        // was only ever meant to improve. Same tolerance every other
        // classifier in this app has.
        logApiError("/api/presentations", err, { stage: "clarification_check" });
      }
    }

    const facts = await gatherFacts({
      anthropic,
      brief: briefCheck.brief,
      language,
      costs,
    });

    const composed = await composeDeck({
      anthropic,
      brief: briefCheck.brief,
      findings: facts.findings,
      language,
      slideCount,
      costs,
    });

    if (!composed.ok) {
      // Settled anyway. The fact-finding pass and the failed compose call
      // both spent real tokens, and unsettled spend is spend the margin
      // report cannot see.
      await settle(composed.reason);
      return NextResponse.json(
        { ok: false, error: "The AI could not turn that into a presentation. Try describing it differently." },
        { status: 502 }
      );
    }

    const slides = await resolveDeckImages(composed.deck.slides);
    const settled = await settle("generated");

    const { data: deck, error } = await supabase
      .from("user_presentations")
      .insert({
        user_id: user.id,
        title: composed.deck.title,
        brief: briefCheck.brief,
        language,
        theme: themeId,
        slides,
        sources: facts.sources,
        status: "ready",
        credits_charged: settled.creditsCharged,
      })
      .select("id, title, brief, language, theme, slides, sources, status, credits_charged, created_at, updated_at")
      .single();

    if (error || !deck) {
      logApiError("/api/presentations", error, { stage: "insert" });
      return NextResponse.json({ ok: false, error: "Could not save the presentation." }, { status: 500 });
    }

    // Version 1. Best-effort: a deck that exists without its first
    // history entry is a working deck, and failing the whole generation
    // over a history row would throw away work the user has paid for.
    const { error: versionError } = await supabase.from("presentation_versions").insert({
      presentation_id: deck.id,
      user_id: user.id,
      version_number: 1,
      title: deck.title,
      slides,
      change_summary: "generated",
    });
    if (versionError) {
      logApiError("/api/presentations", versionError, { stage: "insert_version" });
    }

    return NextResponse.json({
      ok: true,
      presentation: deck,
      usage: buildUsageReceipt({
        creditsCharged: settled.creditsCharged,
        bypass: bypassCredits,
        wouldHaveCharged: null,
      }),
    });
  } catch (err) {
    logApiError("/api/presentations", err, {});
    return NextResponse.json({ ok: false, error: "Something went wrong." }, { status: 500 });
  }
}

/**
 * The user's decks, newest first.
 *
 * `slides` is deliberately not selected: it is almost the entire row, and
 * a list needs a title, a status and a date. Loading 100 full decks to
 * render 100 cards is how a list page gets slow for the users who use the
 * feature most.
 */
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
      .from("user_presentations")
      .select("id, title, theme, status, error, credits_charged, share_slug, share_enabled, created_at, updated_at")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(200);

    if (error) {
      logApiError("/api/presentations", error, { stage: "list" });
      return NextResponse.json({ ok: false, error: "Could not load your presentations." }, { status: 500 });
    }

    const planSlug = await resolveEffectivePlanSlug(user);
    return NextResponse.json({
      ok: true,
      presentations: data ?? [],
      monthlyCap: isAdminEmail(user.email) ? null : maxPresentationsForPlan(planSlug),
    });
  } catch (err) {
    logApiError("/api/presentations", err, {});
    return NextResponse.json({ ok: false, error: "Something went wrong." }, { status: 500 });
  }
}
