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
import { transcribeCostUsd, voiceCredits, voiceMinutesForPlan } from "@/lib/voice/voice-pricing";
import { consumeVoiceSeconds, readVoiceUsage } from "@/lib/voice/voice-usage";
import { transcribeAudio } from "@/lib/voice/voice-providers";
import {
  checkMeetingUpload,
  isMeetingAudioType,
  meetingLimits,
  secondsFromBytes,
} from "@/lib/meetings/meeting-limits";
import { normaliseLanguage, titleFromTranscript } from "@/lib/meetings/meeting-analysis";

export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";
export const maxDuration = 800; // @function-limit 800

/**
 * A MEETING GOES IN. NO AUDIO COMES OUT, AND NONE IS LEFT BEHIND.
 *
 * The Blob lives in this function's memory, goes to the provider, and is
 * unreferenced when the function returns. There is no bucket, no column
 * and no path — see the header of 20261006000000_meetings.sql for why
 * that is a schema decision rather than a `finally` block: a function
 * killed at its ceiling runs no `finally`, and a recording of somebody
 * else's staff meeting is not a thing to leave to a cleanup job.
 *
 * THE ORDER OF THE CHECKS IS THE DESIGN, the same as
 * api/voice/transcribe: every one of them is a reason this request must
 * cost nothing, and every one happens before a byte reaches a provider.
 *
 * EVERY REFUSAL IS A CODE AND NOT A SENTENCE, which is a departure from
 * the forty-odd routes around it and is the direction they are supposed
 * to move in. scripts/tests/i18n-coverage.test.mjs holds a census of
 * server-side English prose at 666 and the comment above that number
 * says what the fix is: "routes returning stable error CODES the client
 * looks up". These four routes do that — components/meetings/
 * meetings-workspace.tsx turns each code into a sentence in the reader's
 * language, and `dashboard.meetings.errors.*` is that sentence in ten of
 * them. An English `error:` string beside the code would be a string
 * nothing renders, in one language, counted by a ratchet that exists to
 * stop exactly that.
 *
 * IT SHARES THE VOICE METER ON PURPOSE. The same Whisper seconds at the
 * same price — a second, separate monthly allowance for meetings would be
 * a second uncapped way to spend the owner's money on the same API. The
 * consequence is stated rather than hidden: a Starter plan's 30 minutes
 * is one long meeting or two short ones, and the limits are
 * env-overridable (VOICE_LIMIT_*) precisely so that is a decision on a
 * dashboard rather than a deploy.
 */
export async function POST(request: Request) {
  try {
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json(
        { ok: false, code: "unauthenticated" },
        { status: 401 }
      );
    }

    // Lower than the voice route's 120/hour: these are minutes each, not
    // seconds, and the ceiling that matters is the monthly meter below.
    const limited = await checkRateLimit({
      scope: "meeting_transcribe",
      identifier: user.id,
      maxAttempts: 20,
      windowMinutes: 60,
    });
    if (!limited.allowed) {
      return NextResponse.json(
        { ok: false, code: "rate_limited" },
        { status: 429 }
      );
    }

    let form: FormData;
    try {
      form = await request.formData();
    } catch {
      // A body over the host's ~4.5MB cap never reaches this function at
      // all — the platform answers with an HTML 413 the client sees as a
      // non-JSON response. That is why MAX_MEETING_BYTES is below the
      // host's cap: so OUR refusal, with both numbers in it, is the one
      // the user reads.
      return NextResponse.json(
        { ok: false, code: "bad_request" },
        { status: 400 }
      );
    }

    const audio = form.get("audio");
    if (!(audio instanceof Blob)) {
      return NextResponse.json(
        { ok: false, code: "no_recording" },
        { status: 400 }
      );
    }
    if (!isMeetingAudioType(audio.type)) {
      return NextResponse.json(
        { ok: false, code: "unsupported_type" },
        { status: 415 }
      );
    }

    // THE SAME CHECK THE BROWSER ALREADY RAN, because the browser's copy
    // is for the message and this one is the check. The limits are
    // computed from THIS process's function budget; the client is handed
    // them by the page and never derives them, since
    // process.env.MAX_FUNCTION_DURATION is undefined in a browser and a
    // client deriving them would offer a ceiling a 60s deployment refuses.
    const limits = meetingLimits();
    const reported = Number(form.get("seconds") ?? 0);
    const verdict = checkMeetingUpload(
      { bytes: audio.size, seconds: Number.isFinite(reported) ? reported : 0 },
      limits
    );
    if (!verdict.ok) {
      // REFUSED WITH BOTH NUMBERS, NEVER TRUNCATED. Half a meeting
      // transcribed reads as a whole one: the summary looks complete and
      // the actions from the second half are simply absent, with nothing
      // on the screen saying which half is missing.
      const status = verdict.reason === "too_large" ? 413 : verdict.reason === "empty" ? 400 : 422;
      const { ok: _ignored, reason, ...numbers } = verdict;
      return NextResponse.json(
        { ok: false, code: reason, limits, ...numbers },
        { status }
      );
    }

    // What the meter and the price are computed from. A browser that
    // could not read the duration reports 0; the bytes then stand in,
    // because a free path through the meter is a way to use the feature
    // for nothing rather than a kindness.
    const seconds = Math.max(
      1,
      Math.min(limits.maxSeconds, Math.ceil(reported) || secondsFromBytes(audio.size))
    );

    const plan = await resolveEffectivePlan(user);
    const isAdmin = isAdminEmail(user.email);
    const bypassCredits = isAdmin || (await hasActiveBetaBypass(user));
    if (bypassCredits) {
      const ceiling = await checkBypassCeiling(user.id, isAdmin, bypassCredits && !isAdmin);
      if (!ceiling.allowed) {
        return NextResponse.json(
          { ok: false, code: "capacity", error: ceiling.reason },
          { status: 429 }
        );
      }
    }

    const limitMinutes = voiceMinutesForPlan(plan.slug);
    const admin = createAdminClient();
    if (limitMinutes <= 0) {
      return NextResponse.json(
        { ok: false, code: "not_included" },
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
              ? "You have used this month's minutes."
              : "Usage could not be checked right now.",
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
    const estimatedCredits = voiceCredits(
      transcribeCostUsd(seconds),
      { ...pricingConfig, creditPriceEur },
      margin
    );

    let reservationId = "";
    if (!bypassCredits) {
      const affordable = await hasEnoughCredits(user.id, estimatedCredits, plan);
      if (!affordable.ok) {
        return NextResponse.json(
          {
            ok: false,
            code: "insufficient_credits",
            insufficientCredits: true,
          },
          { status: 402 }
        );
      }
      const reservation = await reserveCredits(user.id, estimatedCredits, "voice", {
        kind: "meeting_transcribe",
        seconds,
      });
      if (!reservation.ok) {
        return NextResponse.json(
          {
            ok: false,
            code: "reserve_failed",
            insufficientCredits: reservation.reason === "insufficient",
          },
          { status: 402 }
        );
      }
      reservationId = reservation.reservationId;
    }

    // NO LANGUAGE HINT, AND THAT IS THE OPPOSITE OF api/voice/transcribe.
    //
    // There the hint is the UI locale and it earns its place: the clips
    // are seconds long and detection is genuinely shaky on them. A
    // meeting is minutes long, where Whisper detects reliably on its own
    // — and the hint would then be actively harmful, because the whole
    // point of this feature is that the summary comes back in the
    // language of the ROOM. A user reading a Greek interface who recorded
    // an English call must not have the transcript biased towards Greek.
    const result = await transcribeAudio({
      audio,
      filename: `meeting.${audio.type.includes("mp4") || audio.type.includes("m4a") ? "mp4" : audio.type.includes("mpeg") ? "mp3" : "webm"}`,
      durationSeconds: seconds,
    });

    if (!result.ok) {
      // NOTHING WAS SPENT WITH THE PROVIDER, so the hold goes back. The
      // MINUTES do not: they were consumed atomically before the call,
      // which is the trade-off lib/voice/voice-usage.ts states out loud.
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
      metadata: { kind: "meeting_transcribe", seconds, detectedLanguage: result.language },
    });

    // THE ROW IS WRITTEN AFTER THE SETTLEMENT, which is the order
    // docs/shapes.md #36 is about: the state the user sees is the LAST
    // write, so a settlement that throws cannot leave a meeting on the
    // screen that was never paid for.
    const fallbackTitle = String(form.get("title") ?? "").replace(/\s+/g, " ").trim();
    const { data: row, error } = await supabase
      .from("meetings")
      .insert({
        user_id: user.id,
        // NEVER THE FILENAME. Recordings are called things like
        // "Σύσκεψη με Παπαδόπουλο 14-03.m4a" — a person's name and a
        // date, which the uploader did not decide to put in a list they
        // might screen-share.
        title: titleFromTranscript(result.text, fallbackTitle),
        // A CODE, NEVER THE PROVIDER'S WORD. Whisper answers "greek";
        // the column and the screen both want "el". See normaliseLanguage.
        language: normaliseLanguage(result.language),
        transcript: result.text,
        duration_seconds: seconds,
        credits_charged: settlement.creditsCharged,
      })
      .select("id, title, language, transcript, duration_seconds, credits_charged, created_at")
      .single();

    if (error || !row) {
      logApiError("/api/meetings/transcribe", error, { stage: "insert" });
      // THE TRANSCRIPT STILL COMES BACK. It was made and it was paid for;
      // losing it because a row would not write is the user paying twice
      // for the same minute. The screen shows it with a warning that it
      // was not saved.
      return NextResponse.json({
        ok: true,
        saved: false,
        meeting: null,
        transcript: result.text,
        // A CODE, NEVER THE PROVIDER'S WORD. Whisper answers "greek";
        // the column and the screen both want "el". See normaliseLanguage.
        language: normaliseLanguage(result.language),
        seconds,
        usage: buildUsageReceipt({
          creditsCharged: settlement.creditsCharged,
          bypass: bypassCredits,
          wouldHaveCharged: null,
        }),
      });
    }

    return NextResponse.json({
      ok: true,
      saved: true,
      meeting: row,
      transcript: result.text,
      language: normaliseLanguage(result.language),
      seconds,
      usage: buildUsageReceipt({
        creditsCharged: settlement.creditsCharged,
        bypass: bypassCredits,
        wouldHaveCharged: null,
      }),
      minutes: {
        usedSeconds: consumed.usedSeconds,
        remainingSeconds: consumed.remainingSeconds,
        limitMinutes,
      },
    });
  } catch (err) {
    logApiError("/api/meetings/transcribe", err);
    return NextResponse.json(
      { ok: false, code: "failed" },
      { status: 500 }
    );
  }
}
