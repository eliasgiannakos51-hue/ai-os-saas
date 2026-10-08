import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { logApiError } from "@/lib/log-error";
import { isAdminEmail } from "@/lib/auth/admin-emails";
import { memoryWindowFor } from "@/lib/memory/memory-window";
import { accountHasCapability } from "@/lib/billing/capability-gate";
import { hasActiveBetaBypass } from "@/lib/beta";
import { checkBypassCeiling } from "@/lib/billing/bypass-ceiling";
import { checkAiCallAllowed, fingerprintRequest, recordAiCallForDailySpend } from "@/lib/ai-circuit-breaker";
import {
  getPurchasedPackCreditPriceEur,
  hasEnoughCredits,
  insufficientCreditsMessage,
  resolveEffectivePlan,
  resolveEffectivePlanSlug,
} from "@/lib/billing/credits";
import { CostAccumulator } from "@/lib/billing/cost-accumulator";
import { estimateForAction } from "@/lib/billing/estimate";
import { resolvePricingConfig } from "@/lib/billing/pricing-config";
import { effectiveCreditPriceEurForAccount } from "@/lib/billing/credit-formula";
import { releaseReservation, reserveCredits, settleReservation } from "@/lib/billing/reservations";
import { isUnsplashConfigured } from "@/lib/unsplash";
import {
  MAX_INSTRUCTION_CHARS,
  MIN_INSTRUCTION_CHARS,
  deckEditEstimateInputChars,
  keepBoxImage,
  keepOnlySlide,
  parseStoredDeck,
  readSlideIndex,
  scopeInstructionToSlide,
  slidesWantingImages,
  type Deck,
} from "@/lib/presentations/deck";
import { editDeck } from "@/lib/presentations/generate";
import { memoryPromptFor } from "@/lib/memory/store";
import { memoryActiveFor } from "@/lib/memory/memory-policy";
import { PRESENTATION_MODEL } from "@/lib/presentations/prompt";
import { resolveOwnImages, resolveUnsplashImages } from "@/lib/presentations/images";

export const dynamic = "force-dynamic";
// The same one long Sonnet call the generator makes, plus the same
// image resolution afterwards — the deck comes back whole, so the work
// is the generator's work and the ceiling is its ceiling.
export const maxDuration = 120; // @function-limit 120

/**
 * "MAKE IT MORE FORMAL" — a deck that exists, and a sentence.
 *
 * WHY THIS ROUTE EXISTS. Measured 2026-09-27: of the six rows the
 * sidebar draws under Make, exactly ONE could be changed by saying so.
 * The other five generated and stopped, so a deck that came back almost
 * right was a deck you described again from scratch and paid for twice
 * — and the second attempt had no idea what the first had produced.
 *
 * THE PIPELINE IS THE ONE EVERY PAID ROUTE HERE RUNS, in the order
 * scripts/tests/route-refusals.test.mjs holds: the body before the
 * user, the breaker before the plan, the hold before the model, and
 * nothing spent before the last refusal.
 *
 * WHAT IT CHARGES, AND WHY NOT THE GENERATOR'S FIGURE. An edit sends
 * the WHOLE DECK back up as input and gets the whole deck down again,
 * where a generation sends a brief. `presentationEdit` in
 * lib/billing/estimate.ts prices that shape, and the call site passes
 * deckEditEstimateInputChars() — the deck's real characters plus the
 * instruction — rather than the per-slide allowance a generation
 * over-states on purpose.
 *
 * THE DECK IS REPLACED IN PLACE, not inserted beside. A person who says
 * "make it more formal" has one deck that is now more formal, and a
 * history that filled with a row per adjective would be the opposite of
 * the thing being asked for. The row keeps its id, so the .pptx and PDF
 * links a person already has keep working.
 */
export async function POST(request: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: "not_configured" }, { status: 503 });
  }

  let instruction: string;
  let slideIndex: unknown;
  try {
    const body = await request.json();
    instruction = typeof body?.instruction === "string" ? body.instruction.trim() : "";
    slideIndex = body?.slideIndex;
  } catch {
    return NextResponse.json({ error: "bad_body" }, { status: 400 });
  }
  if (instruction.length < MIN_INSTRUCTION_CHARS) {
    return NextResponse.json({ error: "too_short", limit: MIN_INSTRUCTION_CHARS }, { status: 400 });
  }
  if (instruction.length > MAX_INSTRUCTION_CHARS) {
    return NextResponse.json({ error: "too_long", limit: MAX_INSTRUCTION_CHARS }, { status: 400 });
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });

  if (!accountHasCapability(await resolveEffectivePlanSlug(user), "presentations", isAdminEmail(user.email))) {
    // A CODE AND NO ENGLISH SENTENCE. The generator's copy of this
    // carries one, and i18n-coverage.test.mjs counts server-side
    // English prose against a ceiling that may only fall — so adding a
    // second copy of the sentence would have raised it by one for a
    // string no reader in nine of the ten languages can use anyway. The
    // client owns the wording; this owns the reason.
    return NextResponse.json({ ok: false, code: "not_included" }, { status: 403 });
  }

  // THE ROW, THROUGH THE PERSON'S OWN CLIENT. RLS decides whether this
  // deck is theirs; there is no second ownership check here, because a
  // second one written by hand is a second thing that can disagree with
  // the policy. A deck that is not theirs simply is not found.
  const { data: row, error: readError } = await supabase
    .from("ai_presentations")
    .select("id, slides, locale, image_source, description")
    .eq("id", params.id)
    .single();
  if (readError || !row) return NextResponse.json({ error: "not_found" }, { status: 404 });

  // A ROW WITH NO DECK IS NOT EDITABLE, and there are two kinds: the
  // hand-typed notes this table held before V5 #21, and the failure
  // rows the generator writes when a run produced nothing. Both have
  // `slides` null or unparseable, and "make it more formal" has nothing
  // to act on.
  const stored = parseStoredDeck(row.slides);
  if (!stored) return NextResponse.json({ error: "no_deck" }, { status: 409 });

  // ONE BOX (package 4): a slide index changes that slide and nothing
  // else. Checked against the stored deck before anything is held, so a
  // slide that is not there costs nothing.
  const box = readSlideIndex(slideIndex, stored.slides.length);
  if (box === "bad") return NextResponse.json({ error: "bad_slide" }, { status: 400 });

  try {
    const breaker = await checkAiCallAllowed(
      user.id,
      "presentation_edit",
      fingerprintRequest(params.id, instruction, box)
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
      "presentationEdit",
      {
        model: PRESENTATION_MODEL,
        inputChars: deckEditEstimateInputChars(stored, instruction.length),
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
      const reservation = await reserveCredits(user.id, estimate.reserveCredits, "presentation_edit", {
        deckId: params.id,
        slides: stored.slides.length,
        instructionChars: instruction.length,
      });
      if (!reservation.ok) return NextResponse.json({ error: "reserve_failed", detail: reservation.reason }, { status: 402 });
      reservationId = reservation.reservationId;
    }

    // THE DECK'S OWN LANGUAGE, NOT THE INSTRUCTION'S. "make it shorter"
    // typed in English about a Greek deck is a Greek deck that is
    // shorter — resolving the language from the instruction would
    // silently translate the whole thing.
    const locale = typeof row.locale === "string" && row.locale ? row.locale : "en";
    const costs = new CostAccumulator();
    void recordAiCallForDailySpend(estimate.estimatedCredits);
    const memoryBlock = memoryActiveFor({
      surface: "presentation",
      user,
      planLimit: memoryWindowFor(plan?.capabilities.chatMemoryLimit ?? 0, isAdmin),
    })
      ? await memoryPromptFor(supabase, user.id, memoryWindowFor(plan?.capabilities.chatMemoryLimit ?? 0, isAdmin))
      : "";

    const outcome = await editDeck({
      apiKey,
      deck: stored,
      instruction: box === null ? instruction : scopeInstructionToSlide(instruction, box, stored.slides.length),
      locale,
      imageSource: stored.imageSource,
      costs,
      memoryBlock,
      signal: request.signal,
    });

    if (!outcome.ok && outcome.kind === "aborted") {
      await releaseReservation(user.id, reservationId);
      return NextResponse.json({ error: "stopped" }, { status: 499 });
    }
    if (!outcome.ok && outcome.kind === "provider") {
      await releaseReservation(user.id, reservationId);
      logApiError("/api/presentations/[id]/edit", new Error(outcome.detail), { kind: outcome.kind });
      return NextResponse.json({ error: "ai_unavailable" }, { status: 503 });
    }
    // The rest of the deck is the STORED deck, whatever the model wrote.
    const boxed = outcome.ok && box !== null ? keepOnlySlide(stored, outcome.deck, box) : null;
    if (!outcome.ok || (box !== null && !boxed)) {
      // The model answered and the answer was not a deck. The tokens
      // were spent, so this SETTLES rather than releasing — and the
      // stored deck is left exactly as it was, which is the part that
      // matters to somebody who asked for a small change.
      const kind = outcome.ok ? "no_such_slide" : outcome.kind;
      logApiError("/api/presentations/[id]/edit", new Error(outcome.ok ? "the slide came back missing" : outcome.detail), { kind });
      const settlement = await settleReservation({
        userId: user.id,
        reservationId,
        feature: "presentation_edit",
        costs,
        plan,
        bypassCharge: bypass,
        metadata: { deckId: params.id, outcome: kind },
      });
      return NextResponse.json({ error: "unusable", creditsCharged: settlement.creditsCharged }, { status: 502 });
    }

    let deck: Deck = boxed ?? outcome.deck;
    const wanted = slidesWantingImages(deck);
    // THE SAME SOURCE THE DECK WAS MADE WITH. An edit is not a place to
    // change where the pictures come from: "own" means the person's
    // uploads, and this route was given no new ones, so it re-resolves
    // from the paths the stored deck already carries.
    //
    // A PICTURE FOR ONE BOX ONLY. The whole-deck resolver searches every
    // slide again; for one box that is eight searches to change one, so
    // the box keeps its own picture when it still wants it and otherwise
    // searches for itself alone.
    if (boxed && box !== null) {
      let slide = keepBoxImage(stored.slides[box], boxed.slides[box], stored.imageSource);
      if (stored.imageSource === "unsplash" && slide.imageQuery && !slide.image) {
        slide = (await resolveUnsplashImages({ ...boxed, slides: [slide] })).slides[0];
      }
      deck = { ...boxed, slides: boxed.slides.map((s, i) => (i === box ? slide : s)) };
    } else if (stored.imageSource === "unsplash") deck = await resolveUnsplashImages(deck);
    else if (stored.imageSource === "own") {
      deck = resolveOwnImages(
        deck,
        stored.slides.map((s) => (s.image?.kind === "own" ? s.image.path : null)).filter((p): p is string => Boolean(p))
      );
    }
    const found = deck.slides.filter((s) => s.image !== null).length;

    const settlement = await settleReservation({
      userId: user.id,
      reservationId,
      feature: "presentation_edit",
      costs,
      plan,
      bypassCharge: bypass,
      metadata: {
        deckId: params.id,
        slidesBefore: stored.slides.length,
        slide: box,
        slides: deck.slides.length,
        locale,
        imagesWanted: wanted,
        imagesFound: found,
      },
    });

    const { error: saveError } = await supabase
      .from("ai_presentations")
      .update({
        title: deck.title,
        slide_count: deck.slides.length,
        slides: deck,
        image_source: deck.imageSource,
      })
      .eq("id", params.id);
    if (saveError) {
      // SAID OUT LOUD RATHER THAN SWALLOWED. The generator can log a
      // failed save and still hand back the deck, because the person
      // has it on screen either way. Here the deck they are looking at
      // IS the stored one, so a silent failure means the next reload
      // shows the old deck and the change they paid for is gone with
      // no explanation.
      logApiError("/api/presentations/[id]/edit", saveError, { stage: "save" });
      return NextResponse.json(
        { error: "not_saved", creditsCharged: settlement.creditsCharged },
        { status: 500 }
      );
    }

    return NextResponse.json({
      ok: true,
      id: params.id,
      deck,
      creditsCharged: settlement.creditsCharged,
      images: { wanted, found, unsplashConfigured: isUnsplashConfigured() },
    });
  } catch (err) {
    logApiError("/api/presentations/[id]/edit", err);
    return NextResponse.json({ error: "edit_failed" }, { status: 500 });
  }
}
