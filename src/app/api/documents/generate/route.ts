import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { logApiError } from "@/lib/log-error";
import { hasActiveBetaBypass } from "@/lib/beta";
import { checkBypassCeiling } from "@/lib/billing/bypass-ceiling";
import { checkAiCallAllowed, fingerprintRequest, recordAiCallForDailySpend } from "@/lib/ai-circuit-breaker";
import { getPurchasedPackCreditPriceEur, hasEnoughCredits, insufficientCreditsMessage } from "@/lib/billing/credits";
import { CostAccumulator } from "@/lib/billing/cost-accumulator";
import { estimateForAction } from "@/lib/billing/estimate";
import { loadWorkspaceContext, renderWorkspaceContext } from "@/lib/ai/workspace-context";
import { resolvePricingConfig } from "@/lib/billing/pricing-config";
import { effectiveCreditPriceEurForAccount } from "@/lib/billing/credit-formula";
import { releaseReservation, reserveCredits, settleReservation } from "@/lib/billing/reservations";
import { resolveLanguage } from "@/lib/text/resolve-language";
import { SUPPORTED_LOCALES } from "@/i18n/constants";
import { memoryPromptFor } from "@/lib/memory/store";
import { memoryActiveFor } from "@/lib/memory/memory-policy";
import { blocksToHtml, checkDocDescription, docEstimateInputChars, isDocKind, type DocKind } from "@/lib/documents/writer";
import { DOCUMENT_MODEL } from "@/lib/documents/writer-prompt";
import { writeDocument } from "@/lib/documents/write-call";
import { writerGate } from "@/lib/documents/writer-access";

export const dynamic = "force-dynamic";
export const maxDuration = 120; // @function-limit 120

/**
 * A DOCUMENT FROM A DESCRIPTION (MASTER 16, package 14), behind the switch
 * "document-writer".
 *
 * The pipeline every paid route here runs, in the same order: the body
 * before the user, the switch and the plan before the breaker, the hold
 * before the model, nothing spent before the last refusal. The person's
 * own records and memory go with the description, as Slides sends them,
 * so a quote can carry the business's real name.
 *
 * THE DOCUMENT IS AN ORDINARY ONE. It is written into user_documents
 * through the person's own client — the table and policies every note
 * already uses — as the editor's HTML (lib/documents/writer.ts
 * blocksToHtml, every character escaped), with `source: "written"` beside
 * it. So the editor opens it, the PDF route exports it, and the Word route
 * beside it reads it, without a new table or migration.
 */
export async function POST(request: Request) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return NextResponse.json({ ok: false, code: "not_configured" }, { status: 503 });

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ ok: false, code: "invalid_body" }, { status: 400 });
  }
  const description = typeof body.description === "string" ? body.description.trim() : "";
  const verdict = checkDocDescription(description);
  if (!verdict.ok) return NextResponse.json({ ok: false, code: verdict.reason, limit: verdict.limit }, { status: 400 });
  const kind: DocKind = isDocKind(body.kind) ? body.kind : "free";
  const uiLocale = typeof body.locale === "string" && (SUPPORTED_LOCALES as readonly string[]).includes(body.locale) ? body.locale : "en";

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ ok: false, code: "not_signed_in" }, { status: 401 });

  const gate = await writerGate(user);
  if (!gate.ok) return NextResponse.json({ ok: false, code: gate.code }, { status: 403 });

  try {
    const breaker = await checkAiCallAllowed(user.id, "document_generate", fingerprintRequest(description, kind));
    if (!breaker.allowed) return NextResponse.json({ ok: false, code: "rate_limited" }, { status: 429 });

    const isBeta = await hasActiveBetaBypass(user);
    const bypass = gate.isAdmin || isBeta;
    if (bypass) {
      const ceiling = await checkBypassCeiling(user.id, gate.isAdmin, isBeta);
      if (!ceiling.allowed) return NextResponse.json({ ok: false, code: "rate_limited" }, { status: 429 });
    }

    // THE PERSON'S OWN RECORDS, before the estimate: they are sent.
    const workspace = await loadWorkspaceContext(supabase, { include: true, brief: description });
    const businessContext = renderWorkspaceContext(workspace);

    const plan = gate.plan;
    const pricingConfig = resolvePricingConfig();
    const estimate = estimateForAction(
      "documentGenerate",
      { model: DOCUMENT_MODEL, inputChars: docEstimateInputChars(description.length + businessContext.length), planSlug: plan?.slug ?? null },
      pricingConfig,
      plan ? effectiveCreditPriceEurForAccount(plan, await getPurchasedPackCreditPriceEur(user.id), pricingConfig) : undefined
    );

    let reservationId = "";
    if (!bypass && plan) {
      const enough = await hasEnoughCredits(user.id, estimate.reserveCredits, plan);
      if (!enough.ok) {
        return NextResponse.json({ ok: false, code: "insufficient_credits", detail: insufficientCreditsMessage(enough.remaining, estimate.reserveCredits) }, { status: 402 });
      }
      const reservation = await reserveCredits(user.id, estimate.reserveCredits, "document_generate", { kind, descriptionChars: description.length });
      if (!reservation.ok) return NextResponse.json({ ok: false, code: "insufficient_credits" }, { status: 402 });
      reservationId = reservation.reservationId;
    }

    const locale = resolveLanguage(description, uiLocale);
    const costs = new CostAccumulator();
    void recordAiCallForDailySpend(estimate.estimatedCredits);
    // WHAT THE PERSON TOLD CHAT, read and never written: the writer
    // records nothing in memory, so it follows Chat's own switch on
    // /dashboard/ai-memory (a surface of its own would need a value the
    // database's chat_memory_surface_check does not allow).
    const memoryBlock = memoryActiveFor({ surface: "chat", user, planLimit: plan?.capabilities.chatMemoryLimit ?? 0 })
      ? await memoryPromptFor(supabase, user.id, plan?.capabilities.chatMemoryLimit ?? 0)
      : "";
    const outcome = await writeDocument({ apiKey, description, kind, locale, businessContext, memoryBlock, costs, signal: request.signal });

    if (!outcome.ok && (outcome.kind === "aborted" || outcome.kind === "provider")) {
      await releaseReservation(user.id, reservationId);
      if (outcome.kind === "aborted") return NextResponse.json({ ok: false, code: "stopped" }, { status: 499 });
      logApiError("/api/documents/generate", new Error(outcome.detail), { kind: outcome.kind });
      return NextResponse.json({ ok: false, code: "ai_unavailable" }, { status: 503 });
    }
    if (!outcome.ok) {
      // The model answered and it was not a document: the tokens were spent.
      logApiError("/api/documents/generate", new Error(outcome.detail), { kind: outcome.kind });
      const settlement = await settleReservation({ userId: user.id, reservationId, feature: "document_generate", costs, plan, bypassCharge: bypass, metadata: { kind, outcome: "unusable" } });
      return NextResponse.json({ ok: false, code: "unusable", creditsCharged: settlement.creditsCharged }, { status: 502 });
    }

    const doc = outcome.value;
    const settlement = await settleReservation({
      userId: user.id,
      reservationId,
      feature: "document_generate",
      costs,
      plan,
      bypassCharge: bypass,
      metadata: { kind, locale, blocks: doc.blocks.length },
    });

    const { data: row, error: saveError } = await supabase
      .from("user_documents")
      .insert({ user_id: user.id, title: doc.title, content: { html: blocksToHtml(doc.blocks), source: "written", locale, kind } })
      .select("id")
      .single();
    if (saveError || !row) {
      logApiError("/api/documents/generate", saveError, { stage: "save" });
      return NextResponse.json({ ok: false, code: "not_saved", creditsCharged: settlement.creditsCharged }, { status: 500 });
    }
    return NextResponse.json({ ok: true, id: row.id, title: doc.title, blocks: doc.blocks, locale, creditsCharged: settlement.creditsCharged });
  } catch (err) {
    logApiError("/api/documents/generate", err);
    return NextResponse.json({ ok: false, code: "failed" }, { status: 500 });
  }
}
