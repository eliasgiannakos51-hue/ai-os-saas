import { NextResponse } from "next/server";
import type { AiToolSpec } from "@/lib/ai/providers/types";
import { anyProviderConfigured } from "@/lib/ai/providers/registry";
import { runCompletion } from "@/lib/ai/providers/complete";
import { createClient } from "@/lib/supabase/server";
import { logApiError } from "@/lib/log-error";
import { checkRateLimit } from "@/lib/rate-limit";
import { isAdminEmail } from "@/lib/auth/admin-emails";
import { hasActiveBetaBypass } from "@/lib/beta";
import { checkBypassCeiling } from "@/lib/billing/bypass-ceiling";
import { checkAiCallAllowed, fingerprintRequest, recordAiCallForDailySpend } from "@/lib/ai-circuit-breaker";
import {
  hasEnoughCredits,
  getPurchasedPackCreditPriceEur,
  insufficientCreditsMessage,
  resolveEffectivePlan,
} from "@/lib/billing/credits";
import { CostAccumulator } from "@/lib/billing/cost-accumulator";
import { estimateForAction } from "@/lib/billing/estimate";
import { resolvePricingConfig } from "@/lib/billing/pricing-config";
import { effectiveCreditPriceEurForAccount } from "@/lib/billing/credit-formula";
import { reserveCredits, settleReservation, releaseReservation } from "@/lib/billing/reservations";
import { buildUsageReceipt } from "@/lib/billing/usage-receipt";
import {
  TRANSITION_DESTINATIONS,
  TRANSITION_IDS,
  destinationById,
  detectTransition,
  worthPaidDetection,
} from "@/lib/transitions/destinations";

export const dynamic = "force-dynamic";

// One small forced-tool-use call, nothing streamed. Matches the other
// single-classifier routes; it is here so a platform default timeout
// cannot kill the request midway and surface as a misleading "Network
// error" in the browser.
export const maxDuration = 60; // @function-limit 60

const TRANSITION_MODEL = "claude-sonnet-4-6";
const MAX_ANSWER_LENGTH = 20000;

/**
 * WRITTEN IN ENGLISH, ABOUT ANSWERS IN TEN LANGUAGES, AND THAT IS THE
 * DELIBERATE PART.
 *
 * The instruction is English because the model reads instructions best in
 * English and because a prompt translated ten times is ten prompts that
 * drift. What must be language-independent is the JUDGEMENT, so the
 * prompt says so explicitly and gives an example in a script with no word
 * boundaries — the exact case the free reader had to be fixed for three
 * times (Greek final sigma, Japanese and Chinese word breaks, the Arabic
 * article). A classifier that quietly only worked on English answers
 * would look identical in every log this app keeps.
 *
 * IT MAY ONLY ANSWER FROM THE CLOSED LIST OR SAY "none". The enum in the
 * tool schema is the first line of that; destinationById() on the way out
 * is the second, because an enum is a request and not a guarantee.
 */
function buildSystemPrompt(): string {
  const list = TRANSITION_DESTINATIONS.map((d) => `- "${d.id}" — ${d.href}`).join("\n");
  return `You read ONE answer that an assistant has just given a user, and decide whether that answer tells the user to go and do something SOMEWHERE ELSE in this product.

The places, and nothing outside this list:
${list}

Answer "none" unless the text genuinely points the reader at one of them. These are NOT pointing:
- An answer that simply CONTAINS the topic. "Here is the code you asked for" is the answer itself, not an instruction to go and write code.
- An answer describing what something is. "Research shows revenue grew" is a fact, not a suggestion to start a research job.
- An answer that says the product CANNOT do something.

These ARE pointing: "you could build an agent for that", "try the website builder", "that belongs in the code tool", "for that, use…".

THE LANGUAGE OF THE ANSWER DOES NOT MATTER. This app ships in English, Greek, Spanish, French, German, Italian, Portuguese, Chinese, Japanese and Arabic, and a suggestion is a suggestion in every one of them. "コードはこちらで開けます" points at "coding" exactly as "you can open the Code tool" does. Judge the meaning, never the script.

When in doubt, answer "none". A missing button costs the user one navigation they were going to make anyway; a wrong one costs their trust in the next.`;
}

const DETECT_TOOL: AiToolSpec = {
  name: "name_destination",
  description:
    "Name the one place in the product this answer points the reader at, or 'none' if it does not point anywhere.",
  inputSchema: {
    type: "object",
    properties: {
      destination: {
        type: "string",
        enum: [...TRANSITION_IDS, "none"],
        description: "The destination id, or 'none'.",
      },
      confident: {
        type: "boolean",
        description:
          "True only if the answer plainly tells the reader to go there. False if it is a guess — a false button costs more than a missing one.",
      },
    },
    required: ["destination", "confident"],
  },
};

/**
 * THE PAID HALF, AND IT ONLY RUNS WHEN THE FREE HALF FAILED.
 *
 * lib/transitions/destinations.ts places most suggestions with a fold and
 * a regex: no model, no latency, no credits. This route exists for the
 * ones it cannot — a paraphrase, an idiom, a language whose cue list is
 * thinner than English's. THE PRECONDITION IS ENFORCED HERE AND NOT
 * TRUSTED FROM THE CALLER: if the free reader can place this answer, the
 * route returns that placement and charges nothing. A client that forgot
 * to check, or one written by hand, cannot make this cost money that the
 * free path would have saved.
 *
 * AND IT IS COUNTED. Every reply carries `source`, and the caller records
 * it to api/transitions/record — so "how often does the paid one fire"
 * is `count(source='model') / count(*)` over real rows rather than an
 * estimate. That question was asked when this half was approved.
 *
 * THE REFUSALS CARRY A CODE, NOT A SENTENCE, for the reason nav/track
 * writes out at length: nothing renders these bodies — the only caller is
 * the effect in components/transitions/transition-button.tsx, which reads
 * `destination` and `source` and ignores everything else — so an English
 * sentence here would be an untranslated string on a server route with no
 * reader. The first draft had three of them and i18n-coverage.test.mjs
 * counted every one.
 */
export async function POST(request: Request) {
  try {
    // NOT `source: "skipped"`, WHICH IS THE ONE PLACE THIS ROUTE MUST
    // NOT FAIL QUIET. A deployment with no provider would otherwise
    // answer 200 for ever and look exactly like a deployment where the
    // free reader simply placed everything — a broken install hidden
    // behind a green response. The operator gets a 500, a code and a log
    // line; the user still gets no button and no error, because the
    // caller ignores the body either way.
    //
    // Asked of the registry rather than of one variable's name since
    // this call moved onto the router (lib/ai/providers/registry.ts):
    // a deployment holding another provider's key is NOT broken.
    if (!anyProviderConfigured(process.env)) {
      logApiError("/api/transitions/detect", new Error("no AI provider configured"), {
        stage: "config",
      });
      return NextResponse.json({ ok: false, reason: "no_api_key" }, { status: 500 });
    }

    let answer: string;
    try {
      const body = await request.json();
      answer = typeof body?.answer === "string" ? body.answer.trim() : "";
    } catch {
      return NextResponse.json({ ok: false, reason: "invalid_body" }, { status: 400 });
    }
    if (!worthPaidDetection(answer) || answer.length > MAX_ANSWER_LENGTH) {
      return NextResponse.json({ ok: true, destination: null, source: "skipped" });
    }

    // THE PRECONDITION, ENFORCED. Free first, always — and if the free
    // reader places it, nothing below this line runs.
    const free = detectTransition(answer);
    if (free) {
      return NextResponse.json({ ok: true, destination: free.id, source: "offline" });
    }

    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ ok: false, reason: "unauthenticated" }, { status: 401 });
    }

    // A VOLUME CEILING ON TOP OF THE BALANCE ONE. This is cheap per call,
    // which is exactly why it needs a count as well as a cost: a scripted
    // loop could run it thousands of times before the balance noticed.
    // 120/hour is far above one per assistant answer.
    const { allowed } = await checkRateLimit({
      scope: "transition_detect",
      identifier: user.id,
      maxAttempts: 120,
      windowMinutes: 60,
    });
    if (!allowed) {
      return NextResponse.json({ ok: true, destination: null, source: "skipped" });
    }

    const breakerCheck = await checkAiCallAllowed(user.id, "transition_detect", fingerprintRequest(answer));
    if (!breakerCheck.allowed) {
      return NextResponse.json({ ok: true, destination: null, source: "skipped" });
    }

    const isAdmin = isAdminEmail(user.email);
    const bypassCredits = isAdmin || (await hasActiveBetaBypass(user));
    if (bypassCredits) {
      const ceiling = await checkBypassCeiling(user.id, isAdmin, bypassCredits && !isAdmin);
      if (!ceiling.allowed) {
        return NextResponse.json({ ok: true, destination: null, source: "skipped" });
      }
    }

    const pricingConfig = resolvePricingConfig();
    const plan = await resolveEffectivePlan(user);
    const accountCreditPriceEur = bypassCredits
      ? pricingConfig.creditPriceEur
      : effectiveCreditPriceEurForAccount(
          plan,
          await getPurchasedPackCreditPriceEur(user.id),
          pricingConfig
        );

    const estimate = estimateForAction(
      "transitionDetect",
      { model: TRANSITION_MODEL, inputChars: answer.length, planSlug: plan?.slug ?? null },
      pricingConfig,
      accountCreditPriceEur
    );

    let reservationId = "";
    if (!bypassCredits) {
      const check = await hasEnoughCredits(user.id, estimate.reserveCredits, plan);
      if (!check.ok) {
        // NOT AN ERROR THE USER READS. A suggestion is a convenience; an
        // account with no credits should see the answer it paid for and
        // no button, not a wall about a feature it did not ask for.
        return NextResponse.json({
          ok: true,
          destination: null,
          source: "skipped",
          outOfCredits: true,
          message: insufficientCreditsMessage(check.remaining, estimate.reserveCredits),
        });
      }
      const reservation = await reserveCredits(user.id, estimate.reserveCredits, "transition_detect", {
        answerChars: answer.length,
        estimatedCredits: estimate.estimatedCredits,
      });
      if (!reservation.ok) {
        return NextResponse.json({ ok: true, destination: null, source: "skipped" });
      }
      reservationId = reservation.reservationId;
    }

    const costs = new CostAccumulator();
    let chosen: string | null = null;
    try {
      void recordAiCallForDailySpend(estimate.estimatedCredits);
      // THROUGH THE ROUTER, NOT THE SDK (step 1.4). The tool's input IS
      // the named destination.
      const outcome = await runCompletion(
        {
          purpose: "classification",
          model: TRANSITION_MODEL,
          maxTokens: 128,
          system: [{ type: "text", text: buildSystemPrompt() }],
          messages: [{ role: "user", content: answer }],
          tools: [DETECT_TOOL],
          toolChoice: { type: "tool", name: "name_destination" },
          requires: ["tool_calling"],
        },
        { userId: user.id }
      );
      // A call that never completed has no usage to record and names no
      // destination: the free reader's answer stands, and the route
      // releases rather than settles.
      if (!outcome.ok) throw new Error(`transitions: ${outcome.kind} ${outcome.detail}`);
      costs.record("classification", outcome.usage, outcome.reportedModel || outcome.model);

      const toolUse = outcome.toolCalls.find((call) => call.name === "name_destination");
      const raw = (toolUse?.input ?? {}) as Record<string, unknown>;
      // THE ENUM IS A REQUEST, NOT A GUARANTEE. destinationById() is what
      // makes "the id can only come from the closed list" true, and it is
      // the same function the free path and the recorder use — one place
      // that knows what a destination is.
      const named = typeof raw.destination === "string" ? destinationById(raw.destination) : null;
      chosen = named && raw.confident === true ? named.id : null;
    } catch (err) {
      logApiError("/api/transitions/detect", err, { stage: "anthropic_call" });
      await releaseReservation(user.id, reservationId);
      return NextResponse.json({ ok: true, destination: null, source: "skipped" });
    }

    // SETTLED WHETHER OR NOT IT FOUND ANYTHING. The call happened and the
    // tokens were spent; charging only for the answers that produced a
    // button would price this feature at zero for the case it exists to
    // handle and hide its real cost from cost-alerts.
    const settlement = await settleReservation({
      userId: user.id,
      reservationId,
      feature: "transition_detect",
      costs,
      plan,
      bypassCharge: bypassCredits,
      metadata: { destination: chosen ?? "none", answerChars: answer.length },
    });

    return NextResponse.json({
      ok: true,
      destination: chosen,
      source: "model",
      usage: buildUsageReceipt({
        creditsCharged: settlement.creditsCharged,
        bypass: bypassCredits,
        wouldHaveCharged: null,
      }),
    });
  } catch (err) {
    logApiError("/api/transitions/detect", err, { stage: "unhandled" });
    return NextResponse.json({ ok: true, destination: null, source: "skipped" });
  }
}
