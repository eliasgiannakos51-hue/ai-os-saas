import { NextResponse } from "next/server";
import { getLocale } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { logApiError } from "@/lib/log-error";
import { isAdminEmail } from "@/lib/auth/admin-emails";
import { hasActiveBetaBypass } from "@/lib/beta";
import { checkBypassCeiling } from "@/lib/billing/bypass-ceiling";
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
import { buildUsageReceipt } from "@/lib/billing/usage-receipt";
import { checkRateLimit } from "@/lib/rate-limit";
import { checkAiCallAllowed, fingerprintRequest } from "@/lib/ai-circuit-breaker";
import { askAboutMeeting } from "@/lib/meetings/meeting-ask-call";
import { MEETING_ASK_MAX_QUESTION_CHARS } from "@/lib/meetings/meeting-ask";
import { isAnalysable, type ProposedAction } from "@/lib/meetings/meeting-analysis";

export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";
export const maxDuration = 60; // @function-limit 60

/**
 * Κομμάτι 6: "Πατάς γραμμή" became "ρωτάς με λόγια" — a question about
 * ONE meeting, answered strictly from ITS OWN transcript/summary/actions
 * (lib/meetings/meeting-ask.ts), never from another meeting or the
 * account's other data.
 *
 * SAME RESERVE-THEN-SETTLE SHAPE AS api/data-analysis/[id]/ask AND
 * api/my-stuff/ask — declared in scripts/tests/billing-coverage.test.mjs's
 * ROUTED table, which is what requires this shape to stay honest as the
 * file changes.
 *
 * THE QUESTION IS SILENTLY BOUNDED, NOT REFUSED — the same choice
 * api/data-analysis/[id]/ask makes with its own MAX_QUESTION_CHARS: a
 * question a few characters over the ceiling is still a question, and
 * there is nothing kinder about telling the person to retype it shorter.
 */
export async function POST(request: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const meetingId = params.id;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "not_signed_in" }, { status: 401 });

  try {
    const body = (await request.json()) as { question?: unknown };
    const question = typeof body.question === "string" ? body.question.trim().slice(0, MEETING_ASK_MAX_QUESTION_CHARS) : "";
    if (!question) return NextResponse.json({ error: "empty" }, { status: 400 });

    // Read through the USER'S session client, so RLS decides whether this
    // row is theirs rather than a filter this route remembered to write —
    // the same reason api/meetings/[id]/analyse reads this way.
    const { data: meeting, error: readError } = await supabase
      .from("meetings")
      .select("id, transcript, summary, proposed_actions")
      .eq("id", meetingId)
      .maybeSingle();
    if (readError) {
      logApiError("/api/meetings/[id]/ask", readError, { stage: "read" });
      return NextResponse.json({ error: "failed" }, { status: 500 });
    }
    if (!meeting) return NextResponse.json({ error: "not_found" }, { status: 404 });

    const transcript = String(meeting.transcript ?? "");
    if (!isAnalysable(transcript)) {
      // NOT AN ERROR AND NOT A CHARGE — same guard api/meetings/[id]/
      // analyse applies to the same transcript, for the same reason:
      // there is nothing here to answer a question from.
      return NextResponse.json({ error: "too_short" }, { status: 422 });
    }
    const summary = typeof meeting.summary === "string" ? meeting.summary : null;
    const actions: ProposedAction[] = Array.isArray(meeting.proposed_actions)
      ? (meeting.proposed_actions as ProposedAction[])
      : [];

    const limited = await checkRateLimit({
      scope: "meeting_ask",
      identifier: user.id,
      maxAttempts: 60,
      windowMinutes: 60,
    });
    if (!limited.allowed) return NextResponse.json({ error: "rate_limited" }, { status: 429 });

    // THE CIRCUIT BREAKER, same as api/meetings/[id]/analyse — the
    // fingerprint is the meeting plus the question, so re-asking the
    // exact same question is the repeat this is for.
    const breaker = await checkAiCallAllowed(user.id, "meeting_ask", fingerprintRequest(meetingId, question));
    if (!breaker.allowed) return NextResponse.json({ error: "rate_limited" }, { status: 429 });

    const isAdmin = isAdminEmail(user.email);
    const isBeta = await hasActiveBetaBypass(user);
    const bypass = isAdmin || isBeta;
    if (bypass) {
      const ceiling = await checkBypassCeiling(user.id, isAdmin, isBeta);
      if (!ceiling.allowed) return NextResponse.json({ error: "capacity" }, { status: 429 });
    }

    const plan = await resolveEffectivePlan(user);
    const pricingConfig = resolvePricingConfig();
    const estimate = estimateForAction(
      "meetingAsk",
      {
        model: "claude-sonnet-4-6",
        inputChars: transcript.length + (summary?.length ?? 0) + question.length,
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
      const reservation = await reserveCredits(user.id, estimate.reserveCredits, "meeting_analyse", {
        meetingId,
        kind: "question",
      });
      if (!reservation.ok) return NextResponse.json({ error: "reserve_failed" }, { status: 402 });
      reservationId = reservation.reservationId;
    }

    const costs = new CostAccumulator();
    const locale = await getLocale();
    const outcome = await askAboutMeeting(question, transcript, summary, actions, {
      costs,
      userId: user.id,
      locale,
    });

    if (!outcome.ok) {
      await releaseReservation(user.id, reservationId);
      // "empty"/"too_long" cannot actually happen here — the question is
      // already validated above — but the pure builder's own contract
      // still covers them, so this maps whatever it returns rather than
      // assuming only "ai_unavailable" can reach this line.
      const status = outcome.code === "ai_unavailable" ? 503 : 400;
      return NextResponse.json({ error: outcome.code }, { status });
    }

    const settlement = await settleReservation({
      userId: user.id,
      reservationId,
      feature: "meeting_analyse",
      costs,
      plan,
      bypassCharge: bypass,
      metadata: { meetingId, kind: "question" },
    });

    const admin = createAdminClient();
    const { data: row, error: insertErr } = await admin
      .from("meeting_questions")
      .insert({
        meeting_id: meetingId,
        user_id: user.id,
        question,
        answer: outcome.answer,
        credits_charged: settlement.creditsCharged,
      })
      .select("id, question, answer, created_at")
      .single();
    if (insertErr || !row) {
      logApiError("/api/meetings/[id]/ask", insertErr, { stage: "record" });
      // The answer still happened and was paid for — it is returned even
      // when the history row failed to save, rather than discarding a
      // paid-for answer because its OWN row could not be written.
      return NextResponse.json({
        ok: true,
        question,
        answer: outcome.answer,
        usage: buildUsageReceipt({ creditsCharged: settlement.creditsCharged, bypass, wouldHaveCharged: null }),
      });
    }

    return NextResponse.json({
      ok: true,
      id: row.id,
      question: row.question,
      answer: row.answer,
      createdAt: row.created_at,
      usage: buildUsageReceipt({ creditsCharged: settlement.creditsCharged, bypass, wouldHaveCharged: null }),
    });
  } catch (err) {
    logApiError("/api/meetings/[id]/ask", err);
    return NextResponse.json({ error: "failed" }, { status: 500 });
  }
}
