import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { logApiError } from "@/lib/log-error";
import { hasActiveBetaBypass } from "@/lib/beta";
import { checkBypassCeiling } from "@/lib/billing/bypass-ceiling";
import { checkAiCallAllowed, fingerprintRequest, recordAiCallForDailySpend } from "@/lib/ai-circuit-breaker";
import { getPurchasedPackCreditPriceEur, hasEnoughCredits, insufficientCreditsMessage } from "@/lib/billing/credits";
import { CostAccumulator } from "@/lib/billing/cost-accumulator";
import { estimateForAction } from "@/lib/billing/estimate";
import { resolvePricingConfig } from "@/lib/billing/pricing-config";
import { effectiveCreditPriceEurForAccount } from "@/lib/billing/credit-formula";
import { releaseReservation, reserveCredits, settleReservation } from "@/lib/billing/reservations";
import { resolveLanguage } from "@/lib/text/resolve-language";
import { memoryPromptFor } from "@/lib/memory/store";
import { memoryActiveFor } from "@/lib/memory/memory-policy";
import { htmlToBlocks } from "@/lib/pdf/blocks";
import {
  MAX_DOC_INSTRUCTION_CHARS,
  MIN_DOC_INSTRUCTION_CHARS,
  blockText,
  blocksToHtml,
  docEditEstimateInputChars,
  keepOnlyBlock,
  readBlockIndex,
} from "@/lib/documents/writer";
import { DOCUMENT_MODEL } from "@/lib/documents/writer-prompt";
import { rewriteBlock, rewriteDocument } from "@/lib/documents/write-call";
import { writerGate } from "@/lib/documents/writer-access";

export const dynamic = "force-dynamic";
export const maxDuration = 120; // @function-limit 120

/**
 * A DOCUMENT CHANGED WITH WORDS (MASTER 16, package 14: «αλλάζω μία
 * παράγραφο με λόγια»), behind the switch "document-writer".
 *
 * With `blockIndex`, ONE block changes: the model is shown the whole
 * document and returns only that block's new text (rewrite_block), and the
 * document saved is every other block exactly as it was read
 * (keepOnlyBlock). Without it, the whole document is rewritten.
 *
 * Any document of the person's own: one the writer made, or one typed in
 * the editor — both are read the same way, from the editor's HTML
 * (lib/pdf/blocks.ts htmlToBlocks), by id AND owner.
 */
export async function POST(request: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return NextResponse.json({ ok: false, code: "not_configured" }, { status: 503 });

  let instruction = "";
  let blockIndex: unknown;
  try {
    const body = await request.json();
    instruction = typeof body?.instruction === "string" ? body.instruction.trim() : "";
    blockIndex = body?.blockIndex;
  } catch {
    return NextResponse.json({ ok: false, code: "invalid_body" }, { status: 400 });
  }
  if (instruction.length < MIN_DOC_INSTRUCTION_CHARS) return NextResponse.json({ ok: false, code: "too_short", limit: MIN_DOC_INSTRUCTION_CHARS }, { status: 400 });
  if (instruction.length > MAX_DOC_INSTRUCTION_CHARS) return NextResponse.json({ ok: false, code: "too_long", limit: MAX_DOC_INSTRUCTION_CHARS }, { status: 400 });

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ ok: false, code: "not_signed_in" }, { status: 401 });

  const gate = await writerGate(user);
  if (!gate.ok) return NextResponse.json({ ok: false, code: gate.code }, { status: 403 });

  const { data: row, error: readError } = await supabase
    .from("user_documents")
    .select("id, title, content")
    .eq("id", params.id)
    .eq("user_id", user.id)
    .maybeSingle();
  if (readError) {
    logApiError("/api/documents/[id]/edit", readError, { stage: "read" });
    return NextResponse.json({ ok: false, code: "failed" }, { status: 500 });
  }
  if (!row) return NextResponse.json({ ok: false, code: "not_found" }, { status: 404 });

  const content = (row.content ?? {}) as { html?: unknown; locale?: unknown; source?: unknown; kind?: unknown };
  const stored = htmlToBlocks(typeof content.html === "string" ? content.html : "");
  if (stored.length === 0) return NextResponse.json({ ok: false, code: "empty" }, { status: 409 });
  const box = readBlockIndex(blockIndex, stored.length);
  if (box === "bad" || (box !== null && stored[box].kind === "rule")) return NextResponse.json({ ok: false, code: "bad_block" }, { status: 400 });
  const title = String(row.title ?? "");
  // THE DOCUMENT'S OWN LANGUAGE, not the instruction's: "shorter", typed in
  // English about a Greek letter, is a shorter Greek letter.
  const locale = typeof content.locale === "string" && content.locale ? content.locale : resolveLanguage(stored.map(blockText).join(" "), "en");

  try {
    const breaker = await checkAiCallAllowed(user.id, "document_edit", fingerprintRequest(params.id, instruction, box));
    if (!breaker.allowed) return NextResponse.json({ ok: false, code: "rate_limited" }, { status: 429 });
    const isBeta = await hasActiveBetaBypass(user);
    const bypass = gate.isAdmin || isBeta;
    if (bypass) {
      const ceiling = await checkBypassCeiling(user.id, gate.isAdmin, isBeta);
      if (!ceiling.allowed) return NextResponse.json({ ok: false, code: "rate_limited" }, { status: 429 });
    }

    const plan = gate.plan;
    const pricingConfig = resolvePricingConfig();
    const estimate = estimateForAction(
      box === null ? "documentEdit" : "documentBlockEdit",
      { model: DOCUMENT_MODEL, inputChars: docEditEstimateInputChars(stored, instruction.length), planSlug: plan?.slug ?? null },
      pricingConfig,
      plan ? effectiveCreditPriceEurForAccount(plan, await getPurchasedPackCreditPriceEur(user.id), pricingConfig) : undefined
    );
    let reservationId = "";
    if (!bypass && plan) {
      const enough = await hasEnoughCredits(user.id, estimate.reserveCredits, plan);
      if (!enough.ok) {
        return NextResponse.json({ ok: false, code: "insufficient_credits", detail: insufficientCreditsMessage(enough.remaining, estimate.reserveCredits) }, { status: 402 });
      }
      const reservation = await reserveCredits(user.id, estimate.reserveCredits, "document_edit", { documentId: params.id, block: box, instructionChars: instruction.length });
      if (!reservation.ok) return NextResponse.json({ ok: false, code: "insufficient_credits" }, { status: 402 });
      reservationId = reservation.reservationId;
    }

    const costs = new CostAccumulator();
    void recordAiCallForDailySpend(estimate.estimatedCredits);
    // WHAT THE PERSON TOLD CHAT, read and never written: the writer
    // records nothing in memory, so it follows Chat's own switch on
    // /dashboard/ai-memory (a surface of its own would need a value the
    // database's chat_memory_surface_check does not allow).
    const memoryBlock = memoryActiveFor({ surface: "chat", user, planLimit: plan?.capabilities.chatMemoryLimit ?? 0 })
      ? await memoryPromptFor(supabase, user.id, plan?.capabilities.chatMemoryLimit ?? 0)
      : "";

    let nextTitle = title;
    let next: ReturnType<typeof keepOnlyBlock> = null;
    let failure: { kind: "aborted" | "provider" | "unusable"; detail: string } | null = null;
    if (box !== null) {
      const out = await rewriteBlock({ apiKey, title, blocks: stored, index: box, instruction, locale, memoryBlock, costs, signal: request.signal });
      if (out.ok) {
        next = keepOnlyBlock(stored, box, out.value);
        if (!next) failure = { kind: "unusable", detail: "the rewritten block could not take its place" };
      } else failure = out;
    } else {
      const out = await rewriteDocument({ apiKey, title, blocks: stored, instruction, locale, memoryBlock, costs, signal: request.signal });
      if (out.ok) {
        next = out.value.blocks;
        nextTitle = out.value.title;
      } else failure = out;
    }

    if (failure && (failure.kind === "aborted" || failure.kind === "provider")) {
      await releaseReservation(user.id, reservationId);
      if (failure.kind === "aborted") return NextResponse.json({ ok: false, code: "stopped" }, { status: 499 });
      logApiError("/api/documents/[id]/edit", new Error(failure.detail), { kind: failure.kind });
      return NextResponse.json({ ok: false, code: "ai_unavailable" }, { status: 503 });
    }
    if (!next) {
      // An answer that is not a change: paid for, and the document left as it was.
      logApiError("/api/documents/[id]/edit", new Error(failure?.detail), { kind: "unusable" });
      const settlement = await settleReservation({ userId: user.id, reservationId, feature: "document_edit", costs, plan, bypassCharge: bypass, metadata: { documentId: params.id, block: box, outcome: "unusable" } });
      return NextResponse.json({ ok: false, code: "unusable", creditsCharged: settlement.creditsCharged }, { status: 502 });
    }

    const settlement = await settleReservation({
      userId: user.id,
      reservationId,
      feature: "document_edit",
      costs,
      plan,
      bypassCharge: bypass,
      metadata: { documentId: params.id, block: box, blocksBefore: stored.length, blocks: next.length, locale },
    });
    const { error: saveError } = await supabase
      .from("user_documents")
      .update({ title: nextTitle, content: { ...content, html: blocksToHtml(next), locale }, updated_at: new Date().toISOString() })
      .eq("id", params.id)
      .eq("user_id", user.id);
    if (saveError) {
      // SAID, NOT SWALLOWED: the document on screen is the stored one.
      logApiError("/api/documents/[id]/edit", saveError, { stage: "save" });
      return NextResponse.json({ ok: false, code: "not_saved", creditsCharged: settlement.creditsCharged }, { status: 500 });
    }
    return NextResponse.json({ ok: true, id: params.id, title: nextTitle, blocks: next, locale, creditsCharged: settlement.creditsCharged });
  } catch (err) {
    logApiError("/api/documents/[id]/edit", err);
    return NextResponse.json({ ok: false, code: "failed" }, { status: 500 });
  }
}
