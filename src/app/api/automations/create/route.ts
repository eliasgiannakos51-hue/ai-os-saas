import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { computeNextRunAt, isAutomationFrequency } from "@/lib/automation-schedule";
import { isAdminEmail } from "@/lib/admin";
import { hasActiveBetaBypass } from "@/lib/beta";
import {
  hasEnoughCredits,
  insufficientCreditsMessage,
  resolveEffectivePlan,
  getPurchasedPackCreditPriceEur,
} from "@/lib/billing/credits";
import { CostAccumulator } from "@/lib/billing/cost-accumulator";
import { estimateForAction } from "@/lib/billing/estimate";
import { resolvePricingConfig } from "@/lib/billing/pricing-config";
import { effectiveCreditPriceEurForAccount } from "@/lib/billing/credit-formula";
import { reserveCredits, settleReservation, releaseReservation } from "@/lib/billing/reservations";
import { checkNeedsClarification, CLARIFICATION_MODEL } from "@/lib/clarification";
import { checkAiCallAllowed, fingerprintRequest, recordAiCallForDailySpend } from "@/lib/ai-circuit-breaker";
import { logSecurityCheck } from "@/lib/security-check-log";
import { logApiError } from "@/lib/log-error";

export const dynamic = "force-dynamic";

// Same reasoning as api/create/route.ts — this route's only AI call is
// the clarification pre-check (small, ~500 tokens), but a real platform
// timeout mid-request produces the same misleading "Network error" the
// user saw elsewhere. 60s is ample for a single small classifier call.
export const maxDuration = 60;

const MAX_DESCRIPTION_LENGTH = 20000;
// Safety cap, per the brief: prevents unbounded recurring-cost
// accumulation — each active automation calls Claude on its own
// schedule, indefinitely, with no further approval per run.
const MAX_ACTIVE_AUTOMATIONS = 10;

// "Make this real" (see components/automation/automation-realize-form.tsx)
// — turns an Automation module idea into an actually-scheduled, repeating
// automation. No AI call and no credit charge for the automation ITSELF
// here; this route only ever creates a 'pending-for-its-first-run' row —
// api/cron/scheduled-runs is solely responsible for actually executing
// it once next_run_at arrives. The ONE exception is the clarifying-
// questions pre-check below (lib/clarification.ts), the first AI call
// this route makes: a small, cheap check for whether the description is
// genuinely too ambiguous to act on later, charged separately and
// minimally (CREDIT_COSTS.clarificationCheck) from the automation's own
// (currently free) creation.
export async function POST(request: Request) {
  try {
    let description: string;
    let frequency: string;
    let dayOfWeek: number | null;
    let dayOfMonth: number | null;
    let skipClarification: boolean;
    try {
      const body = await request.json();
      description = typeof body?.description === "string" ? body.description.trim() : "";
      frequency = typeof body?.frequency === "string" ? body.frequency : "";
      dayOfWeek = typeof body?.dayOfWeek === "number" ? body.dayOfWeek : null;
      dayOfMonth = typeof body?.dayOfMonth === "number" ? body.dayOfMonth : null;
      skipClarification = body?.skipClarification === true;
    } catch {
      return NextResponse.json({ ok: false, error: "Invalid request body." }, { status: 400 });
    }

    if (!description) {
      return NextResponse.json({ ok: false, error: "Description is required." }, { status: 400 });
    }
    if (description.length > MAX_DESCRIPTION_LENGTH) {
      return NextResponse.json(
        { ok: false, error: `Description is too long (${description.length}/${MAX_DESCRIPTION_LENGTH} characters).` },
        { status: 400 }
      );
    }
    if (!isAutomationFrequency(frequency)) {
      return NextResponse.json({ ok: false, error: "Invalid frequency." }, { status: 400 });
    }

    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ ok: false, error: "Not authenticated." }, { status: 401 });
    }

    // AI Output Protection Layer — tracks whether the harmful-automation
    // safety check (lib/clarification.ts's SAFETY CHECK section) actually
    // ran and passed this request, for the security_check_log entry
    // written once the automation is actually created below. Starts
    // false; only the try block on a successful, non-clarification-
    // needed check result flips it true — every other path (skipped via
    // skipClarification, missing API key, breaker-blocked, unaffordable,
    // or a call failure) leaves it false, and that's logged honestly
    // rather than claimed.
    let safetyCheckRan = false;

    if (!skipClarification) {
      const apiKey = process.env.ANTHROPIC_API_KEY;
      // Best-effort only: unlike Website Builder/Mission Control, this
      // route has never required ANTHROPIC_API_KEY to function (creating
      // an automation itself makes no AI call) — a missing key here
      // should never block automation creation, just skip the check.
      if (apiKey) {
        const breakerCheck = await checkAiCallAllowed(user.id, "automation_clarify", fingerprintRequest(description));
        if (breakerCheck.allowed) {
          const isAdmin = isAdminEmail(user.email);
          const bypassCredits = isAdmin || (await hasActiveBetaBypass(user));
          const clarificationPlan = await resolveEffectivePlan(user);
          // Reserved and settled on MEASURED usage, like every other AI
          // call — the old flat CREDIT_COSTS.clarificationCheck (1 credit)
          // was worth only €0.008 on Ultimate's per-credit rate, which is
          // ~2x the check's real cost instead of the guaranteed 4x.
          const pricingConfig = resolvePricingConfig();
          const accountCreditPriceEur = bypassCredits
            ? pricingConfig.creditPriceEur
            : effectiveCreditPriceEurForAccount(
                clarificationPlan,
                await getPurchasedPackCreditPriceEur(user.id),
                pricingConfig
              );
          const estimate = estimateForAction(
            "automationCreate",
            {
              model: CLARIFICATION_MODEL,
              inputChars: description.length,
              planSlug: clarificationPlan?.slug ?? null,
            },
            pricingConfig,
            accountCreditPriceEur
          );
          const affordabilityCheck = clarificationPlan
            ? await hasEnoughCredits(user.id, estimate.reserveCredits, clarificationPlan)
            : { ok: true, remaining: 0 };
          if (!affordabilityCheck.ok) {
            return NextResponse.json({
              ok: true,
              created: false,
              rateLimited: true,
              message: insufficientCreditsMessage(affordabilityCheck.remaining, estimate.reserveCredits),
            });
          }
          const costs = new CostAccumulator();
          let reservationId = "";
          if (!bypassCredits) {
            const reservation = await reserveCredits(
              user.id,
              estimate.reserveCredits,
              "clarification_check",
              { source: "automation_create", estimatedCredits: estimate.estimatedCredits }
            );
            // A failed reserve degrades to "check skipped", same as a
            // failed call below — creating the automation must not break.
            if (reservation.ok) reservationId = reservation.reservationId;
          }
          try {
            void recordAiCallForDailySpend(estimate.estimatedCredits);
            const clarification = await checkNeedsClarification(apiKey, "automation", description, costs);
            await settleReservation({
              userId: user.id,
              reservationId,
              feature: "clarification_check",
              costs,
              plan: clarificationPlan,
              bypassCharge: bypassCredits,
              metadata: {
                source: "automation_create",
                estimatedCredits: estimate.estimatedCredits,
                reservedCredits: bypassCredits ? 0 : estimate.reserveCredits,
              },
            });
            if (clarification.needsClarification) {
              return NextResponse.json({
                ok: true,
                created: false,
                needsClarification: true,
                questions: clarification.questions,
                questionSuggestions: clarification.suggestions,
              });
            }
            safetyCheckRan = true;
          } catch (err) {
            // Best-effort: a clarification-check hiccup shouldn't block
            // a real automation from being created — fall through,
            // uncharged, with the hold given back.
            await releaseReservation(user.id, reservationId);
            logApiError("/api/automations/create", err, { stage: "clarification_check" });
          }
        }
      }
    }

    const { count, error: countError } = await supabase
      .from("user_automations")
      .select("id", { count: "exact", head: true })
      .eq("is_active", true);

    if (countError) {
      logApiError("/api/automations/create", countError, { stage: "count_active" });
      return NextResponse.json({ ok: false, error: "Could not check your automation limit." }, { status: 500 });
    }
    if ((count ?? 0) >= MAX_ACTIVE_AUTOMATIONS) {
      return NextResponse.json(
        {
          ok: false,
          limitReached: true,
          error: `You've reached the ${MAX_ACTIVE_AUTOMATIONS} active automation limit — turn one off or delete it before adding another.`,
        },
        { status: 403 }
      );
    }

    // Idempotency guard — a fast double-submit of "Make this real" would
    // otherwise create two identical, separately-scheduled automations
    // both firing forever. An exact description+frequency match for this
    // user created in the last 2 minutes is treated as the same
    // submission and returned as-is instead of creating a duplicate.
    const twoMinutesAgo = new Date(Date.now() - 2 * 60 * 1000).toISOString();
    const { data: recentDuplicate } = await supabase
      .from("user_automations")
      .select("*")
      .eq("user_id", user.id)
      .eq("description", description)
      .eq("frequency", frequency)
      .gte("created_at", twoMinutesAgo)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (recentDuplicate) {
      return NextResponse.json({ ok: true, automation: recentDuplicate, duplicateSuppressed: true });
    }

    const nextRunAt = computeNextRunAt(frequency, new Date(), dayOfWeek, dayOfMonth);

    const { data: automation, error: insertError } = await supabase
      .from("user_automations")
      .insert({
        user_id: user.id,
        description,
        frequency,
        day_of_week: frequency === "weekly" ? dayOfWeek : null,
        day_of_month: frequency === "monthly" ? dayOfMonth : null,
        is_active: true,
        next_run_at: nextRunAt.toISOString(),
      })
      .select()
      .single();

    if (insertError) {
      logApiError("/api/automations/create", insertError, { stage: "insert" });
      return NextResponse.json({ ok: false, error: "Could not save the automation. Please try again." }, { status: 500 });
    }

    void logSecurityCheck(supabase, {
      userId: user.id,
      resourceType: "automation",
      resourceId: automation.id,
      result: {
        passed: true,
        checks: safetyCheckRan
          ? ["harmful/unsupervised-automation safety check"]
          : ["harmful/unsupervised-automation safety check (skipped — answered on an earlier submission)"],
        issues: [],
      },
    });

    return NextResponse.json({ ok: true, automation });
  } catch (err) {
    logApiError("/api/automations/create", err);
    return NextResponse.json({ ok: false, error: "Something went wrong." }, { status: 500 });
  }
}
