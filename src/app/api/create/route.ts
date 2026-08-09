import { NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
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
import { isAdminEmail } from "@/lib/admin";
import { hasActiveBetaBypass } from "@/lib/beta";
import { checkAiCallAllowed, fingerprintRequest, recordAiCallForDailySpend } from "@/lib/ai-circuit-breaker";
import {
  CREDIT_COSTS,
  hasEnoughCredits,
  getPurchasedPackCreditPriceEur,
  insufficientCreditsMessage,
  resolveEffectivePlan,
} from "@/lib/billing/credits";
import { checkNeedsClarification } from "@/lib/clarification";
import { CostAccumulator } from "@/lib/billing/cost-accumulator";
import { estimateForAction } from "@/lib/billing/estimate";
import { resolvePricingConfig } from "@/lib/billing/pricing-config";
import { effectiveCreditPriceEurForAccount } from "@/lib/billing/credit-formula";
import { reserveCredits, settleReservation, releaseReservation } from "@/lib/billing/reservations";
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

const MODEL = "claude-sonnet-4-6";
const MAX_MESSAGE_LENGTH = 20000;

function buildSystemPrompt(): string {
  const moduleDocs = CLASSIFIER_MODULES.map((m) => {
    const fieldDocs = m.fields
      .map((f) => {
        const parts: string[] = [f.type];
        if (f.required) parts.push("required");
        if (f.options) parts.push(`one of: ${f.options.join(" | ")}`);
        return `    - ${f.key} (${parts.join(", ")})`;
      })
      .join("\n");
    return `- "${m.slug}" (table: ${m.table})\n${fieldDocs}`;
  }).join("\n\n");

  return `You are the routing brain for "Ionexa AI", a personal operating system with 13 modules, each backed by a Postgres table. A user will describe something in free text. Your job: figure out which single module it belongs to (or none), and extract the structured fields for that module's table.

Available modules and their fields:

${moduleDocs}

Rules:
- Pick exactly one module slug from the list above, or "none" if the message doesn't clearly fit any module.
- Only include field keys that belong to the chosen module in the "fields" object. Do not invent keys.
- Number-type fields must be JSON numbers, not strings.
- Leave a field out (or null) if the message doesn't contain that information — don't fabricate data.
- Always fill in the module's required field(s) if the message contains enough information to do so; if you can't, prefer "none" and explain what's missing in "message".
- "message" is a short (1-2 sentence), friendly response shown directly to the user. If module is "none", briefly list the 13 available modules (ideas, competitors, research, finance, learning, trading, decisions, products, content, sales, feedback, analytics, automation) and ask them to rephrase. If matched, briefly confirm what you logged.
${AI_CONDUCT_EN}${AI_QUALITY_CHECKLIST_EN}`;
}

const ROUTE_ENTRY_TOOL: Anthropic.Tool = {
  name: "route_entry",
  description:
    "Classify the user's message into exactly one Ionexa AI module (or none) and extract the structured fields for that module's table.",
  input_schema: {
    type: "object",
    properties: {
      module: {
        type: "string",
        enum: [...CLASSIFIER_MODULES.map((m) => m.slug), "none"],
        description:
          'The single best-matching module slug, or "none" if the message does not clearly fit any module.',
      },
      fields: {
        type: "object",
        description:
          'Extracted field values for the chosen module\'s table. Empty object if module is "none". Only include keys that belong to the chosen module.',
      },
      message: {
        type: "string",
        description:
          "A short, friendly 1-2 sentence response to show the user.",
      },
    },
    required: ["module", "fields", "message"],
  },
};

type RouteEntryInput = {
  module: string;
  fields: Record<string, unknown>;
  message: string;
};

function coerceFieldValue(field: FieldConfig, raw: unknown): string | number | null {
  if (raw === undefined || raw === null || raw === "") return null;
  if (field.type === "number") {
    const num = typeof raw === "number" ? raw : Number(raw);
    return Number.isFinite(num) ? num : null;
  }
  return String(raw);
}

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

    // Clarifying-questions pre-check (see lib/clarification.ts) — same
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
    const costs = new CostAccumulator();

    let clarificationBypassCredits = false;
    let clarificationPlanForCheck: Awaited<ReturnType<typeof resolveEffectivePlan>> | null = null;
    if (!skipClarification) {
      clarificationBypassCredits = isAdminEmail(user.email) || (await hasActiveBetaBypass(user));
      clarificationPlanForCheck = clarificationBypassCredits ? null : await resolveEffectivePlan(user);
      if (clarificationPlanForCheck) {
        const affordabilityCheck = await hasEnoughCredits(
          user.id,
          CREDIT_COSTS.clarificationCheck,
          clarificationPlanForCheck
        );
        if (!affordabilityCheck.ok) {
          return NextResponse.json({
            ok: true,
            matched: false,
            message: insufficientCreditsMessage(affordabilityCheck.remaining, CREDIT_COSTS.clarificationCheck),
          });
        }
      }
      try {
        void recordAiCallForDailySpend(1);
        // Recorded into the SAME accumulator the classification uses, so a
        // request that ends here (needs clarification) and one that runs
        // all the way through are both charged their real total rather
        // than a flat 1 credit plus a flat createAnything credit.
        const clarification = await checkNeedsClarification(apiKey, "create", message, costs);
        if (clarification.needsClarification) {
          if (clarificationPlanForCheck) {
            const clarificationSettlement = await settleReservation({
              userId: user.id,
              reservationId: "",
              feature: "clarification_check",
              costs,
              plan: clarificationPlanForCheck,
              metadata: { source: "create_anything", outcome: "needs_clarification" },
            });
            diagLog(
              `[billing] clarification_check settled: ${JSON.stringify({
                userId: user.id,
                creditsCharged: clarificationSettlement.creditsCharged,
                achievedMargin: clarificationSettlement.achievedMargin,
              })}`
            );
          }
          return NextResponse.json({
            ok: true,
            matched: false,
            needsClarification: true,
            questions: clarification.questions,
          });
        }
      } catch (err) {
        // Best-effort: a clarification-check hiccup shouldn't block a
        // real entry from being classified — fall through, uncharged.
        logApiError("/api/create", err, { stage: "clarification_check" });
      }
    }

    // Credits: 1 credit per Create Anything request, deducted from
    // user_credits (see lib/billing/credits.ts). Admin-listed accounts
    // (see lib/admin.ts) and beta testers (see lib/beta.ts) skip this
    // entirely — treated as unlimited. Only a READ-ONLY check happens
    // here (reject early if obviously insufficient); the actual DEDUCT
    // happens via chargeForClassification() below, called only once each
    // branch's terminal outcome is known — a thrown Anthropic call never
    // reaches it, and a matched module's failed DB insert doesn't either.
    const isAdmin = isAdminEmail(user.email);
    const bypassCredits = isAdmin || (await hasActiveBetaBypass(user));
    let plan: Awaited<ReturnType<typeof resolveEffectivePlan>> | null = null;

    const pricingConfig = resolvePricingConfig();
    const accountCreditPriceEur = bypassCredits
      ? pricingConfig.creditPriceEur
      : effectiveCreditPriceEurForAccount(
          (plan = await resolveEffectivePlan(user)),
          await getPurchasedPackCreditPriceEur(user.id),
          pricingConfig
        );
    // Scales with the real request: a one-line note and a 4,000-character
    // brief with three attached images are no longer the same 1 credit.
    const estimate = estimateForAction(
      "createAnything",
      // imagePaths, not the downloaded images: the download happens later,
      // and the requested count is the upper bound — a hold that leans
      // high is released at settlement, a hold that leans low is not.
      { model: MODEL, inputChars: message.length, imageCount: imagePaths.length, planSlug: plan?.slug ?? null },
      pricingConfig,
      accountCreditPriceEur
    );

    let reservationId = "";
    if (!bypassCredits) {
      plan = await resolveEffectivePlan(user);
      const check = await hasEnoughCredits(user.id, estimate.reserveCredits, plan);
      if (!check.ok) {
        return NextResponse.json({
          ok: true,
          matched: false,
          outOfCredits: true,
          message: insufficientCreditsMessage(check.remaining, estimate.reserveCredits),
        });
      }
      const reservation = await reserveCredits(user.id, estimate.reserveCredits, "create_anything", {
        messageChars: message.length,
        estimatedCredits: estimate.estimatedCredits,
      });
      if (!reservation.ok) {
        return NextResponse.json({
          ok: true,
          matched: false,
          outOfCredits: reservation.reason === "insufficient",
          message:
            reservation.reason === "insufficient"
              ? insufficientCreditsMessage(reservation.available, estimate.reserveCredits)
              : "Could not reserve credits for this request. No credits were charged — please try again.",
        });
      }
      reservationId = reservation.reservationId;
    }

    // create_requests keeps a per-request log for history/debugging — no
    // longer used for gating (credits above are the actual limit now).
    const { error: usageLogError } = await supabase
      .from("create_requests")
      .insert({ user_id: user.id });
    if (usageLogError) {
      logApiError("/api/create", usageLogError, { stage: "usage_log" });
    }

    // "AI Life Context" — same consolidated user picture used by
    // api/chat/route.ts (see lib/user-context.ts), appended here too so
    // Create Anything's classification/field-extraction isn't limited to
    // just the one message it was given. Best-effort, same as chat's.
    let userContext = "";
    try {
      const fullContext = await getUserFullContext(supabase, user.id);
      userContext = buildUserContextPromptAdditionEnglish(fullContext);
    } catch (err) {
      logApiError("/api/create", err, { stage: "user_full_context" });
    }

    const anthropic = new Anthropic({ apiKey });

    // Optional attached image(s) (see lib/create-attachment-image.ts) —
    // real vision context for the classifier, e.g. a photo of a product
    // alongside "log this as a new product idea". Independently best-
    // effort per image; a bad/missing one never blocks the classification
    // itself, it's just excluded from the vision input.
    const attachmentImages = imagePaths.length > 0 ? await downloadAttachmentImages(supabase, imagePaths, "/api/create") : [];

    let toolInput: RouteEntryInput;
    try {
      const missionContextAddition = buildMissionContextSystemPromptAddition(priorStepsContext);

      void recordAiCallForDailySpend(estimate.estimatedCredits);
      const userContent: Anthropic.MessageParam["content"] =
        attachmentImages.length > 0
          ? [
              ...attachmentImages.map(
                (image): Anthropic.ImageBlockParam => ({
                  type: "image",
                  source: { type: "base64", media_type: image.mediaType, data: image.base64 },
                })
              ),
              { type: "text", text: message },
            ]
          : message;

      const response = await anthropic.messages.create({
        model: MODEL,
        max_tokens: 1024,
        system:
          buildSystemPrompt() + agentRoleSystemPromptAddition(agentRole) + userContext + missionContextAddition,
        messages: [{ role: "user", content: userContent }],
        tools: [ROUTE_ENTRY_TOOL],
        tool_choice: { type: "tool", name: "route_entry" },
      });

      costs.record("classification", response.usage, response.model || MODEL);

      const toolUse = response.content.find(
        (block): block is Anthropic.ToolUseBlock => block.type === "tool_use"
      );

      if (!toolUse) {
        return NextResponse.json(
          { ok: false, error: "The model did not return a classification." },
          { status: 502 }
        );
      }

      toolInput = toolUse.input as RouteEntryInput;
    } catch (err) {
      logApiError("/api/create", err, { stage: "anthropic_call" });
      await releaseReservation(user.id, reservationId);
      const errMessage = err instanceof Error ? err.message : "AI classification request failed.";
      return NextResponse.json(
        { ok: false, error: `${errMessage} No credits were charged — please try again.` },
        { status: 502 }
      );
    }

    // Confirmed success is charged here — but "confirmed" means the
    // classification's terminal outcome is actually known, not just that
    // the Anthropic call returned. A matched module still needs its DB
    // insert to succeed before this is chargeable; charging before that
    // (the previous behavior) meant a DB insert failure left the user
    // charged with nothing saved. chargeForClassification() is called at
    // every terminal branch below, once that branch's outcome is final.
    const userId = user.id;
    let settled = false;
    async function chargeForClassification() {
      // Guarded: chargeForClassification() is called from every terminal
      // branch and some branches fall through to another, so without this
      // a single request could settle twice.
      if (settled) return;
      settled = true;
      const settlement = await settleReservation({
        userId,
        reservationId,
        feature: "create_anything",
        costs,
        plan,
        bypassCharge: bypassCredits || !plan,
        metadata: {
          messageChars: message.length,
          attachmentImages: attachmentImages.length,
          estimatedCredits: estimate.estimatedCredits,
          reservedCredits: bypassCredits ? 0 : estimate.reserveCredits,
        },
      });
      diagLog(
        `[billing] create_anything settled: ${JSON.stringify({
          userId,
          aiCalls: costs.callCount,
          realCostUsd: settlement.realCostUsd,
          creditsCharged: settlement.creditsCharged,
          achievedMargin: settlement.achievedMargin,
        })}`
      );
    }

    if (!toolInput.module || toolInput.module === "none") {
      await chargeForClassification();
      return NextResponse.json({
        ok: true,
        matched: false,
        message: toolInput.message,
      });
    }

    const moduleConfig = getClassifierModule(toolInput.module);
    if (!moduleConfig) {
      await chargeForClassification();
      return NextResponse.json({
        ok: true,
        matched: false,
        message: toolInput.message,
      });
    }

    const payload: Record<string, string | number | null> = { user_id: user.id };
    for (const field of moduleConfig.fields) {
      payload[field.key] = coerceFieldValue(field, toolInput.fields?.[field.key]);
    }

    const missingRequired = moduleConfig.fields.find(
      (f) => f.required && (payload[f.key] === null || payload[f.key] === undefined)
    );
    if (missingRequired) {
      await chargeForClassification();
      return NextResponse.json({
        ok: true,
        matched: false,
        message: `I found this looked like a ${moduleConfig.title} entry, but couldn't extract "${missingRequired.label}", which is required. Could you add a bit more detail?`,
      });
    }

    const { data: insertedRecord, error: insertError } = await supabase
      .from(moduleConfig.table)
      .insert(payload)
      .select()
      .single();

    if (insertError) {
      // Insert failed — nothing was saved, so nothing is charged, same
      // "no credits were charged" guarantee api/modules/create gives.
      logApiError("/api/create", insertError, { stage: "insert" });
      return NextResponse.json(
        { ok: false, error: "Could not save the entry. No credits were charged — please try again." },
        { status: 500 }
      );
    }

    await chargeForClassification();

    return NextResponse.json({
      ok: true,
      matched: true,
      module: moduleConfig.slug,
      moduleTitle: moduleConfig.title,
      href: moduleHref(moduleConfig.slug),
      message: toolInput.message,
      outputSummary: buildOutputSummary(moduleConfig, insertedRecord as Record<string, unknown>, toolInput.message),
    });
  } catch (err) {
    logApiError("/api/create", err);
    return NextResponse.json(
      { ok: false, error: "Something went wrong. Please try again." },
      { status: 500 }
    );
  }
}
