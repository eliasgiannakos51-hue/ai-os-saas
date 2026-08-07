import { NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { createClient } from "@/lib/supabase/server";
import { isAdminEmail } from "@/lib/admin";
import { hasActiveBetaBypass } from "@/lib/beta";
import {
  hasEnoughCredits,
  resolveEffectivePlan,
  getPurchasedPackCreditPriceEur,
} from "@/lib/billing/credits";
import { effectiveCreditPriceEurForAccount } from "@/lib/billing/credit-formula";
import { CostAccumulator } from "@/lib/billing/cost-accumulator";
import { estimateForAction } from "@/lib/billing/estimate";
import { resolvePricingConfig } from "@/lib/billing/pricing-config";
import { reserveCredits, settleReservation } from "@/lib/billing/reservations";
import { buildUsageReceipt } from "@/lib/billing/usage-receipt";
import {
  checkAiCallAllowed,
  fingerprintRequest,
  recordAiCallForDailySpend,
} from "@/lib/ai-circuit-breaker";
import { checkRateLimit } from "@/lib/rate-limit";
import { logApiError } from "@/lib/log-error";
import { PRESENTATION_MODEL } from "@/lib/presentations/presentation-models";
import { maxPresentationEditsPerHour } from "@/lib/presentations/presentation-limits";
import { editDeck, resolveDeckImages, validateInstruction } from "@/lib/presentations/generate";
import { appendVersion } from "@/lib/presentations/versions";
import { deckCharCount, normaliseSlides, withUniqueIds } from "@/lib/presentations/slides";

export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";
export const maxDuration = 120;

/**
 * Change a deck with one instruction: "make slide 3 shorter", "add a
 * slide about pricing", "rewrite the closing to ask for a meeting".
 *
 * The deck is read FROM THE DATABASE, not from the request body. The
 * client has the deck on screen and could send it, which would save a
 * query — and would mean the AI edits whatever the caller says the deck
 * is. Reading it here is what makes the ownership filter meaningful:
 * there is no path where slides belonging to one row are edited under
 * the identity of another.
 *
 * The result is saved and a version appended, so the previous state is
 * recoverable. An AI edit rewrites every slide by construction, and an
 * unrecoverable "improve this" is not an edit anyone should risk.
 */
export async function POST(request: Request, { params }: { params: { id: string } }) {
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
      scope: "presentation_edit",
      identifier: user.id,
      maxAttempts: maxPresentationEditsPerHour(),
      windowMinutes: 60,
    });
    if (!limited.allowed) {
      return NextResponse.json(
        { ok: false, error: "Too many edits at once. Try again shortly." },
        { status: 429 }
      );
    }

    const body = await request.json().catch(() => null);
    const instructionCheck = validateInstruction(body?.instruction);
    if (!instructionCheck.ok) {
      return NextResponse.json({ ok: false, error: instructionCheck.error }, { status: 400 });
    }

    const { data: deck, error: readError } = await supabase
      .from("user_presentations")
      .select("id, title, slides, language")
      .eq("id", params.id)
      .eq("user_id", user.id)
      .maybeSingle();

    if (readError) {
      logApiError("/api/presentations/[id]/edit", readError, { stage: "select" });
      return NextResponse.json({ ok: false, error: "Could not load the presentation." }, { status: 500 });
    }
    if (!deck) {
      return NextResponse.json({ ok: false, error: "Not found." }, { status: 404 });
    }

    const slides = withUniqueIds(normaliseSlides(deck.slides));
    if (slides.length === 0) {
      return NextResponse.json(
        { ok: false, error: "This presentation has no slides to edit." },
        { status: 400 }
      );
    }

    const breaker = await checkAiCallAllowed(
      user.id,
      "presentation_edit",
      fingerprintRequest(user.id, `${params.id}:${instructionCheck.instruction}`)
    );
    if (!breaker.allowed) {
      return NextResponse.json({ ok: false, error: breaker.reason }, { status: 429 });
    }

    const isAdmin = isAdminEmail(user.email);
    const bypassCredits = isAdmin || (await hasActiveBetaBypass(user));
    const plan = await resolveEffectivePlan(user);
    const pricingConfig = resolvePricingConfig(plan?.slug ?? null);
    const accountCreditPriceEur = bypassCredits
      ? pricingConfig.creditPriceEur
      : effectiveCreditPriceEurForAccount(
          plan,
          await getPurchasedPackCreditPriceEur(user.id),
          pricingConfig
        );

    // The WHOLE DECK is the input, not the instruction — an edit re-sends
    // every slide so the model can return every slide. Pricing this off
    // the instruction's length would quote a 30-slide deck the same as a
    // three-slide one and hold far too little for the former.
    const inputChars = deckCharCount(slides) + instructionCheck.instruction.length;
    const estimate = estimateForAction(
      "presentationEdit",
      { model: PRESENTATION_MODEL, inputChars },
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
            error: `This edit costs about ${estimate.estimatedCredits} credits, and you do not have enough.`,
          },
          { status: 402 }
        );
      }
      const reservation = await reserveCredits(user.id, estimate.reserveCredits, "presentation_edit", {
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

    const settle = async (outcome: string) =>
      settleReservation({
        userId: user.id,
        reservationId,
        feature: "presentation_edit",
        costs,
        plan,
        bypassCharge: bypassCredits || !plan,
        metadata: { outcome, presentationId: params.id },
      });

    const anthropic = new Anthropic({ apiKey });
    const edited = await editDeck({
      anthropic,
      title: deck.title ?? "",
      slides,
      instruction: instructionCheck.instruction,
      language: deck.language ?? "en",
      costs,
    });

    if (!edited.ok) {
      await settle(edited.reason);
      return NextResponse.json(
        { ok: false, error: "The AI could not apply that change. Try describing it differently." },
        { status: 502 }
      );
    }

    // Only slides whose picture the edit invalidated are looked up again
    // — resolveDeckImages skips any slide that already has a URL, so an
    // edit to the text of one slide does not re-hit Unsplash for the
    // other nine.
    const withImages = await resolveDeckImages(edited.slides);
    const settled = await settle("edited");

    const { data: saved, error: saveError } = await supabase
      .from("user_presentations")
      .update({ title: edited.title, slides: withImages })
      .eq("id", params.id)
      .eq("user_id", user.id)
      .select("id, title, brief, language, theme, slides, sources, status, credits_charged, share_slug, share_enabled, created_at, updated_at")
      .maybeSingle();

    if (saveError || !saved) {
      logApiError("/api/presentations/[id]/edit", saveError, { stage: "update" });
      // The user has been charged for work that then failed to save.
      // Reported as an error rather than swallowed, because the deck on
      // their screen is now not the deck in the database.
      return NextResponse.json(
        { ok: false, error: "The change was made but could not be saved. Try again." },
        { status: 500 }
      );
    }

    await appendVersion({
      supabase,
      presentationId: params.id,
      userId: user.id,
      title: edited.title,
      slides: withImages,
      changeSummary: edited.summary || instructionCheck.instruction,
    });

    return NextResponse.json({
      ok: true,
      presentation: saved,
      summary: edited.summary,
      usage: buildUsageReceipt({
        creditsCharged: settled.creditsCharged,
        bypass: bypassCredits,
        wouldHaveCharged: null,
      }),
    });
  } catch (err) {
    logApiError("/api/presentations/[id]/edit", err, {});
    return NextResponse.json({ ok: false, error: "Something went wrong." }, { status: 500 });
  }
}
