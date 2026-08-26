import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isAdminEmail } from "@/lib/auth/admin-emails";
import { checkBypassCeiling } from "@/lib/billing/bypass-ceiling";
import { hasActiveBetaBypass } from "@/lib/beta";
import {
  hasEnoughCredits,
  resolveEffectivePlan,
  getPurchasedPackCreditPriceEur,
} from "@/lib/billing/credits";
import { effectiveCreditPriceEurForAccount } from "@/lib/billing/credit-formula";
import { estimateForAction } from "@/lib/billing/estimate";
import { resolvePricingConfig } from "@/lib/billing/pricing-config";
import { reserveCredits } from "@/lib/billing/reservations";
import { checkAiCallAllowed, fingerprintRequest, recordAiCallForDailySpend } from "@/lib/ai-circuit-breaker";
import { logApiError } from "@/lib/log-error";
import { RESEARCH_MODEL } from "@/lib/files/file-models";
import { RESEARCH_MAX_SEARCHES, type ResearchStatus } from "@/lib/research/research-limits";
import { runResearchChunk, claimChunk, failChunk } from "@/lib/research/run-research";
import type { ResearchQuestion } from "@/lib/research/research";

export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

// The declared ceiling, capped by MAX_FUNCTION_DURATION.
//
// This used to be a bare `800`, which is a Vercel Pro (Fluid Compute)
// figure. On Hobby the plan ceiling is 60 and a route asking for 800 is a
// BUILD FAILURE — the product stops shipping, rather than shipping slower.
// routeMaxDuration takes the minimum, so setting MAX_FUNCTION_DURATION=60
// makes this declare 60 and the build succeed.
//
// The declared number is only half the story: it says how long the
// platform ALLOWS, not how long the work takes. What stops a report being
// killed mid-question is lib/research/run-research.ts, which does as much
// as its own budget allows and hands the rest to a fresh invocation. See
// that file. This route now only starts the first chunk.
export const maxDuration = 800; // @function-limit 800

/**
 * Start a planned research job.
 *
 * THE CLAIM. `processing_started_at` is set by a conditional update that
 * only matches a row where it is still null. Two requests for the same
 * report — a double-click, a retried fetch, a browser restoring a tab —
 * therefore produce exactly one run. Without it the second request would
 * reserve a second hold and spend a second report's worth of credits on
 * work the user asked for once.
 *
 * THE RESERVATION is taken here and PERSISTED ON THE ROW, because on a
 * constrained platform the invocation that settles is not this one — it is
 * whichever later chunk finishes the report. A hold that lived only in
 * this function's memory would be stranded the moment the work was handed
 * on.
 *
 * THE WORK is not done here. runResearchChunk does as much as this
 * invocation's budget allows and either finishes or hands off; the client
 * polls GET /api/research/[id] either way and cannot tell the difference
 * except that a small budget takes more wall-clock.
 */
export async function POST(_request: Request, { params }: { params: { id: string } }) {
  const startedAt = Date.now();
  let userId = "";
  let reservationId = "";

  try {
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ ok: false, error: "Not authenticated." }, { status: 401 });
    }
    userId = user.id;

    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ ok: false, error: "The AI service is not configured." }, { status: 503 });
    }

    const { data: report, error: loadError } = await supabase
      .from("research_reports")
      .select("id, topic, language, status, questions, processing_started_at")
      .eq("id", params.id)
      .eq("user_id", user.id)
      .maybeSingle();

    if (loadError) {
      logApiError("/api/research/[id]/run", loadError, { stage: "load" });
      return NextResponse.json({ ok: false, error: "Could not load that report." }, { status: 500 });
    }
    if (!report) {
      return NextResponse.json({ ok: false, error: "Report not found." }, { status: 404 });
    }
    if (report.status !== "pending") {
      return NextResponse.json(
        { ok: false, error: "That report has already been started." },
        { status: 409 }
      );
    }

    const questions = (Array.isArray(report.questions) ? report.questions : []) as ResearchQuestion[];
    if (questions.length === 0) {
      return NextResponse.json({ ok: false, error: "That report has no research plan." }, { status: 409 });
    }

    const breaker = await checkAiCallAllowed(
      user.id,
      "research_run",
      fingerprintRequest(String(report.id), String(report.topic))
    );
    if (!breaker.allowed) {
      return NextResponse.json({ ok: false, error: breaker.reason }, { status: 429 });
    }

    const isAdmin = isAdminEmail(user.email);
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

    const estimate = estimateForAction(
      "deepResearch",
      {
        model: RESEARCH_MODEL,
        inputChars: String(report.topic).length,
        expectedWebSearches: RESEARCH_MAX_SEARCHES,
        planSlug: plan?.slug ?? null,
      },
      pricingConfig,
      accountCreditPriceEur
    );

    if (!bypassCredits && plan) {
      const affordable = await hasEnoughCredits(user.id, estimate.reserveCredits, plan);
      if (!affordable.ok) {
        return NextResponse.json(
          { ok: false, insufficientCredits: true, error: "Not enough credits to run this report." },
          { status: 402 }
        );
      }
    }

    // THE CLAIM — exactly-once, enforced by the database rather than by
    // checking first and writing second.
    const { data: claimed, error: claimError } = await supabase
      .from("research_reports")
      .update({
        status: "researching" satisfies ResearchStatus,
        processing_started_at: new Date().toISOString(),
        questions_total: questions.length,
        questions_done: 0,
        current_question: questions[0]?.question ?? null,
        partial_findings: [],
        usage_entries: [],
        chunk_count: 0,
        chunk_running: false,
      })
      .eq("id", report.id)
      .eq("user_id", user.id)
      .eq("status", "pending")
      .is("processing_started_at", null)
      .select("id")
      .maybeSingle();

    if (claimError) {
      logApiError("/api/research/[id]/run", claimError, { stage: "claim" });
      return NextResponse.json({ ok: false, error: "Could not start the report." }, { status: 500 });
    }
    if (!claimed) {
      return NextResponse.json({ ok: false, error: "That report has already been started." }, { status: 409 });
    }

    if (!bypassCredits && plan) {
      const reservation = await reserveCredits(user.id, estimate.reserveCredits, "deep_research", {
        reportId: String(report.id),
        questions: questions.length,
        estimatedCredits: estimate.estimatedCredits,
      });
      if (!reservation.ok) {
        await supabase
          .from("research_reports")
          .update({
            status: "failed" satisfies ResearchStatus,
            error: "Not enough credits.",
            processing_started_at: null,
          })
          .eq("id", report.id)
          .eq("user_id", user.id);
        return NextResponse.json(
          { ok: false, insufficientCredits: true, error: "Not enough credits to run this report." },
          { status: 402 }
        );
      }
      reservationId = reservation.reservationId;
    }

    // The hold has to outlive this invocation — see the doc comment.
    const admin = createAdminClient();
    await admin
      .from("research_reports")
      .update({ reservation_id: reservationId || null })
      .eq("id", report.id);

    void recordAiCallForDailySpend(estimate.estimatedCredits);

    if (!(await claimChunk(String(report.id)))) {
      // Something else is already working on it. Not an error — the client
      // polls and will see it progress.
      return NextResponse.json({ ok: true, started: true, alreadyRunning: true });
    }

    const outcome = await runResearchChunk({
      reportId: String(report.id),
      apiKey,
      startedAt,
    });

    return NextResponse.json({ ok: true, started: true, outcome });
  } catch (err) {
    logApiError("/api/research/[id]/run", err, {});
    if (userId) {
      await failChunk(params.id, userId, reservationId || null).catch(() => undefined);
    }
    return NextResponse.json({ ok: false, error: "Something went wrong." }, { status: 500 });
  }
}
