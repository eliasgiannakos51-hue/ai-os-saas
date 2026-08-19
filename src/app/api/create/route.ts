import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import {
  CLASSIFIER_MODULES,
  getClassifierModule,
  moduleHref,
} from "@/lib/classifier-modules";
import type { FieldConfig } from "@/lib/modules";
import { isAgentRole, agentRoleSystemPromptAddition, type AgentRole } from "@/lib/agent-roles";
import { getUserFullContext, buildUserContextPromptAdditionEnglish } from "@/lib/user-context";
import { buildOutputSummary, buildMissionContextSystemPromptAddition } from "@/lib/mission-context";
import { logApiError } from "@/lib/log-error";
import { MAX_MESSAGE_LENGTH, MODEL } from "@/lib/create-studio/route-entry";
import { startJob } from "@/lib/jobs/start-job";
import { isAdminEmail } from "@/lib/admin";
import { checkBypassCeiling } from "@/lib/billing/bypass-ceiling";
import { hasActiveBetaBypass } from "@/lib/beta";
import { checkAiCallAllowed, fingerprintRequest, recordAiCallForDailySpend } from "@/lib/ai-circuit-breaker";
import {
  CREDIT_COSTS,
  hasEnoughCredits,
  getPurchasedPackCreditPriceEur,
  insufficientCreditsMessage,
  resolveEffectivePlan,
} from "@/lib/billing/credits";
import { CostAccumulator } from "@/lib/billing/cost-accumulator";
import { estimateForAction } from "@/lib/billing/estimate";
import { resolvePricingConfig } from "@/lib/billing/pricing-config";
import { effectiveCreditPriceEurForAccount } from "@/lib/billing/credit-formula";
import { diagLog } from "@/lib/diag";
import { MAX_ATTACHMENT_IMAGES } from "@/lib/create-attachment-image";
import { downloadAttachmentImages } from "@/lib/attachment-image-server";
import { AI_QUALITY_CHECKLIST_EN } from "@/lib/ai-quality-checklist";
import { AI_CONDUCT_EN } from "@/lib/ai-conduct";

export const dynamic = "force-dynamic";

// Explicit execution-time budget — without this the platform's own
// default function timeout applies (as low as 10s on some tiers), which
// is the real root cause of the "Network error" symptom users saw on a
// slower-than-usual AI call: the platform kills the connection mid-
// request, and the browser reports that as a generic network failure,
// not a clean HTTP error — misleading, since nothing was actually wrong
// with the user's connection. This route can run up to 2 sequential
// Claude calls in one request (the clarification pre-check, ~500 tokens,
// then the real classification, 1024 tokens) plus AI Life Context/
// mission-context lookups, so 120s is comfortable headroom over the
// realistic worst case, not a guess.
export const maxDuration = 120; // @function-limit 120

export async function POST(request: Request) {
  try {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      return NextResponse.json(
        { ok: false, error: "ANTHROPIC_API_KEY is not configured on the server." },
        { status: 500 }
      );
    }

    let message: string;
    let agentRole: AgentRole;
    let priorStepsContext: string;
    let skipClarification: boolean;
    let imagePaths: string[];
    try {
      const body = await request.json();
      message = typeof body?.message === "string" ? body.message.trim() : "";
      agentRole = isAgentRole(body?.agentRole) ? body.agentRole : "general";
      priorStepsContext = typeof body?.context === "string" ? body.context.trim() : "";
      skipClarification = body?.skipClarification === true;
      imagePaths = Array.isArray(body?.imagePaths)
        ? body.imagePaths.filter((p: unknown): p is string => typeof p === "string").slice(0, MAX_ATTACHMENT_IMAGES)
        : [];
    } catch {
      return NextResponse.json(
        { ok: false, error: "Invalid request body." },
        { status: 400 }
      );
    }

    if (!message) {
      return NextResponse.json(
        { ok: false, error: "Message is required." },
        { status: 400 }
      );
    }

    if (message.length > MAX_MESSAGE_LENGTH) {
      return NextResponse.json(
        {
          ok: false,
          error: `Message is too long (${message.length}/${MAX_MESSAGE_LENGTH} characters) — please shorten it and try again.`,
        },
        { status: 400 }
      );
    }

    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json(
        { ok: false, error: "Not authenticated." },
        { status: 401 }
      );
    }

    // Circuit breaker: independent of credits, catches abuse/bugs (a
    // runaway client loop, a scripted spammer) by volume rather than
    // balance — see lib/ai-circuit-breaker.ts. Checked before the credit
    // check since it's cheaper and should reject first.
    const breakerCheck = await checkAiCallAllowed(user.id, "create", fingerprintRequest(message));
    if (!breakerCheck.allowed) {
      return NextResponse.json({ ok: true, matched: false, message: breakerCheck.reason });
    }

    // The clarifying-questions pre-check moved into the worker with the
    // rest of the work — see lib/jobs/handlers/create.ts. It is a model
    // call, and model calls no longer happen in this request.
    //
    // Historical note kept because the REASON still applies: (see lib/clarification.ts) — same
    // shape as Website Builder/Automations: a small, cheap, forced-tool-
    // use call before the real (module-routing) classification, only on
    // the first submission (priorStepsContext-driven Mission Control
    // step calls and the resubmission after answering both set
    // skipClarification: true). Most Create Anything entries are already
    // clear enough that this never fires — it's specifically for the
    // genuinely ambiguous ones.
    // One accumulator for the whole request: the clarifying-questions
    // pre-check and the classification call both feed it, so whichever
    // branch the request exits through settles the real total.
    // The billing picture, computed HERE because the user has to be told
    // now whether they can afford this — a 402 they can act on, rather
    // than a job id for work that dies in a worker they are not watching.
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
    // Resolved UNCONDITIONALLY, never `bypassCredits ? null : ...`. A
    // conditionally-null plan prices the estimate off the list credit rate
    // instead of the account's own, which is the shape billing-coverage
    // bans across every settling route.
    const plan = await resolveEffectivePlan(user);
    const pricingConfig = resolvePricingConfig();
    const accountCreditPriceEur = bypassCredits
      ? pricingConfig.creditPriceEur
      : effectiveCreditPriceEurForAccount(
          plan,
          await getPurchasedPackCreditPriceEur(user.id),
          pricingConfig
        );
    // Scales with the real request: a one-line note and a 4,000-character
    // brief with three attached images are no longer the same 1 credit.
    const estimate = estimateForAction(
      "createAnything",
      // imagePaths, not the downloaded images: the download happens in the
      // worker, and the requested count is the upper bound — a hold that
      // leans high is released at settlement, one that leans low is not.
      { model: MODEL, inputChars: message.length, imageCount: imagePaths.length, planSlug: plan?.slug ?? null },
      pricingConfig,
      accountCreditPriceEur
    );

    // create_requests keeps a per-request log for history/debugging — no
    // longer used for gating (credits are the actual limit).
    const { error: usageLogError } = await supabase.from("create_requests").insert({ user_id: user.id });
    if (usageLogError) logApiError("/api/create", usageLogError, { stage: "usage_log" });

    // FROM HERE THE ROUTE DOES NOT CLASSIFY.
    //
    // It used to await a vision-capable classification under a 120-second
    // ceiling, and vision is the slow case: the images have to come out of
    // Storage and travel with the message. A kill runs no catch block, so
    // the entry was never written and the hold never released.
    const started = await startJob({
      userId: user.id,
      kind: "create",
      reserve: bypassCredits || !plan ? 0 : estimate.reserveCredits,
      reserveMetadata: {
        messageChars: message.length,
        estimatedCredits: estimate.estimatedCredits,
      },
      // imagePaths, not the images: the worker downloads them itself, so
      // megabytes of base64 never go into a jsonb column.
      input: { message, agentRole, imagePaths, priorStepsContext: priorStepsContext ?? null, skipClarification },
    });

    if (!started.ok) {
      if (started.reason === "insufficient") {
        return NextResponse.json(
          {
            ok: false,
            insufficientCredits: true,
            message: insufficientCreditsMessage(started.available, started.needed),
          },
          { status: 402 }
        );
      }
      return NextResponse.json({ ok: false, error: started.message }, { status: 500 });
    }

    void recordAiCallForDailySpend(estimate.estimatedCredits);

    return NextResponse.json({ ok: true, jobId: started.jobId, queued: true }, { status: 202 });
  } catch (err) {
    logApiError("/api/create", err);
    return NextResponse.json(
      { ok: false, error: "Something went wrong. Please try again." },
      { status: 500 }
    );
  }
}
