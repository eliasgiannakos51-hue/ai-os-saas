import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { logApiError } from "@/lib/log-error";
import { isAdminEmail } from "@/lib/auth/admin-emails";
import { hasActiveBetaBypass } from "@/lib/beta";
import { checkBypassCeiling } from "@/lib/billing/bypass-ceiling";
import { checkAiCallAllowed, fingerprintRequest, recordAiCallForDailySpend } from "@/lib/ai-circuit-breaker";
import {
  getPurchasedPackCreditPriceEur,
  hasEnoughCredits,
  insufficientCreditsMessage,
  resolveEffectivePlan,
} from "@/lib/billing/credits";
import { CostAccumulator } from "@/lib/billing/cost-accumulator";
import { estimateForAction } from "@/lib/billing/estimate";
import { resolvePricingConfig } from "@/lib/billing/pricing-config";
import { effectiveCreditPriceEurForAccount } from "@/lib/billing/credit-formula";
import { releaseReservation, reserveCredits, settleReservation } from "@/lib/billing/reservations";
import { resolveLanguage } from "@/lib/text/resolve-language";
import { SUPPORTED_LOCALES } from "@/i18n/constants";
import { isUnsplashConfigured } from "@/lib/unsplash";
import {
  MAX_OWN_IMAGES,
  checkDescription,
  clampSlideCount,
  deckEstimateInputChars,
  isImageSource,
  slidesWantingImages,
  type Deck,
  type ImageSource,
} from "@/lib/presentations/deck";
import { generateDeck } from "@/lib/presentations/generate";
import { PRESENTATION_MODEL } from "@/lib/presentations/prompt";
import { resolveOwnImages, resolveUnsplashImages } from "@/lib/presentations/images";

export const dynamic = "force-dynamic";
// Twenty slides is one long Sonnet call — measured at 40-70s for the
// ceiling — plus up to eight Unsplash searches afterwards.
export const maxDuration = 120; // @function-limit 120

/**
 * DESCRIPTION IN, DECK OUT.
 *
 * The same pipeline every paid route in this app runs, in the same order
 * (scripts/tests/route-refusals.test.mjs holds the order): the body is
 * validated before the user is read, the breaker before the plan, the
 * hold before the model, and nothing is spent before the last refusal.
 *
 * WHAT IS WRITTEN, AND THROUGH WHICH CLIENT. The row goes into
 * ai_presentations through the person's OWN session client, so the
 * 20260803 policies decide the insert — the same table and the same
 * policies the hand-typed notes always used, with the deck in the
 * columns 20260929000000_presentation_decks.sql added. A failed
 * generation writes a row too, with a reason code, because a run that
 * cost a wait is something the person should see in their history.
 *
 * PHOTOS ARE CHOSEN HERE, AFTER THE MODEL. It writes an imageQuery per
 * slide that wants one; this route turns those into Unsplash photos, or
 * hands out the person's own uploads, or drops them — lib/presentations/
 * images.ts. None of that is a model call and none of it costs credits.
 */
export async function POST(request: Request) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return NextResponse.json({ error: "not_configured" }, { status: 503 });

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  }
  const description = typeof body.description === "string" ? body.description.trim() : "";
  const verdict = checkDescription(description);
  if (!verdict.ok) return NextResponse.json({ error: verdict.reason, limit: verdict.limit }, { status: 400 });
  const slideCount = clampSlideCount(body.slideCount);
  const imageSource: ImageSource = isImageSource(body.imageSource) ? body.imageSource : "none";
  const ownImagePaths = Array.isArray(body.ownImagePaths)
    ? body.ownImagePaths.filter((p): p is string => typeof p === "string" && p.length > 0)
    : [];
  if (ownImagePaths.length > MAX_OWN_IMAGES) {
    return NextResponse.json({ error: "too_many_images", limit: MAX_OWN_IMAGES }, { status: 400 });
  }
  // The INTERFACE language is only the fallback: the deck is written in
  // the language the brief is written in (lib/text/resolve-language.ts).
  const uiLocale =
    typeof body.locale === "string" && (SUPPORTED_LOCALES as readonly string[]).includes(body.locale)
      ? body.locale
      : "en";

  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "not_signed_in" }, { status: 401 });

  // An own-photo path that is not under the person's own folder would be
  // refused by storage RLS at export time; refusing it here says why
  // before anything is spent.
  if (ownImagePaths.some((p) => !p.startsWith(`${user.id}/`))) {
    return NextResponse.json({ error: "bad_image_path" }, { status: 400 });
  }

  try {
    const breaker = await checkAiCallAllowed(
      user.id,
      "presentation_generate",
      fingerprintRequest(description, slideCount, imageSource)
    );
    if (!breaker.allowed) return NextResponse.json({ error: "rate_limited", detail: breaker.reason }, { status: 429 });

    const isAdmin = isAdminEmail(user.email);
    const isBeta = await hasActiveBetaBypass(user);
    const bypass = isAdmin || isBeta;
    if (bypass) {
      const ceiling = await checkBypassCeiling(user.id, isAdmin, isBeta);
      if (!ceiling.allowed) return NextResponse.json({ error: "bypass_ceiling", detail: ceiling.reason }, { status: 429 });
    }

    const plan = await resolveEffectivePlan(user);
    const pricingConfig = resolvePricingConfig();
    const estimate = estimateForAction(
      "presentationGenerate",
      {
        model: PRESENTATION_MODEL,
        inputChars: deckEstimateInputChars(description.length, slideCount),
        planSlug: plan?.slug ?? null,
      },
      pricingConfig,
      plan
        ? effectiveCreditPriceEurForAccount(plan, await getPurchasedPackCreditPriceEur(user.id), pricingConfig)
        : undefined
    );

    let reservationId = "";
    if (!bypass && plan) {
      const enough = await hasEnoughCredits(user.id, estimate.reserveCredits, plan);
      if (!enough.ok) {
        return NextResponse.json(
          { error: "insufficient_credits", detail: insufficientCreditsMessage(enough.remaining, estimate.reserveCredits) },
          { status: 402 }
        );
      }
      const reservation = await reserveCredits(user.id, estimate.reserveCredits, "presentation_generate", {
        slideCount,
        imageSource,
        descriptionChars: description.length,
      });
      if (!reservation.ok) return NextResponse.json({ error: "reserve_failed", detail: reservation.reason }, { status: 402 });
      reservationId = reservation.reservationId;
    }

    const locale = resolveLanguage(description, uiLocale);
    const costs = new CostAccumulator();
    void recordAiCallForDailySpend(estimate.estimatedCredits);
    const outcome = await generateDeck({
      apiKey,
      description,
      slideCount,
      locale,
      imageSource,
      costs,
      // THE STOP BUTTON: the request's own abort signal. When the person
      // stops, the provider call is aborted with it.
      signal: request.signal,
    });

    if (!outcome.ok && outcome.kind === "aborted") {
      // Nothing produced, nothing charged, no history row — the person
      // did this, and "failed" would be the wrong word for it.
      await releaseReservation(user.id, reservationId);
      return NextResponse.json({ error: "stopped" }, { status: 499 });
    }

    if (!outcome.ok && outcome.kind === "provider") {
      await releaseReservation(user.id, reservationId);
      logApiError("/api/presentations/generate", new Error(outcome.detail), { kind: outcome.kind });
      await recordFailure(supabase, user.id, description, slideCount, "ai_unavailable");
      return NextResponse.json({ error: "ai_unavailable" }, { status: 503 });
    }

    if (!outcome.ok) {
      // The model answered and the answer was not a deck. The tokens were
      // spent, so the call SETTLES (as agent-builder does for an unusable
      // configuration) rather than pretending it never happened.
      logApiError("/api/presentations/generate", new Error(outcome.detail), { kind: outcome.kind });
      const settlement = await settleReservation({
        userId: user.id,
        reservationId,
        feature: "presentation_generate",
        costs,
        plan,
        bypassCharge: bypass,
        metadata: { slideCount, imageSource, outcome: outcome.kind },
      });
      await recordFailure(supabase, user.id, description, slideCount, "unusable", settlement.creditsCharged);
      return NextResponse.json({ error: "unusable", creditsCharged: settlement.creditsCharged }, { status: 502 });
    }

    let deck: Deck = outcome.deck;
    const wanted = slidesWantingImages(deck);
    if (imageSource === "unsplash") deck = await resolveUnsplashImages(deck);
    else if (imageSource === "own") deck = resolveOwnImages(deck, ownImagePaths);
    const found = deck.slides.filter((s) => s.image !== null).length;

    const settlement = await settleReservation({
      userId: user.id,
      reservationId,
      feature: "presentation_generate",
      costs,
      plan,
      bypassCharge: bypass,
      metadata: { slideCount, slides: deck.slides.length, imageSource, locale, imagesWanted: wanted, imagesFound: found },
    });

    const { data: row, error: saveError } = await supabase
      .from("ai_presentations")
      .insert({
        user_id: user.id,
        title: deck.title,
        description,
        slide_count: deck.slides.length,
        status: "draft",
        slides: deck,
        locale,
        image_source: deck.imageSource,
        source: "generated",
        credits_charged: settlement.creditsCharged,
      })
      .select("id")
      .single();
    if (saveError) logApiError("/api/presentations/generate", saveError, { stage: "save" });

    return NextResponse.json({
      ok: true,
      id: row?.id ?? null,
      deck,
      creditsCharged: settlement.creditsCharged,
      images: { wanted, found, unsplashConfigured: isUnsplashConfigured() },
    });
  } catch (err) {
    logApiError("/api/presentations/generate", err);
    return NextResponse.json({ error: "generate_failed" }, { status: 500 });
  }
}

/**
 * A history row for a run that produced nothing.
 *
 * Through the session client, so the same RLS that admits a deck admits
 * the record of its failure. A failed insert is logged and swallowed —
 * the response the person is waiting for is the failure itself.
 */
async function recordFailure(
  supabase: ReturnType<typeof createClient>,
  userId: string,
  description: string,
  slideCount: number,
  error: "ai_unavailable" | "unusable",
  creditsCharged = 0
) {
  const { error: insertError } = await supabase.from("ai_presentations").insert({
    user_id: userId,
    title: description.slice(0, 80),
    description,
    slide_count: slideCount,
    status: "draft",
    source: "generated",
    error,
    credits_charged: creditsCharged,
  });
  if (insertError) logApiError("/api/presentations/generate", insertError, { stage: "record_failure" });
}
