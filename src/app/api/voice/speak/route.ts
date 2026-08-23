import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isAdminEmail } from "@/lib/admin";
import { hasActiveBetaBypass } from "@/lib/beta";
import { checkBypassCeiling } from "@/lib/billing/bypass-ceiling";
import {
  hasEnoughCredits,
  resolveEffectivePlan,
  getPurchasedPackCreditPriceEur,
} from "@/lib/billing/credits";
import { resolvePricingConfig } from "@/lib/billing/pricing-config";
import { effectiveCreditPriceEurForAccount } from "@/lib/billing/credit-formula";
import { resolveMarginFor } from "@/lib/billing/margin-policy";
import { CostAccumulator } from "@/lib/billing/cost-accumulator";
import { reserveCredits, settleReservation, releaseReservation } from "@/lib/billing/reservations";
import { checkRateLimit } from "@/lib/rate-limit";
import { logApiError } from "@/lib/log-error";
import {
  MAX_SPEAK_CHARS,
  speakCharsToSeconds,
  speakCostUsd,
  voiceCredits,
  voiceMinutesForPlan,
} from "@/lib/voice/voice-pricing";
import { DEFAULT_VOICE, isVoiceKey } from "@/lib/voice/voice-config";
import { consumeVoiceSeconds, readVoiceUsage } from "@/lib/voice/voice-usage";
import { synthesiseSpeech } from "@/lib/voice/voice-providers";

export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";
export const maxDuration = 60; // @function-limit 60

/**
 * SPEECH OUT — "Listen" on a chat answer, a research report, an agent
 * summary.
 *
 * SPEECH IS THE EXPENSIVE HALF, by an order of magnitude, and that is a
 * product fact rather than an implementation detail: transcription is
 * about 2 credits a minute and synthesis is about 32. So the price is on
 * the button before it is pressed (components/voice/voice-player.tsx),
 * and the same checks that guard the microphone guard this — in the same
 * order, for the same reasons.
 *
 * THE AUDIO IS STREAMED AND FORGOTTEN. It is returned as a body, never
 * written to a bucket or a cache. Pressing play twice costs twice; the
 * alternative is a store of synthesised recordings of somebody's private
 * research.
 */
export async function POST(request: Request) {
  try {
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ ok: false, code: "unauthenticated", error: "Not authenticated." }, { status: 401 });

    const limited = await checkRateLimit({
      scope: "voice_speak",
      identifier: user.id,
      maxAttempts: 120,
      windowMinutes: 60,
    });
    if (!limited.allowed) {
      return NextResponse.json(
        { ok: false, code: "rate_limited", error: "Too many playback requests in the last hour." },
        { status: 429 }
      );
    }

    let text: string;
    let voiceKey: string;
    try {
      const body = await request.json();
      text = typeof body?.text === "string" ? body.text.trim().slice(0, MAX_SPEAK_CHARS) : "";
      voiceKey = isVoiceKey(body?.voice) ? body.voice : DEFAULT_VOICE;
    } catch {
      return NextResponse.json({ ok: false, code: "bad_request", error: "Invalid request body." }, { status: 400 });
    }
    if (!text) {
      return NextResponse.json({ ok: false, code: "empty", error: "There is nothing to read." }, { status: 400 });
    }

    const plan = await resolveEffectivePlan(user);
    const isAdmin = isAdminEmail(user.email);
    const bypassCredits = isAdmin || (await hasActiveBetaBypass(user));
    if (bypassCredits) {
      const ceiling = await checkBypassCeiling(user.id, isAdmin, bypassCredits && !isAdmin);
      if (!ceiling.allowed) {
        return NextResponse.json({ ok: false, code: "capacity", error: ceiling.reason }, { status: 429 });
      }
    }

    const limitMinutes = voiceMinutesForPlan(plan.slug);
    const admin = createAdminClient();
    if (limitMinutes <= 0) {
      return NextResponse.json(
        { ok: false, code: "not_included", error: "Voice is not included on this plan." },
        { status: 403 }
      );
    }

    // CHARACTERS ARE COUNTED AS SECONDS against the same monthly budget,
    // so "minutes of voice" stays one number a person can hold rather
    // than two that have to be added up in their head.
    const seconds = speakCharsToSeconds(text.length);
    const consumed = await consumeVoiceSeconds(admin, {
      userId: user.id,
      seconds,
      characters: text.length,
      limitMinutes,
      kind: "speak",
    });
    if (!consumed.ok) {
      const allowance = await readVoiceUsage(admin, user.id, limitMinutes);
      return NextResponse.json(
        {
          ok: false,
          code: consumed.reason === "over_limit" ? "out_of_minutes" : "usage_unavailable",
          error:
            consumed.reason === "over_limit"
              ? "You have used this month's voice minutes."
              : "Voice usage could not be checked right now.",
          usage: { usedSeconds: allowance.usedSeconds, limitMinutes },
        },
        { status: consumed.reason === "over_limit" ? 402 : 503 }
      );
    }

    const pricingConfig = resolvePricingConfig();
    const creditPriceEur = effectiveCreditPriceEurForAccount(
      plan,
      await getPurchasedPackCreditPriceEur(user.id),
      pricingConfig
    );
    const margin = resolveMarginFor("voice", plan.slug, pricingConfig).margin;
    const usdCost = speakCostUsd(text.length);
    const estimatedCredits = voiceCredits(usdCost, { ...pricingConfig, creditPriceEur }, margin);

    let reservationId = "";
    if (!bypassCredits) {
      const affordable = await hasEnoughCredits(user.id, estimatedCredits, plan);
      if (!affordable.ok) {
        return NextResponse.json(
          { ok: false, code: "insufficient_credits", insufficientCredits: true, error: "Not enough credits." },
          { status: 402 }
        );
      }
      const reservation = await reserveCredits(user.id, estimatedCredits, "voice", {
        kind: "speak",
        characters: text.length,
      });
      if (!reservation.ok) {
        return NextResponse.json(
          {
            ok: false,
            code: "reserve_failed",
            insufficientCredits: reservation.reason === "insufficient",
            error: "Could not reserve credits.",
          },
          { status: 402 }
        );
      }
      reservationId = reservation.reservationId;
    }

    const result = await synthesiseSpeech({ text, voiceKey });
    if (!result.ok) {
      await releaseReservation(user.id, reservationId);
      const status =
        result.failure.kind === "not_configured" ? 503 : result.failure.kind === "empty" ? 422 : 502;
      return NextResponse.json(
        { ok: false, code: result.failure.kind, error: result.failure.detail },
        { status }
      );
    }

    const costs = new CostAccumulator();
    costs.recordExternal("speak", {
      provider: "elevenlabs",
      usdCost: result.usdCost,
      units: text.length,
      unit: "characters",
    });

    const settlement = await settleReservation({
      userId: user.id,
      reservationId,
      feature: "voice",
      costs,
      plan,
      bypassCharge: bypassCredits,
      metadata: { kind: "speak", characters: text.length, voice: voiceKey },
    });

    // THE RECEIPT TRAVELS IN HEADERS because the body is the audio. The
    // player reads them to update the credit counter and the remaining
    // minutes without a second request.
    return new NextResponse(result.audio, {
      status: 200,
      headers: {
        "Content-Type": result.contentType,
        "Content-Length": String(result.audio.byteLength),
        "Cache-Control": "no-store",
        "X-Voice-Credits": String(settlement.creditsCharged),
        "X-Voice-Seconds-Used": String(consumed.usedSeconds),
        "X-Voice-Seconds-Remaining": String(consumed.remainingSeconds),
        "X-Voice-Limit-Minutes": String(limitMinutes),
      },
    });
  } catch (err) {
    logApiError("/api/voice/speak", err);
    return NextResponse.json({ ok: false, code: "failed", error: "Something went wrong." }, { status: 500 });
  }
}
