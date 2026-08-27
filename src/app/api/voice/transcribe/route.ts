import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isAdminEmail } from "@/lib/auth/admin-emails";
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
import { buildUsageReceipt } from "@/lib/billing/usage-receipt";
import { checkRateLimit } from "@/lib/rate-limit";
import { logApiError } from "@/lib/log-error";
import {
  MAX_CLIP_SECONDS,
  transcribeCostUsd,
  voiceCredits,
  voiceMinutesForPlan,
} from "@/lib/voice/voice-pricing";
import { MAX_AUDIO_BYTES, isAcceptedAudioType, languageHint } from "@/lib/voice/voice-config";
import { consumeVoiceSeconds, readVoiceUsage } from "@/lib/voice/voice-usage";
import { transcribeAudio } from "@/lib/voice/voice-providers";

export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";
export const maxDuration = 60; // @function-limit 60

/**
 * SPEECH IN.
 *
 * THE ORDER OF THE CHECKS IS THE DESIGN. Every one of them happens
 * before a single byte reaches a provider, because every one of them is
 * a reason the request must cost nothing:
 *
 *   1. authenticated       — no account, no ledger to charge
 *   2. rate limited        — one person cannot flood two providers
 *   3. the clip is sane    — size and duration, before it is read
 *   4. the plan includes voice at all
 *   5. the monthly minutes are consumed ATOMICALLY, and refused if they
 *      do not fit — after this the seconds are spent whatever happens,
 *      which is the safe direction (see lib/voice/voice-usage.ts)
 *   6. the credits are held
 *
 * NOTHING IS STORED. The Blob lives in this function's memory, goes to
 * the provider, and is gone. There is no bucket and no column to put it
 * in — see the 20260827 migration's header.
 */
export async function POST(request: Request) {
  try {
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ ok: false, code: "unauthenticated", error: "Not authenticated." }, { status: 401 });

    const limited = await checkRateLimit({
      scope: "voice_transcribe",
      identifier: user.id,
      maxAttempts: 120,
      windowMinutes: 60,
    });
    if (!limited.allowed) {
      return NextResponse.json(
        { ok: false, code: "rate_limited", error: "Too many recordings in the last hour." },
        { status: 429 }
      );
    }

    let form: FormData;
    try {
      form = await request.formData();
    } catch {
      return NextResponse.json({ ok: false, code: "bad_request", error: "Invalid request body." }, { status: 400 });
    }

    const audio = form.get("audio");
    if (!(audio instanceof Blob)) {
      return NextResponse.json({ ok: false, code: "no_recording", error: "No recording was sent." }, { status: 400 });
    }
    if (audio.size === 0) {
      return NextResponse.json({ ok: false, code: "empty", error: "That recording was empty." }, { status: 400 });
    }
    if (audio.size > MAX_AUDIO_BYTES) {
      return NextResponse.json(
        { ok: false, code: "too_large", error: "That recording is too long." },
        { status: 413 }
      );
    }
    if (!isAcceptedAudioType(audio.type)) {
      return NextResponse.json(
        { ok: false, code: "unsupported_type", error: "That audio format is not supported." },
        { status: 415 }
      );
    }

    // THE DURATION THE BROWSER MEASURED, clamped. It decides what the
    // cap consumes and what the estimate holds; the byte ceiling above
    // is what stops a client that under-reports it from mattering.
    const rawDuration = Number(form.get("seconds") ?? 0);
    const seconds = Math.min(
      MAX_CLIP_SECONDS,
      Math.max(1, Number.isFinite(rawDuration) ? Math.ceil(rawDuration) : 1)
    );

    const plan = await resolveEffectivePlan(user);
    const isAdmin = isAdminEmail(user.email);
    const bypassCredits = isAdmin || (await hasActiveBetaBypass(user));
    if (bypassCredits) {
      const ceiling = await checkBypassCeiling(user.id, isAdmin, bypassCredits && !isAdmin);
      if (!ceiling.allowed) {
        return NextResponse.json({ ok: false, code: "capacity", error: ceiling.reason }, { status: 429 });
      }
    }

    // A PLAN THAT DOES NOT INCLUDE VOICE gets a different sentence from
    // one that has used its minutes up — "upgrade" and "wait until next
    // month" are not the same instruction.
    const limitMinutes = voiceMinutesForPlan(plan.slug);
    const admin = createAdminClient();
    if (limitMinutes <= 0) {
      return NextResponse.json(
        { ok: false, code: "not_included", error: "Voice is not included on this plan." },
        { status: 403 }
      );
    }

    const consumed = await consumeVoiceSeconds(admin, {
      userId: user.id,
      seconds,
      characters: 0,
      limitMinutes,
      kind: "transcribe",
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
    const usdCost = transcribeCostUsd(seconds);
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
        kind: "transcribe",
        seconds,
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

    const result = await transcribeAudio({
      audio,
      filename: `clip.${audio.type.includes("mp4") ? "mp4" : "webm"}`,
      durationSeconds: seconds,
      languageHint: languageHint(String(form.get("locale") ?? "")),
    });

    if (!result.ok) {
      // NOTHING WAS SPENT WITH THE PROVIDER on any of these paths, so
      // the hold goes back. The MINUTES do not: they were consumed
      // atomically before the call, which is the trade-off
      // lib/voice/voice-usage.ts states out loud.
      await releaseReservation(user.id, reservationId);
      const status =
        result.failure.kind === "not_configured" ? 503 : result.failure.kind === "empty" ? 422 : 502;
      return NextResponse.json(
        { ok: false, code: result.failure.kind, error: result.failure.detail },
        { status }
      );
    }

    const costs = new CostAccumulator();
    costs.recordExternal("transcribe", {
      provider: "openai",
      usdCost: result.usdCost,
      units: seconds,
      unit: "seconds",
    });

    const settlement = await settleReservation({
      userId: user.id,
      reservationId,
      feature: "voice",
      costs,
      plan,
      bypassCharge: bypassCredits,
      metadata: { kind: "transcribe", seconds, detectedLanguage: result.language },
    });

    return NextResponse.json({
      ok: true,
      // THE TRANSCRIPT IS RETURNED, NOT SENT. The user edits it and
      // presses send themselves — see components/voice/voice-input.tsx.
      text: result.text,
      language: result.language,
      seconds,
      usage: buildUsageReceipt({
        creditsCharged: settlement.creditsCharged,
        bypass: bypassCredits,
        wouldHaveCharged: null,
      }),
      minutes: { usedSeconds: consumed.usedSeconds, remainingSeconds: consumed.remainingSeconds, limitMinutes },
    });
  } catch (err) {
    logApiError("/api/voice/transcribe", err);
    return NextResponse.json({ ok: false, code: "failed", error: "Something went wrong." }, { status: 500 });
  }
}
