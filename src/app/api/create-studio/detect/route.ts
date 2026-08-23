import { NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { createClient } from "@/lib/supabase/server";
import { CLASSIFIER_MODULES } from "@/lib/classifier-modules";
import { logApiError } from "@/lib/log-error";
import { checkRateLimit } from "@/lib/rate-limit";
import { isAdminEmail } from "@/lib/admin";
import { checkBypassCeiling } from "@/lib/billing/bypass-ceiling";
import { hasActiveBetaBypass } from "@/lib/beta";
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
  CREATE_STUDIO_TYPES,
  isCreateStudioType,
  STUDIO_MODEL,
  type CreateStudioDetection,
} from "@/lib/create-studio/plan";
import { AI_QUALITY_CHECKLIST_EN } from "@/lib/ai-quality-checklist";
import { AI_SAFETY_BOUNDARIES_EN, AI_CRISIS_CLASSIFIER_EN } from "@/lib/ai-conduct";
import { isAutomationFrequency } from "@/lib/automation-schedule";

export const dynamic = "force-dynamic";

// One small forced-tool-use call, nothing streamed. 60s is far more than
// this needs and matches the other single-classifier routes in the app —
// it exists so a platform default timeout can't kill the request midway
// and surface as a misleading "Network error" in the browser.
export const maxDuration = 60;

const MAX_REQUEST_LENGTH = 20000;

function buildSystemPrompt(): string {
  const moduleList = CLASSIFIER_MODULES.map((m) => `"${m.slug}"`).join(", ");

  return `You are the intake brain for "Ionexa AI"'s Create Studio. The user writes ONE sentence describing something they want to make. Your job is to decide WHICH KIND of thing it is, name it, and restate what you understood — nothing else. You are not creating anything; a separate step does that after the user confirms.

The six kinds, and when each applies:

- "website": they want a real, generated web page or site — a landing page, a portfolio, a menu, a one-pager. Anything whose deliverable is a rendered page.
- "mission": they describe a GOAL that needs several steps to reach ("launch X", "grow Y to Z", "get my first customers"). Multi-step outcomes, not a single record.
- "moduleEntry": they are logging or capturing one piece of information into their workspace — a trade, an expense, a competitor, a research note, a piece of feedback, a product, an idea. Available modules: ${moduleList}.
- "automation": they want something to happen REPEATEDLY on a schedule ("every Monday…", "each month…", "remind me weekly…"). The recurrence is what makes it this and not a mission.
- "document": they want a freeform written document or note to write in themselves — a brief, meeting notes, a draft, a plan they'll type out.
- "agent": they want an AI worker that runs on a schedule, does research or monitoring on its own, and DELIVERS the result somewhere. Signals: the word agent/bot/assistant; a destination ("send me", "email me", "on Telegram", "στο Discord", "στείλε μου"); or watching something outside their workspace ("monitor my competitors", "track prices", "check the news", "παρακολούθησε").

TELLING "agent" FROM "automation", because both repeat and this is the only place they can be confused:
- An AGENT thinks and reports. It has a prompt, it may search the web, and it sends its output to a channel the user names. "Every Monday check what my three competitors changed and email me" is an agent.
- An AUTOMATION repeats a plain action inside their own workspace, with no destination and nothing to research. "Log my weekly revenue every Friday" is an automation.
- If they name a destination, or ask for research or monitoring, it is an agent. If they only say it repeats, it is an automation. When neither signal is present, prefer "automation" — it is the smaller commitment and costs less.

TELLING "agent" FROM "mission": a mission is finished once; an agent keeps running. "Get my first ten customers" is a mission. "Every week, find me ten new leads" is an agent.

Rules:
- Pick exactly one kind. There is no "none" — if it is genuinely ambiguous, pick the closest and make "understanding" say plainly what you assumed, so the user can correct it.
- "title" is a short name (max 8 words) for the thing being created. No quotes, no trailing punctuation.
- "understanding" is ONE sentence, written directly TO the user, restating what they asked for in their own words and language. Do not add features they did not ask for. Do not promise anything about how long it will take or what it will cost — the app shows that separately from real numbers.
- Reply in the SAME LANGUAGE the user wrote in.
- Set "moduleSlug" ONLY when the kind is "moduleEntry", to the single best-matching module slug from the list above. Leave it null otherwise.
- Set "frequency" ONLY when the kind is "automation", to whichever of daily/weekly/monthly the user described. If they said it repeats but not how often, use "weekly" and say so in "understanding". Leave it null otherwise.
${AI_SAFETY_BOUNDARIES_EN}${AI_CRISIS_CLASSIFIER_EN}${AI_QUALITY_CHECKLIST_EN}`;
}

const DETECT_TOOL: Anthropic.Tool = {
  name: "detect_intent",
  description:
    "Decide which kind of thing the user wants to create, name it, and restate the request back to them.",
  input_schema: {
    type: "object",
    properties: {
      type: {
        type: "string",
        enum: [...CREATE_STUDIO_TYPES],
        description: "The single kind of thing the user wants to create.",
      },
      title: { type: "string", description: "Short name for the thing being created." },
      understanding: {
        type: "string",
        description: "One sentence restating the request, in the user's own language.",
      },
      moduleSlug: {
        type: ["string", "null"],
        description: 'Module slug when type is "moduleEntry"; null otherwise.',
      },
      frequency: {
        type: ["string", "null"],
        enum: ["daily", "weekly", "monthly", null],
        description: 'How often it repeats, when type is "automation"; null otherwise.',
      },
    },
    required: ["type", "title", "understanding"],
  },
};

/**
 * Create Studio's type detection.
 *
 * This route DECIDES and RESTATES. It never creates anything — the user
 * sees the restatement, the detected type, the time range and the credit
 * estimate first, and the existing per-type route does the actual work
 * only after they press Create. That split is the whole point: a wrong
 * guess costs one small classifier call, not a website generation.
 */
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
    try {
      const body = await request.json();
      message = typeof body?.message === "string" ? body.message.trim() : "";
    } catch {
      return NextResponse.json({ ok: false, error: "Invalid request body." }, { status: 400 });
    }

    if (!message) {
      return NextResponse.json({ ok: false, error: "A description is required." }, { status: 400 });
    }
    if (message.length > MAX_REQUEST_LENGTH) {
      return NextResponse.json(
        {
          ok: false,
          error: `Description is too long (${message.length}/${MAX_REQUEST_LENGTH} characters) — please shorten it.`,
        },
        { status: 400 }
      );
    }

    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ ok: false, error: "Not authenticated." }, { status: 401 });
    }

    // Cheap per-user ceiling on top of the credit check below. Detection
    // is deliberately low-cost, which is exactly why it needs a volume
    // limit as well as a balance one: a scripted loop could otherwise run
    // it thousands of times before the balance noticed.
    const { allowed } = await checkRateLimit({
      scope: "create_studio_detect",
      identifier: user.id,
      maxAttempts: 120,
      windowMinutes: 60,
    });
    if (!allowed) {
      return NextResponse.json(
        { ok: false, error: "Too many requests — please wait a minute and try again." },
        { status: 429 }
      );
    }

    const breakerCheck = await checkAiCallAllowed(
      user.id,
      "create_studio_detect",
      fingerprintRequest(message)
    );
    if (!breakerCheck.allowed) {
      return NextResponse.json({ ok: false, error: breakerCheck.reason }, { status: 429 });
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
      "createStudioDetect",
      { model: STUDIO_MODEL, inputChars: message.length, planSlug: plan?.slug ?? null },
      pricingConfig,
      accountCreditPriceEur
    );

    let reservationId = "";
    if (!bypassCredits) {
      const check = await hasEnoughCredits(user.id, estimate.reserveCredits, plan);
      if (!check.ok) {
        return NextResponse.json({
          ok: true,
          outOfCredits: true,
          message: insufficientCreditsMessage(check.remaining, estimate.reserveCredits),
        });
      }
      const reservation = await reserveCredits(
        user.id,
        estimate.reserveCredits,
        "create_studio_detect",
        { messageChars: message.length, estimatedCredits: estimate.estimatedCredits }
      );
      if (!reservation.ok) {
        return NextResponse.json({
          ok: true,
          outOfCredits: reservation.reason === "insufficient",
          message:
            reservation.reason === "insufficient"
              ? insufficientCreditsMessage(reservation.available, estimate.reserveCredits)
              : "Could not reserve credits for this request. No credits were charged — please try again.",
        });
      }
      reservationId = reservation.reservationId;
    }

    const costs = new CostAccumulator();
    let detection: CreateStudioDetection;
    try {
      void recordAiCallForDailySpend(estimate.estimatedCredits);
      const anthropic = new Anthropic({ apiKey });
      const response = await anthropic.messages.create({
        model: STUDIO_MODEL,
        max_tokens: 512,
        system: buildSystemPrompt(),
        messages: [{ role: "user", content: message }],
        tools: [DETECT_TOOL],
        tool_choice: { type: "tool", name: "detect_intent" },
      });

      costs.record("classification", response.usage, response.model || STUDIO_MODEL);

      const toolUse = response.content.find(
        (block): block is Anthropic.ToolUseBlock => block.type === "tool_use"
      );
      if (!toolUse) {
        await releaseReservation(user.id, reservationId);
        return NextResponse.json(
          { ok: false, error: "The model did not return a detection." },
          { status: 502 }
        );
      }

      const raw = toolUse.input as Record<string, unknown>;
      if (!isCreateStudioType(raw.type)) {
        await releaseReservation(user.id, reservationId);
        return NextResponse.json(
          { ok: false, error: "The model returned an unknown type." },
          { status: 502 }
        );
      }

      detection = {
        type: raw.type,
        title: String(raw.title ?? "").slice(0, 120).trim() || message.slice(0, 60),
        understanding: String(raw.understanding ?? "").slice(0, 600).trim(),
        moduleSlug:
          raw.type === "moduleEntry" &&
          typeof raw.moduleSlug === "string" &&
          CLASSIFIER_MODULES.some((m) => m.slug === raw.moduleSlug)
            ? raw.moduleSlug
            : null,
        // Defaulted rather than left null: an automation with no
        // recurrence cannot be created at all (api/automations/create
        // rejects it), and "weekly" is what the prompt above already
        // tells the model to say it assumed.
        frequency:
          raw.type === "automation"
            ? isAutomationFrequency(raw.frequency)
              ? raw.frequency
              : "weekly"
            : null,
      };
    } catch (err) {
      logApiError("/api/create-studio/detect", err, { stage: "anthropic_call" });
      await releaseReservation(user.id, reservationId);
      return NextResponse.json(
        { ok: false, error: "Could not read that request. No credits were charged — please try again." },
        { status: 502 }
      );
    }

    const settlement = await settleReservation({
      userId: user.id,
      reservationId,
      feature: "create_studio_detect",
      costs,
      plan,
      bypassCharge: bypassCredits,
      metadata: { detectedType: detection.type, messageChars: message.length },
    });

    return NextResponse.json({
      ok: true,
      detection,
      usage: buildUsageReceipt({
        creditsCharged: settlement.creditsCharged,
        bypass: bypassCredits,
        wouldHaveCharged: null,
      }),
    });
  } catch (err) {
    logApiError("/api/create-studio/detect", err, { stage: "unhandled" });
    return NextResponse.json({ ok: false, error: "Something went wrong." }, { status: 500 });
  }
}
