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
import { IMPORT_MAPPER_MODEL } from "@/lib/insights/insight-models";
import { MAX_CSV_BYTES, CsvError, parseCsv, sampleRows } from "@/lib/import/csv-parse";
import { detectDateOrder } from "@/lib/import/coerce";
import { proposeMapping } from "@/lib/import/map-columns";
import { buildRows, previewPairs } from "@/lib/import/build-rows";
import { activationAvailable, claimFreeActivationRun } from "@/lib/import/activation";

export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";
export const maxDuration = 60;

/**
 * Look at a spreadsheet and propose what it is.
 *
 * WRITES NOTHING. This route parses, asks the model which target the file
 * matches, builds the rows that WOULD be written, and returns a preview.
 * The user confirms on the next screen, and only /apply inserts.
 *
 * That split is the design. A column mapping is a guess, and a guess that
 * silently files four hundred trades as customer records is a mess the
 * user has to clean up by hand. A guess shown on a preview screen next to
 * their own source values is just a dropdown they change.
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
      scope: "import_analyse",
      identifier: user.id,
      maxAttempts: 30,
      windowMinutes: 60,
    });
    if (!limited.allowed) {
      return NextResponse.json(
        { ok: false, error: "Too many imports in the last hour. Try again shortly." },
        { status: 429 }
      );
    }

    const form = await request.formData().catch(() => null);
    const entry = form?.get("file");
    if (!form || !(entry instanceof File)) {
      return NextResponse.json({ ok: false, error: "No file was sent." }, { status: 400 });
    }
    if (entry.size > MAX_CSV_BYTES) {
      return NextResponse.json({ ok: false, error: "Spreadsheets must be 5MB or smaller." }, { status: 413 });
    }
    if (entry.size === 0) {
      return NextResponse.json({ ok: false, error: "That file is empty." }, { status: 400 });
    }

    const text = await entry.text();
    let parsed;
    try {
      parsed = parseCsv(text);
    } catch (err) {
      // CsvError messages are written for a person; anything else gets a
      // generic one rather than a parser's own words.
      return NextResponse.json(
        { ok: false, error: err instanceof CsvError ? `Sorry — ${err.message}.` : "That file could not be read." },
        { status: 400 }
      );
    }

    const breaker = await checkAiCallAllowed(
      user.id,
      "import_map",
      fingerprintRequest(user.id, parsed.headers.join("|"))
    );
    if (!breaker.allowed) {
      return NextResponse.json({ ok: false, error: breaker.reason }, { status: 429 });
    }

    // The free run is claimed BEFORE the work, not after — a run that
    // claimed on success would hand a second free one to anyone whose
    // first attempt failed.
    const isAdmin = isAdminEmail(user.email);
    const freeRun = await claimFreeActivationRun(user.id);
    const bypassCredits = isAdmin || freeRun || (await hasActiveBetaBypass(user));

    const plan = await resolveEffectivePlan(user);
    const pricingConfig = resolvePricingConfig(plan?.slug ?? null);
    const accountCreditPriceEur = bypassCredits
      ? pricingConfig.creditPriceEur
      : effectiveCreditPriceEurForAccount(
          plan,
          await getPurchasedPackCreditPriceEur(user.id),
          pricingConfig
        );

    const sample = sampleRows(parsed);
    const estimate = estimateForAction(
      "importMap",
      { model: IMPORT_MAPPER_MODEL, inputChars: JSON.stringify(sample).length + parsed.headers.join("").length },
      pricingConfig,
      accountCreditPriceEur
    );

    let reservationId = "";
    if (!bypassCredits && plan) {
      const affordable = await hasEnoughCredits(user.id, estimate.reserveCredits, plan);
      if (!affordable.ok) {
        return NextResponse.json(
          { ok: false, insufficientCredits: true, error: "Not enough credits to read that file." },
          { status: 402 }
        );
      }
      const reservation = await reserveCredits(user.id, estimate.reserveCredits, "import_map", {
        columns: parsed.headers.length,
        rows: parsed.rows.length,
      });
      if (!reservation.ok) {
        return NextResponse.json(
          { ok: false, insufficientCredits: true, error: "Not enough credits to read that file." },
          { status: 402 }
        );
      }
      reservationId = reservation.reservationId;
    }
    void recordAiCallForDailySpend(estimate.estimatedCredits);

    const anthropic = new Anthropic({ apiKey });
    const outcome = await proposeMapping({ anthropic, parsed, sample, costs });

    const settlement = await settleReservation({
      userId: user.id,
      reservationId,
      feature: "import_map",
      costs,
      plan,
      bypassCharge: bypassCredits || !plan,
      metadata: { outcome: outcome.ok ? outcome.proposal.targetSlug : outcome.reason, freeRun },
    });

    if (!outcome.ok) {
      return NextResponse.json({
        ok: false,
        reason: outcome.reason,
        // Named specifically: "we could not tell what this file is" is
        // actionable (pick a target yourself), "something went wrong" is
        // not.
        error:
          outcome.reason === "no_match"
            ? "That file does not look like anything we can import yet. Pick a destination yourself, or try a different export."
            : "The file could not be read just now.",
        headers: parsed.headers,
        creditsCharged: settlement.creditsCharged,
      });
    }

    // The date order is decided from the WHOLE column, not row by row —
    // and when the column genuinely cannot decide, that is reported so
    // the UI can ask instead of silently picking one.
    const dateField = outcome.proposal.mappings.find((m) => m.field === "occurred_at");
    const dateColumnIndex = dateField ? parsed.headers.indexOf(dateField.column) : -1;
    const dateCheck =
      dateColumnIndex >= 0
        ? detectDateOrder(parsed.rows.map((r) => r[dateColumnIndex] ?? ""))
        : { order: "dmy" as const, ambiguous: false };

    const built = buildRows({
      target: outcome.target,
      headers: parsed.headers,
      rows: parsed.rows,
      mappings: outcome.proposal.mappings,
      dateOrder: dateCheck.order,
    });

    return NextResponse.json({
      ok: true,
      proposal: outcome.proposal,
      headers: parsed.headers,
      targetLabel: outcome.target.label,
      fields: outcome.target.fields.map((f) => ({ key: f.key, label: f.label, type: f.type, required: f.required })),
      dateOrder: dateCheck.order,
      dateAmbiguous: dateCheck.ambiguous,
      counts: {
        totalRows: parsed.totalRowsSeen,
        readyRows: built.rows.length,
        rejectedRows: built.rejected.length,
        truncated: parsed.truncated,
      },
      rejected: built.rejected.filter((r) => r.reason).slice(0, 20),
      coercionFailures: built.coercionFailures,
      preview: previewPairs({ headers: parsed.headers, rows: parsed.rows, built: built.rows }),
      freeRun,
      activationStillFree: freeRun ? false : await activationAvailable(user.id),
      creditsCharged: settlement.creditsCharged,
    });
  } catch (err) {
    logApiError("/api/import/csv/analyse", err, {});
    return NextResponse.json({ ok: false, error: "Something went wrong." }, { status: 500 });
  }
}
