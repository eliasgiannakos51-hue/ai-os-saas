import { NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { createClient } from "@/lib/supabase/server";
import { isAdminEmail } from "@/lib/admin";
import { hasActiveBetaBypass } from "@/lib/beta";
import {
  hasEnoughCredits,
  resolveEffectivePlan,
  getPurchasedPackCreditPriceEur,
} from "@/lib/billing/credits";
import { effectiveCreditPriceEurForAccount } from "@/lib/billing/credit-formula";
import { CostAccumulator } from "@/lib/billing/cost-accumulator";
import { estimateForAction } from "@/lib/billing/estimate";
import { resolvePricingConfig } from "@/lib/billing/pricing-config";
import { reserveCredits, settleReservation } from "@/lib/billing/reservations";
import {
  checkAiCallAllowed,
  fingerprintRequest,
  recordAiCallForDailySpend,
} from "@/lib/ai-circuit-breaker";
import { checkRateLimit } from "@/lib/rate-limit";
import { logApiError } from "@/lib/log-error";
import { PASTE_MODEL } from "@/lib/insights/insight-models";
import { MAX_PASTE_CHARS, MIN_PASTE_CHARS } from "@/lib/import/paste-limits";
import { extractFromPaste } from "@/lib/import/paste";
import { applyRows } from "@/lib/import/apply";
import { claimFreeActivationRun } from "@/lib/import/activation";

export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";
export const maxDuration = 60;

/**
 * Turn pasted text into entries.
 *
 * Unlike the CSV path this writes immediately rather than previewing.
 * The reason is what is being written: extracted entries are short, few,
 * and individually editable in the module they land in, so a wrong one is
 * a row to fix rather than four hundred rows to undo. A preview screen
 * between a paragraph and three ideas would be ceremony.
 */
export async function POST(request: Request) {
  const costs = new CostAccumulator();

  try {
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ ok: false, error: "Not authenticated." }, { status: 401 });
    }

    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ ok: false, error: "The AI service is not configured." }, { status: 503 });
    }

    const limited = await checkRateLimit({
      scope: "import_paste",
      identifier: user.id,
      maxAttempts: 30,
      windowMinutes: 60,
    });
    if (!limited.allowed) {
      return NextResponse.json(
        { ok: false, error: "Too many pastes in the last hour. Try again shortly." },
        { status: 429 }
      );
    }

    const body = await request.json().catch(() => null);
    const text = typeof body?.text === "string" ? body.text.trim() : "";
    const language = typeof body?.language === "string" ? body.language.slice(0, 12) : "en";

    if (text.length < MIN_PASTE_CHARS) {
      return NextResponse.json(
        { ok: false, error: `Paste at least ${MIN_PASTE_CHARS} characters.` },
        { status: 400 }
      );
    }
    if (text.length > MAX_PASTE_CHARS) {
      return NextResponse.json(
        { ok: false, error: `Paste up to ${MAX_PASTE_CHARS} characters at a time.` },
        { status: 400 }
      );
    }

    const breaker = await checkAiCallAllowed(user.id, "import_paste", fingerprintRequest(user.id, text));
    if (!breaker.allowed) {
      return NextResponse.json({ ok: false, error: breaker.reason }, { status: 429 });
    }

    const isAdmin = isAdminEmail(user.email);
    const freeRun = await claimFreeActivationRun(user.id);
    const bypassCredits = isAdmin || freeRun || (await hasActiveBetaBypass(user));

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
      "importPaste",
      { model: PASTE_MODEL, inputChars: text.length },
      pricingConfig,
      accountCreditPriceEur
    );

    let reservationId = "";
    if (!bypassCredits && plan) {
      const affordable = await hasEnoughCredits(user.id, estimate.reserveCredits, plan);
      if (!affordable.ok) {
        return NextResponse.json(
          { ok: false, insufficientCredits: true, error: "Not enough credits for that." },
          { status: 402 }
        );
      }
      const reservation = await reserveCredits(user.id, estimate.reserveCredits, "import_paste", {
        chars: text.length,
      });
      if (!reservation.ok) {
        return NextResponse.json(
          { ok: false, insufficientCredits: true, error: "Not enough credits for that." },
          { status: 402 }
        );
      }
      reservationId = reservation.reservationId;
    }
    void recordAiCallForDailySpend(estimate.estimatedCredits);

    const anthropic = new Anthropic({ apiKey });
    const outcome = await extractFromPaste({ anthropic, text, language, costs });

    const settlement = await settleReservation({
      userId: user.id,
      reservationId,
      feature: "import_paste",
      costs,
      plan,
      bypassCharge: bypassCredits || !plan,
      metadata: { chars: text.length, freeRun },
    });

    if (!outcome.ok) {
      return NextResponse.json({ ok: false, error: "That text could not be read just now." }, { status: 502 });
    }

    // "There is nothing here worth recording" is a correct answer, and
    // saying so beats inventing three entries out of a greeting.
    if (outcome.nothingFound || outcome.entries.length === 0) {
      return NextResponse.json({
        ok: true,
        nothingFound: true,
        imported: 0,
        creditsCharged: settlement.creditsCharged,
      });
    }

    const { data: importRow, error: importError } = await supabase
      .from("user_imports")
      .insert({ user_id: user.id, source: "paste" })
      .select("id")
      .single();

    if (importError || !importRow) {
      logApiError("/api/import/paste", importError, { stage: "insert_import" });
      return NextResponse.json({ ok: false, error: "The entries could not be saved." }, { status: 500 });
    }

    // Grouped per target so each table is one insert rather than one per
    // entry.
    const grouped = new Map<string, (typeof outcome.entries)[number]["row"][]>();
    for (const entry of outcome.entries) {
      grouped.set(entry.targetSlug, [...(grouped.get(entry.targetSlug) ?? []), entry.row]);
    }

    const result = await applyRows({
      supabase,
      userId: user.id,
      importId: String(importRow.id),
      batches: [...grouped.entries()].map(([targetSlug, rows]) => ({ targetSlug, rows })),
    });

    await supabase
      .from("user_imports")
      .update({ rows_imported: result.inserted, modules: result.byTable })
      .eq("id", importRow.id)
      .eq("user_id", user.id);

    return NextResponse.json({
      ok: true,
      importId: String(importRow.id),
      imported: result.inserted,
      byTable: result.byTable,
      modules: [...grouped.keys()],
      creditsCharged: settlement.creditsCharged,
    });
  } catch (err) {
    logApiError("/api/import/paste", err, {});
    return NextResponse.json({ ok: false, error: "Something went wrong." }, { status: 500 });
  }
}
