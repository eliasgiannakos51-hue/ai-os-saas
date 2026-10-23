import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { logApiError } from "@/lib/log-error";
import { isAdminEmail } from "@/lib/auth/admin-emails";
import { hasActiveBetaBypass } from "@/lib/beta";
import { checkBypassCeiling } from "@/lib/billing/bypass-ceiling";
import { checkAiCallAllowed, fingerprintRequest } from "@/lib/ai-circuit-breaker";
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
import { runCompletion } from "@/lib/ai/providers/complete";
import { callMcpTool, McpError } from "@/lib/mcp/client";
import { getMcpServerForUse } from "@/lib/mcp/store";
import { buildPlanPrompt, PLAN_TOOL, PLAN_TOOL_NAME, readPlan } from "@/lib/mcp/plan";
import { MCP_LIMITS } from "@/lib/mcp/types";

export const dynamic = "force-dynamic";
export const maxDuration = 60; // @function-limit 60

const MODEL = "claude-sonnet-4-6";
// One tool name, its arguments and a sentence: bounded so a run that
// drifted cannot become a long generation nobody budgeted.
const MAX_OUTPUT_TOKENS = 600;

/**
 * «ASK IN WORDS», ONE APP AT A TIME. The request and the app's tool list go
 * to the model, which answers with ONE tool and its arguments. The model
 * call is what costs credits (reserved, then settled on measured usage,
 * released whole on a Stop or a failure — the shape every AI route keeps,
 * declared in scripts/tests/billing-coverage.test.mjs); the app's own call
 * is free.
 *
 * WHAT RUNS NOW AND WHAT WAITS FOR A PRESS: a tool the app marked read-only
 * runs at once and its result is returned; anything else comes back as a
 * plan (`needsApproval`) and runs only through ./call with `approved: true`,
 * which only the press on the plan sends. Nothing here runs on a schedule.
 */
export async function POST(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ ok: false, error: "not_signed_in" }, { status: 401 });
  const { id } = await ctx.params;

  try {
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const text = typeof body.request === "string" ? body.request : "";

    const found = await getMcpServerForUse(user.id, id);
    if (!found.ok) return NextResponse.json({ ok: false, code: found.reason }, { status: found.reason === "not_found" ? 404 : 409 });
    const tools = found.summary.tools;

    const prompt = buildPlanPrompt(text, tools);
    if (!prompt.ok) {
      return NextResponse.json({ ok: false, code: prompt.reason, limit: prompt.reason === "too_long" ? MCP_LIMITS.maxRequestChars : undefined }, { status: 400 });
    }

    const breaker = await checkAiCallAllowed(user.id, "mcp_ask", fingerprintRequest("mcp", text));
    if (!breaker.allowed) return NextResponse.json({ ok: false, error: "rate_limited", code: breaker.code, retryAt: breaker.retryAt, detail: breaker.reason }, { status: 429 });

    const isAdmin = isAdminEmail(user.email);
    const isBeta = await hasActiveBetaBypass(user);
    const bypass = isAdmin || isBeta;
    if (bypass) {
      const ceiling = await checkBypassCeiling(user.id, isAdmin, isBeta);
      if (!ceiling.allowed) return NextResponse.json({ ok: false, code: "bypass_ceiling", detail: ceiling.reason }, { status: 429 });
    }

    const plan = await resolveEffectivePlan(user);
    const pricingConfig = resolvePricingConfig();
    const estimate = estimateForAction(
      "mcpAsk",
      { model: MODEL, inputChars: prompt.system.length + prompt.user.length, planSlug: plan?.slug ?? null },
      pricingConfig,
      plan ? effectiveCreditPriceEurForAccount(plan, await getPurchasedPackCreditPriceEur(user.id), pricingConfig) : undefined
    );

    let reservationId = "";
    if (!bypass && plan) {
      const enough = await hasEnoughCredits(user.id, estimate.reserveCredits, plan);
      if (!enough.ok) {
        return NextResponse.json({ ok: false, code: "insufficient_credits", detail: insufficientCreditsMessage(enough.remaining, estimate.reserveCredits) }, { status: 402 });
      }
      const reservation = await reserveCredits(user.id, estimate.reserveCredits, "mcp_ask", { tools: tools.length });
      if (!reservation.ok) return NextResponse.json({ ok: false, code: "reserve_failed", detail: reservation.reason }, { status: 402 });
      reservationId = reservation.reservationId;
    }

    const costs = new CostAccumulator();
    const outcome = await runCompletion(
      {
        purpose: "file_ask",
        model: MODEL,
        maxTokens: MAX_OUTPUT_TOKENS,
        system: [{ type: "text", text: prompt.system }],
        messages: [{ role: "user", content: prompt.user }],
        tools: [PLAN_TOOL],
        toolChoice: { type: "tool", name: PLAN_TOOL_NAME },
        requires: ["tool_calling"],
      },
      { userId: user.id, signal: request.signal }
    );

    if (!outcome.ok && outcome.kind === "aborted") {
      await releaseReservation(user.id, reservationId);
      return NextResponse.json({ ok: false, code: "stopped" }, { status: 499 });
    }
    if (!outcome.ok) {
      await releaseReservation(user.id, reservationId);
      logApiError("/api/mcp/run", new Error(outcome.detail), { kind: outcome.kind });
      return NextResponse.json({ ok: false, code: "ai_unavailable" }, { status: 503 });
    }

    costs.record("generation", outcome.usage, outcome.reportedModel || outcome.model);
    const settlement = await settleReservation({
      userId: user.id,
      reservationId,
      feature: "mcp_ask",
      costs,
      plan,
      bypassCharge: bypass,
      metadata: { tools: tools.length },
    });

    const chosen = readPlan(outcome.toolCalls.find((c) => c.name === PLAN_TOOL_NAME)?.input, tools);
    if (!chosen) return NextResponse.json({ ok: false, code: "unusable_plan", creditsCharged: settlement.creditsCharged }, { status: 422 });
    if (chosen.kind === "none") return NextResponse.json({ ok: true, plan: chosen, creditsCharged: settlement.creditsCharged });

    // A tool the app marked read-only runs now; everything else waits for the press.
    if (!chosen.readOnly) return NextResponse.json({ ok: true, plan: chosen, needsApproval: true, creditsCharged: settlement.creditsCharged });
    try {
      const result = await callMcpTool(found.summary.url, found.token, chosen.tool, chosen.arguments);
      return NextResponse.json({ ok: true, plan: chosen, result, creditsCharged: settlement.creditsCharged });
    } catch (err) {
      const code = err instanceof McpError ? err.kind : "call_failed";
      if (!(err instanceof McpError)) logApiError("/api/mcp/run", err, { stage: "call" });
      return NextResponse.json({ ok: false, code, plan: chosen, creditsCharged: settlement.creditsCharged }, { status: 422 });
    }
  } catch (err) {
    logApiError("/api/mcp/run", err);
    return NextResponse.json({ ok: false, code: "run_failed" }, { status: 500 });
  }
}
