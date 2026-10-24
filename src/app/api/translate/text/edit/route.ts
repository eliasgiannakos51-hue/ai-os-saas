import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { logApiError } from "@/lib/log-error";
import { isAdminEmail } from "@/lib/auth/admin-emails";
import { hasActiveBetaBypass } from "@/lib/beta";
import { isFeatureOn } from "@/lib/flags/flags";
import { checkBypassCeiling } from "@/lib/billing/bypass-ceiling";
import { checkAiCallAllowed, fingerprintRequest, recordAiCallForDailySpend } from "@/lib/ai-circuit-breaker";
import { getPurchasedPackCreditPriceEur, hasEnoughCredits, insufficientCreditsMessage, resolveEffectivePlan } from "@/lib/billing/credits";
import { CostAccumulator } from "@/lib/billing/cost-accumulator";
import { estimateForAction } from "@/lib/billing/estimate";
import { resolvePricingConfig } from "@/lib/billing/pricing-config";
import { effectiveCreditPriceEurForAccount } from "@/lib/billing/credit-formula";
import { releaseReservation, reserveCredits, settleReservation } from "@/lib/billing/reservations";
import { isSupportedTargetLocale } from "@/lib/documents/translation";
import { isTranslateStyle, translateEditInputChars, type TranslateStyle } from "@/lib/translate/translate-prompt";
import { cleanGlossaryTerms } from "@/lib/translate/text-source";
import { anyProviderConfigured } from "@/lib/ai/providers/registry";
import { translateParagraphEdit } from "@/lib/translate/translate-call";

export const dynamic = "force-dynamic";
export const maxDuration = 60; // @function-limit 60

/**
 * ONE TRANSLATED PARAGRAPH, CHANGED BY WORDS (the standalone Translate
 * tool, package 3, behind "translate-tool"): "shorter", "more formal" —
 * only the paragraph pressed changes; every other paragraph, in every
 * other language, is never sent and comes back byte for byte because it
 * was never touched.
 *
 * The translation itself is not a stored row yet (package 8 adds that),
 * so this takes the CURRENT paragraph text as input rather than an id —
 * same shape as api/documents/[id]/edit's blockIndex, minus the id,
 * because there is no document here to look up.
 */
const MAX_PARAGRAPH_CHARS = 2_000;
const MAX_INSTRUCTION_CHARS = 500;
type Mode = "price" | "run";
const isMode = (v: unknown): v is Mode => v === "price" || v === "run";

type Body = { target: unknown; style: unknown; paragraph: unknown; instruction: unknown; mode: unknown; glossary?: unknown };

function parseBody(
  body: Body
):
  | { ok: true; target: string; style: TranslateStyle; paragraph: string; instruction: string; mode: Mode; glossary: string[] }
  | { ok: false; code: string } {
  if (!isMode(body.mode)) return { ok: false, code: "invalid_request" };
  if (!isSupportedTargetLocale(body.target)) return { ok: false, code: "invalid_request" };
  if (!isTranslateStyle(body.style)) return { ok: false, code: "invalid_request" };
  if (typeof body.paragraph !== "string" || !body.paragraph.trim() || body.paragraph.length > MAX_PARAGRAPH_CHARS) return { ok: false, code: "invalid_request" };
  if (typeof body.instruction !== "string" || !body.instruction.trim() || body.instruction.length > MAX_INSTRUCTION_CHARS) return { ok: false, code: "invalid_request" };
  const glossary = cleanGlossaryTerms(body.glossary);
  if (glossary === null) return { ok: false, code: "invalid_request" };
  return { ok: true, target: body.target, style: body.style, paragraph: body.paragraph, instruction: body.instruction, mode: body.mode, glossary };
}

export async function POST(request: Request) {
  let body: Body;
  try {
    body = (await request.json()) as Body;
  } catch {
    return NextResponse.json({ ok: false, code: "invalid_body" }, { status: 400 });
  }
  const parsed = parseBody(body);

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ ok: false, code: "not_signed_in" }, { status: 401 });
  if (!(await isFeatureOn("translate-tool", user))) return NextResponse.json({ ok: false, code: "not_enabled" }, { status: 403 });
  if (!parsed.ok) return NextResponse.json({ ok: false, code: parsed.code }, { status: 400 });
  const { target, style, paragraph, instruction, glossary } = parsed;

  try {
    const plan = await resolveEffectivePlan(user);
    const pricingConfig = resolvePricingConfig();
    const packPriceEur = await getPurchasedPackCreditPriceEur(user.id);
    const inputChars = translateEditInputChars(target, paragraph, instruction, style, glossary);
    const estimate = estimateForAction(
      "textTranslateEdit",
      { model: "claude-sonnet-4-6", inputChars, planSlug: plan?.slug ?? null },
      pricingConfig,
      plan ? effectiveCreditPriceEurForAccount(plan, packPriceEur, pricingConfig) : undefined
    );

    if (parsed.mode === "price") {
      const bypass = isAdminEmail(user.email) || (await hasActiveBetaBypass(user));
      return NextResponse.json({ ok: true, estimatedCredits: estimate.estimatedCredits, reserveCredits: estimate.reserveCredits, bypass });
    }

    if (!anyProviderConfigured(process.env)) return NextResponse.json({ ok: false, code: "not_configured" }, { status: 503 });

    const breaker = await checkAiCallAllowed(user.id, "text_translate_edit", fingerprintRequest(paragraph, instruction));
    if (!breaker.allowed) return NextResponse.json({ ok: false, code: "rate_limited" }, { status: 429 });
    const isAdmin = isAdminEmail(user.email);
    const isBeta = await hasActiveBetaBypass(user);
    const bypass = isAdmin || isBeta;
    if (bypass) {
      const ceiling = await checkBypassCeiling(user.id, isAdmin, isBeta);
      if (!ceiling.allowed) return NextResponse.json({ ok: false, code: "rate_limited" }, { status: 429 });
    }

    let reservationId = "";
    if (!bypass && plan) {
      const enough = await hasEnoughCredits(user.id, estimate.reserveCredits, plan);
      if (!enough.ok) {
        return NextResponse.json({ ok: false, code: "insufficient_credits", detail: insufficientCreditsMessage(enough.remaining, estimate.reserveCredits) }, { status: 402 });
      }
      const reservation = await reserveCredits(user.id, estimate.reserveCredits, "text_translate_edit", { target, style });
      if (!reservation.ok) return NextResponse.json({ ok: false, code: "insufficient_credits" }, { status: 402 });
      reservationId = reservation.reservationId;
    }

    const costs = new CostAccumulator();
    void recordAiCallForDailySpend(estimate.estimatedCredits);
    const outcome = await translateParagraphEdit({ target, style, paragraph, instruction, glossary, costs, userId: user.id, signal: request.signal });
    if (!outcome.ok) {
      await releaseReservation(user.id, reservationId);
      const status = outcome.kind === "aborted" ? 499 : outcome.kind === "unusable" ? 502 : 503;
      const code = outcome.kind === "aborted" ? "stopped" : outcome.kind === "unusable" ? "unusable" : "ai_unavailable";
      if (code === "ai_unavailable") logApiError("/api/translate/text/edit", new Error(outcome.detail), { stage: "edit" });
      return NextResponse.json({ ok: false, code }, { status });
    }

    const settlement = await settleReservation({ userId: user.id, reservationId, feature: "text_translate_edit", costs, plan, bypassCharge: bypass, metadata: { target, style } });
    return NextResponse.json({ ok: true, text: outcome.text, creditsCharged: settlement.creditsCharged });
  } catch (err) {
    logApiError("/api/translate/text/edit", err);
    return NextResponse.json({ ok: false, code: "failed" }, { status: 500 });
  }
}
