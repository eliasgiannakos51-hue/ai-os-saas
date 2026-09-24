import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
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
import { estimateForAction } from "@/lib/billing/estimate";
import { CostAccumulator } from "@/lib/billing/cost-accumulator";
import { reserveCredits, settleReservation } from "@/lib/billing/reservations";
import { buildUsageReceipt } from "@/lib/billing/usage-receipt";
import { checkRateLimit } from "@/lib/rate-limit";
import {
  checkAiCallAllowed,
  fingerprintRequest,
  recordAiCallForDailySpend,
} from "@/lib/ai-circuit-breaker";
import { logApiError } from "@/lib/log-error";
import { analyseMeeting } from "@/lib/meetings/meeting-analyse-call";
import { isAnalysable } from "@/lib/meetings/meeting-analysis";

export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";
export const maxDuration = 300; // @function-limit 300

/**
 * THE TRANSCRIPT BECOMES A SUMMARY AND A LIST OF PROPOSALS.
 *
 * SEPARATE FROM THE UPLOAD, and the reason is the audio. Folding this
 * into api/meetings/transcribe would hold the recording in memory for the
 * length of a model call as well as a transcription, and would make a
 * failed summary cost the user the transcription again. Here the audio is
 * already gone and the input is a row they own.
 *
 * NOTHING IS CREATED. It writes the summary and the proposals onto the
 * meeting row and stops. `proposed_actions` is jsonb — data about the
 * meeting, not entities — and public.meeting_actions is not touched from
 * this file. The only writer of that table is
 * api/meetings/[id]/actions/route.ts, which requires the user to have
 * chosen.
 */
export async function POST(_request: Request, { params }: { params: { id: string } }) {
  const meetingId = params.id;
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

    const limited = await checkRateLimit({
      scope: "meeting_analyse",
      identifier: user.id,
      maxAttempts: 40,
      windowMinutes: 60,
    });
    if (!limited.allowed) {
      return NextResponse.json(
        { ok: false, code: "rate_limited" },
        { status: 429 }
      );
    }

    // Read through the USER'S session client, so RLS decides whether this
    // row is theirs rather than a filter this route remembered to write.
    const { data: meeting, error: readError } = await supabase
      .from("meetings")
      .select("id, transcript, language")
      .eq("id", meetingId)
      .maybeSingle();
    if (readError) {
      logApiError("/api/meetings/[id]/analyse", readError, { stage: "read" });
      return NextResponse.json(
        { ok: false, code: "failed" },
        { status: 500 }
      );
    }
    if (!meeting) {
      return NextResponse.json(
        { ok: false, code: "not_found" },
        { status: 404 }
      );
    }

    const transcript = String(meeting.transcript ?? "");
    if (!isAnalysable(transcript)) {
      // NOT AN ERROR AND NOT A CHARGE. A recording of silence is a thing
      // that happens; saying so costs nothing and pretending to summarise
      // it would cost the user a model call to be told the same.
      return NextResponse.json(
        { ok: false, code: "too_short" },
        { status: 422 }
      );
    }

    // THE CIRCUIT BREAKER, and the fingerprint is the meeting rather than
    // the transcript: re-pressing "try again" on the same failed analysis
    // is the exact repeat this is for, and hashing 15,000 characters to
    // learn that is work for nothing.
    const breaker = await checkAiCallAllowed(
      user.id,
      "meeting_analyse",
      fingerprintRequest(meetingId, String(transcript.length))
    );
    if (!breaker.allowed) {
      return NextResponse.json({ ok: false, code: "rate_limited" }, { status: 429 });
    }

    const plan = await resolveEffectivePlan(user);
    const isAdmin = isAdminEmail(user.email);
    const bypassCredits = isAdmin || (await hasActiveBetaBypass(user));
    // THE CEILING AN ACCOUNT THAT PAYS NOTHING STILL HAS. An admin or a
    // beta account skips the credit check, and without this the only
    // thing standing between one of them and an unbounded Anthropic bill
    // is the rate limiter — which counts requests, not money.
    if (bypassCredits) {
      const ceiling = await checkBypassCeiling(user.id, isAdmin, bypassCredits && !isAdmin);
      if (!ceiling.allowed) {
        return NextResponse.json({ ok: false, code: "capacity" }, { status: 429 });
      }
    }

    const pricingConfig = resolvePricingConfig();
    const creditPriceEur = effectiveCreditPriceEurForAccount(
      plan,
      await getPurchasedPackCreditPriceEur(user.id),
      pricingConfig
    );
    const margin = resolveMarginFor("meeting_analyse", plan.slug, pricingConfig).margin;
    const estimate = estimateForAction(
      "meetingAnalyse",
      { model: "claude-sonnet-4-6", inputChars: transcript.length, planSlug: plan.slug },
      { ...pricingConfig, creditPriceEur },
      creditPriceEur,
      margin
    );

    let reservationId = "";
    if (!bypassCredits) {
      const affordable = await hasEnoughCredits(user.id, estimate.reserveCredits, plan);
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
      const reservation = await reserveCredits(user.id, estimate.reserveCredits, "meeting_analyse", {
        meetingId,
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

    const costs = new CostAccumulator();
    const outcome = await analyseMeeting(transcript, meeting.language, {
      costs,
      userId: user.id,
    });
    // THE PLATFORM-WIDE COUNTER SEES THIS CALL. Recorded whatever the
    // outcome: a provider that answered unusably still cost money, and a
    // daily-spend figure that only counts successes is a figure that goes
    // up slower than the bill. The estimate is what every other caller
    // records — the settled figure is not known yet at this point and
    // waiting for it would leave the breaker blind for the length of a
    // model call, which is when it matters.
    void recordAiCallForDailySpend(estimate.estimatedCredits);

    if (!outcome.ok) {
      // A FAILURE STILL SETTLES WHEN THE MODEL ANSWERED. `unusable` means
      // tokens were spent and the reply did not parse — releasing the
      // hold there would have the owner pay for the call. `ai_unavailable`
      // means nothing was spent, and the accumulator is empty, so
      // settlement charges nothing. One path, two honest outcomes.
      await settleReservation({
        userId: user.id,
        reservationId,
        feature: "meeting_analyse",
        costs,
        plan,
        bypassCharge: bypassCredits,
        metadata: { meetingId, outcome: outcome.code },
      });
      // The CODE is stored, never a sentence: the page renders its own
      // translated wording, in ten languages.
      await supabase
        .from("meetings")
        .update({ analysis_error: outcome.code, analysed_at: new Date().toISOString() })
        .eq("id", meetingId);
      return NextResponse.json({ ok: false, code: outcome.code }, { status: 502 });
    }

    const settlement = await settleReservation({
      userId: user.id,
      reservationId,
      feature: "meeting_analyse",
      costs,
      plan,
      bypassCharge: bypassCredits,
      metadata: { meetingId, actions: outcome.analysis.actions.length },
    });

    const { data: row, error: writeError } = await supabase
      .from("meetings")
      .update({
        summary: outcome.analysis.summary,
        // INERT. A jsonb column on the meeting, not rows in
        // meeting_actions — see the migration header. Nothing joins to
        // it, nothing else reads it, and it appears on no other screen.
        proposed_actions: outcome.analysis.actions,
        analysis_error: null,
        analysed_at: new Date().toISOString(),
      })
      .eq("id", meetingId)
      .select("id, summary, proposed_actions, analysed_at")
      .single();

    if (writeError || !row) {
      logApiError("/api/meetings/[id]/analyse", writeError, { stage: "write" });
      return NextResponse.json(
        { ok: false, code: "failed" },
        { status: 500 }
      );
    }

    return NextResponse.json({
      ok: true,
      meeting: row,
      usage: buildUsageReceipt({
        creditsCharged: settlement.creditsCharged,
        bypass: bypassCredits,
        wouldHaveCharged: null,
      }),
    });
  } catch (err) {
    logApiError("/api/meetings/[id]/analyse", err);
    return NextResponse.json(
      { ok: false, code: "failed" },
      { status: 500 }
    );
  }
}
