import { modelText } from "@/lib/verification/truncation";
import { NextResponse } from "next/server";
import React from "react";
import Anthropic from "@anthropic-ai/sdk";
import { createClient } from "@/lib/supabase/server";
import { logApiError } from "@/lib/log-error";
import { htmlToBlocks } from "@/lib/pdf/blocks";
import { PdfDocument } from "@/lib/pdf/document";
import { pdfResponse } from "@/lib/pdf/render";
import { resolveLanguage } from "@/lib/text/resolve-language";
import { isAdminEmail } from "@/lib/auth/admin-emails";
import { hasActiveBetaBypass } from "@/lib/beta";
import { checkBypassCeiling } from "@/lib/billing/bypass-ceiling";
import { checkAiCallAllowed, fingerprintRequest, recordAiCallForDailySpend } from "@/lib/ai-circuit-breaker";
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
import { reserveCredits, settleReservation, releaseReservation } from "@/lib/billing/reservations";
import {
  MAX_TRANSLATION_CHARS,
  TRANSLATION_MODEL,
  isSupportedTargetLocale,
  needsTranslation,
  splitTranslated,
  translationInput,
  translationMaxTokens,
  translationSystemPrompt,
} from "@/lib/documents/translation";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
// A translation of a fifteen-page document is one long Sonnet call.
export const maxDuration = 120; // @function-limit 120

/**
 * A written document, as a PDF the user can keep — in its own language, or
 * translated into another.
 *
 * The Documents module has stored `{ html }` since it replaced the legacy
 * Build-module tracker, and until now there was no way to get a document out
 * of it at all: no download, no export, no print view. The editor was the
 * only place the text existed.
 *
 * READ UNDER THE USER'S OWN SESSION, not the service role, so row level
 * security is what decides whether this document may be read. A route that
 * used the admin client and filtered by user_id in TypeScript would be one
 * forgotten `.eq()` away from serving somebody else's writing.
 *
 * ------------------------------------------------------------------
 * TWO PATHS, AND ONLY ONE OF THEM CHARGES — V4.6
 * ------------------------------------------------------------------
 *
 * No `lang`, or a `lang` equal to the language the document is written
 * in: rendered as it is stored. No model call, no reservation, nothing
 * touches the balance. This is what every download was before.
 *
 * A `lang` the document is NOT in: ONE Sonnet call translates the HTML
 * (lib/documents/translation.ts), the PDF is laid out from the result,
 * and the call is reserved, measured and settled exactly the way every
 * other AI action is (feature "document_translate"). The dialog that
 * sends `lang` has already shown the estimate from ../pdf-estimate —
 * the same estimator this route reserves against — so the person pressed
 * download knowing the amount. A failed translation releases the hold
 * and answers JSON, never a PDF of somebody's error message.
 *
 * The charge is reported back in a header the dialog reads, because the
 * body is the PDF and has no room for a receipt.
 */
export async function GET(request: Request, { params }: { params: { id: string } }) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "not_signed_in" }, { status: 401 });

  const lang = new URL(request.url).searchParams.get("lang");
  if (lang !== null && !isSupportedTargetLocale(lang)) {
    return NextResponse.json({ error: "unsupported_language" }, { status: 400 });
  }

  try {
    const { data: doc, error } = await supabase
      .from("user_documents")
      .select("title, content, updated_at")
      .eq("id", params.id)
      .maybeSingle();
    if (error) throw error;
    if (!doc) return NextResponse.json({ error: "not_found" }, { status: 404 });

    const storedHtml = typeof doc.content?.html === "string" ? doc.content.html : "";
    const storedTitle = String(doc.title ?? "").trim() || "Untitled";
    const storedBlocks = htmlToBlocks(storedHtml);
    // The language of the DOCUMENT, not of the interface: a reader whose app
    // is in Greek can be holding an Arabic document, and it is the document
    // that has to be laid out right to left.
    const detectedLocale = resolveLanguage(
      `${storedTitle} ${storedBlocks.map((b) => ("runs" in b ? b.runs.map((r) => r.text).join(" ") : "")).join(" ")}`,
      "en"
    );
    const subtitle = new Date(doc.updated_at).toISOString().slice(0, 10);

    // ---- the free path: the document's own language --------------------
    if (lang === null || !needsTranslation(detectedLocale, lang)) {
      const element = React.createElement(PdfDocument, {
        title: storedTitle,
        subtitle,
        blocks: storedBlocks,
        locale: detectedLocale,
      });
      return await pdfResponse(element, { filename: storedTitle, fallbackName: "document" });
    }

    // ---- the paid path: a translation ----------------------------------
    if (storedHtml.length > MAX_TRANSLATION_CHARS) {
      return NextResponse.json(
        { error: "too_long", chars: storedHtml.length, limit: MAX_TRANSLATION_CHARS },
        { status: 413 }
      );
    }
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: "not_configured" }, { status: 503 });
    }

    // Circuit breaker: independent of credits (see lib/ai-circuit-breaker.ts).
    const breakerCheck = await checkAiCallAllowed(
      user.id,
      "document_translate",
      fingerprintRequest(params.id, lang)
    );
    if (!breakerCheck.allowed) {
      return NextResponse.json({ error: "rate_limited", detail: breakerCheck.reason }, { status: 429 });
    }

    const isAdmin = isAdminEmail(user.email);
    const bypassCredits = isAdmin || (await hasActiveBetaBypass(user));
    if (bypassCredits) {
      const ceiling = await checkBypassCeiling(user.id, isAdmin, bypassCredits && !isAdmin);
      if (!ceiling.allowed) {
        return NextResponse.json({ error: "rate_limited", detail: ceiling.reason }, { status: 429 });
      }
    }

    // Always resolved, never null — even for a bypass account — so the cost
    // row carries the account's own plan and price.
    const plan = await resolveEffectivePlan(user);
    const pricingConfig = resolvePricingConfig();
    const system = translationSystemPrompt(lang);
    const input = translationInput(storedTitle, storedHtml);
    // THE SAME ESTIMATE THE DIALOG SHOWED: same action, same model, same
    // input length, same plan — see ../pdf-estimate/route.ts.
    const estimate = estimateForAction(
      "documentTranslate",
      { model: TRANSLATION_MODEL, inputChars: system.length + input.length, planSlug: plan?.slug ?? null },
      pricingConfig,
      plan
        ? effectiveCreditPriceEurForAccount(plan, await getPurchasedPackCreditPriceEur(user.id), pricingConfig)
        : undefined
    );

    let reservationId = "";
    if (!bypassCredits && plan) {
      const check = await hasEnoughCredits(user.id, estimate.reserveCredits, plan);
      if (!check.ok) {
        return NextResponse.json(
          {
            error: "insufficient_credits",
            detail: insufficientCreditsMessage(check.remaining, estimate.reserveCredits),
          },
          { status: 402 }
        );
      }
      const reservation = await reserveCredits(user.id, estimate.reserveCredits, "document_translate", {
        documentId: params.id,
        lang,
      });
      if (!reservation.ok) {
        return NextResponse.json(
          {
            error: reservation.reason === "insufficient" ? "insufficient_credits" : "reserve_failed",
            detail:
              reservation.reason === "insufficient"
                ? insufficientCreditsMessage(reservation.available, estimate.reserveCredits)
                : "Could not reserve credits. No credits were charged — please try again.",
          },
          { status: 402 }
        );
      }
      reservationId = reservation.reservationId;
    }

    const anthropic = new Anthropic({ apiKey });
    const costs = new CostAccumulator();
    let translated: { title: string; html: string };
    try {
      void recordAiCallForDailySpend(estimate.estimatedCredits);
      const response = await anthropic.messages.create({
        model: TRANSLATION_MODEL,
        max_tokens: translationMaxTokens(input.length),
        system,
        messages: [{ role: "user", content: input }],
      });
      costs.record("generation", response.usage, response.model || TRANSLATION_MODEL);
      // A DELIVERABLE READS ITS STOP REASON (scripts/tests/token-budgets
      // .test.mjs): a translation cut at max_tokens is half a document,
      // and half a document must not become a PDF someone pays for.
      const { text: rawText, truncated } = modelText(response);
      const text = rawText.trim();
      if (!text || truncated) {
        if (truncated) logApiError("/api/documents/[id]/pdf", "translation truncated at max_tokens", { lang, chars: input.length });
        await releaseReservation(user.id, reservationId);
        return NextResponse.json({ error: "translation_failed" }, { status: 502 });
      }
      translated = splitTranslated(text, storedTitle);
    } catch (err) {
      logApiError("/api/documents/[id]/pdf", err, { stage: "translate", lang });
      await releaseReservation(user.id, reservationId);
      return NextResponse.json({ error: "translation_failed" }, { status: 502 });
    }

    const blocks = htmlToBlocks(translated.html);
    if (blocks.length === 0) {
      // The model returned something, and it was not a document. Not a
      // PDF of nothing, and not a charge for nothing.
      await releaseReservation(user.id, reservationId);
      return NextResponse.json({ error: "translation_failed" }, { status: 502 });
    }

    // Settled only now — the translation exists and is about to be sent.
    // Bypass accounts settle too: charged nothing, real spend still logged.
    const settlement = await settleReservation({
      userId: user.id,
      reservationId,
      feature: "document_translate",
      costs,
      plan,
      bypassCharge: bypassCredits,
      metadata: {
        documentId: params.id,
        from: detectedLocale,
        to: lang,
        inputChars: input.length,
        estimatedCredits: estimate.estimatedCredits,
        reservedCredits: bypassCredits ? 0 : estimate.reserveCredits,
      },
    });

    const element = React.createElement(PdfDocument, {
      title: translated.title,
      subtitle,
      blocks,
      locale: lang,
    });
    const pdf = await pdfResponse(element, { filename: translated.title, fallbackName: "document" });
    // The receipt rides in headers: the body is the PDF.
    pdf.headers.set("X-Ionexa-Credits-Charged", String(settlement.creditsCharged));
    pdf.headers.set("X-Ionexa-Translated-From", detectedLocale);
    pdf.headers.set("X-Ionexa-Translated-To", lang);
    return pdf;
  } catch (err) {
    logApiError("/api/documents/[id]/pdf", err, { stage: "render" });
    return NextResponse.json({ error: "pdf_failed" }, { status: 500 });
  }
}
