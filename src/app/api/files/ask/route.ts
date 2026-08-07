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
import { reserveCredits, settleReservation, releaseReservation } from "@/lib/billing/reservations";
import {
  checkAiCallAllowed,
  fingerprintRequest,
  recordAiCallForDailySpend,
} from "@/lib/ai-circuit-breaker";
import { checkRateLimit } from "@/lib/rate-limit";
import { logApiError } from "@/lib/log-error";
import { FILE_ASK_MODEL } from "@/lib/files/file-models";
import { maxFileQuestionsPerHour } from "@/lib/files/limits";
import { fileIdsInCollection, loadReadableFiles } from "@/lib/files/store";
import { MAX_FILES_PER_QUESTION, MAX_QUESTION_CHARS } from "@/lib/files/file-types";
import {
  askSystemPrompt,
  isNotInDocuments,
  prepareContext,
  stripNotInDocuments,
  verifyCitations,
} from "@/lib/files/ask";
import { aiGeneratedNotice } from "@/lib/agents/ai-disclosure";

export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";
export const maxDuration = 60;

const MAX_OUTPUT_TOKENS = 2000;

/**
 * Ask a question about the user's own documents.
 *
 * The billing shape is the one every AI route here uses — estimate,
 * reserve, call, settle on MEASURED usage — with one difference worth
 * naming: the reservation is sized AFTER the documents are loaded. It has
 * to be. The cost of this action is dominated by how much document text
 * goes into the prompt, and a hold sized from the question alone would be
 * off by three orders of magnitude on a 200-page contract.
 */
export async function POST(request: Request) {
  let reservationId = "";
  let userId = "";
  const costs = new CostAccumulator();

  try {
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ ok: false, error: "Not authenticated." }, { status: 401 });
    }
    userId = user.id;

    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ ok: false, error: "The AI service is not configured." }, { status: 503 });
    }

    const limited = await checkRateLimit({
      scope: "file_ask",
      identifier: user.id,
      maxAttempts: maxFileQuestionsPerHour(),
      windowMinutes: 60,
    });
    if (!limited.allowed) {
      return NextResponse.json(
        { ok: false, error: "Too many questions in the last hour. Try again shortly." },
        { status: 429 }
      );
    }

    const body = await request.json().catch(() => null);
    const question = typeof body?.question === "string" ? body.question.trim() : "";
    const language = typeof body?.language === "string" ? body.language.slice(0, 12) : "en";

    if (!question) {
      return NextResponse.json({ ok: false, error: "Ask a question first." }, { status: 400 });
    }
    if (question.length > MAX_QUESTION_CHARS) {
      return NextResponse.json(
        { ok: false, error: `Questions can be up to ${MAX_QUESTION_CHARS} characters.` },
        { status: 400 }
      );
    }

    // Either an explicit list of files, or a collection. Both resolve to
    // a list of ids that has ALREADY been filtered by ownership before it
    // reaches the model.
    let fileIds: string[] = [];
    if (typeof body?.collectionId === "string" && body.collectionId) {
      const { data: collection, error } = await supabase
        .from("file_collections")
        .select("id")
        .eq("id", body.collectionId)
        .eq("user_id", user.id)
        .maybeSingle();
      if (error) {
        logApiError("/api/files/ask", error, { stage: "load_collection" });
        return NextResponse.json({ ok: false, error: "Could not load that collection." }, { status: 500 });
      }
      if (!collection) {
        return NextResponse.json({ ok: false, error: "Collection not found." }, { status: 404 });
      }
      const ids = await fileIdsInCollection(supabase, user.id, String(collection.id));
      if (ids === null) {
        return NextResponse.json({ ok: false, error: "Could not load that collection." }, { status: 500 });
      }
      fileIds = ids;
    } else if (Array.isArray(body?.fileIds)) {
      fileIds = body.fileIds.filter((id: unknown): id is string => typeof id === "string" && id.length > 0);
    }

    if (fileIds.length === 0) {
      return NextResponse.json({ ok: false, error: "Select at least one file to ask about." }, { status: 400 });
    }
    if (fileIds.length > MAX_FILES_PER_QUESTION) {
      return NextResponse.json(
        { ok: false, error: `Ask about up to ${MAX_FILES_PER_QUESTION} files at a time.` },
        { status: 400 }
      );
    }

    const files = await loadReadableFiles(supabase, user.id, fileIds);
    if (files === null) {
      return NextResponse.json({ ok: false, error: "Could not load your files." }, { status: 500 });
    }
    if (files.length === 0) {
      return NextResponse.json(
        { ok: false, error: "None of the selected files have readable text yet." },
        { status: 400 }
      );
    }

    const context = prepareContext(files);
    if (!context.text) {
      return NextResponse.json(
        { ok: false, error: "None of the selected files have readable text yet." },
        { status: 400 }
      );
    }

    const breaker = await checkAiCallAllowed(user.id, "file_ask", fingerprintRequest(user.id, question));
    if (!breaker.allowed) {
      return NextResponse.json({ ok: false, error: breaker.reason }, { status: 429 });
    }

    const isAdmin = isAdminEmail(user.email);
    const bypassCredits = isAdmin || (await hasActiveBetaBypass(user));
    const plan = await resolveEffectivePlan(user);
    const pricingConfig = resolvePricingConfig();
    const accountCreditPriceEur = bypassCredits
      ? pricingConfig.creditPriceEur
      : effectiveCreditPriceEurForAccount(
          plan,
          await getPurchasedPackCreditPriceEur(user.id),
          pricingConfig
        );

    // Sized on the documents, not the question — see the file comment.
    const estimate = estimateForAction(
      "fileAsk",
      { model: FILE_ASK_MODEL, inputChars: context.charCount + question.length },
      pricingConfig,
      accountCreditPriceEur
    );

    if (!bypassCredits && plan) {
      const affordable = await hasEnoughCredits(user.id, estimate.reserveCredits, plan);
      if (!affordable.ok) {
        return NextResponse.json(
          { ok: false, insufficientCredits: true, error: "Not enough credits for this question." },
          { status: 402 }
        );
      }
      const reservation = await reserveCredits(user.id, estimate.reserveCredits, "file_ask", {
        files: files.length,
        estimatedCredits: estimate.estimatedCredits,
      });
      if (!reservation.ok) {
        return NextResponse.json(
          { ok: false, insufficientCredits: true, error: "Not enough credits for this question." },
          { status: 402 }
        );
      }
      reservationId = reservation.reservationId;
    }
    void recordAiCallForDailySpend(estimate.estimatedCredits);

    const anthropic = new Anthropic({ apiKey });
    let answer = "";

    try {
      const response = await anthropic.messages.create({
        model: FILE_ASK_MODEL,
        max_tokens: MAX_OUTPUT_TOKENS,
        system: askSystemPrompt({
          language,
          filenames: files.map((f) => f.filename),
          truncated: context.truncated,
        }),
        messages: [
          {
            role: "user",
            content: `${context.text}\n\nQuestion: ${question}`,
          },
        ],
      });
      costs.record("generation", response.usage, FILE_ASK_MODEL);
      answer = response.content
        .filter((block): block is Anthropic.TextBlock => block.type === "text")
        .map((block) => block.text)
        .join("")
        .trim();
    } catch (err) {
      // Settle rather than release: a failed call that consumed tokens
      // still consumed them, and an accumulator with nothing in it
      // settles to zero anyway.
      await settleReservation({
        userId: user.id,
        reservationId,
        feature: "file_ask",
        costs,
        plan,
        bypassCharge: bypassCredits || !plan,
        metadata: { outcome: "api_error" },
      });
      logApiError("/api/files/ask", err, { stage: "anthropic" });
      return NextResponse.json({ ok: false, error: "The AI could not answer just now." }, { status: 502 });
    }

    const settlement = await settleReservation({
      userId: user.id,
      reservationId,
      feature: "file_ask",
      costs,
      plan,
      bypassCharge: bypassCredits || !plan,
      metadata: { files: files.length, chars: context.charCount },
    });

    if (!answer) {
      return NextResponse.json({ ok: false, error: "The AI returned nothing." }, { status: 502 });
    }

    // The citations are checked against what the model was actually
    // shown. One that names a page we never sent is removed — a
    // fabricated reference looks checkable, which makes it worse than no
    // reference at all.
    const notFound = isNotInDocuments(answer);
    const checked = verifyCitations(notFound ? stripNotInDocuments(answer) : answer, context.allowed);

    return NextResponse.json({
      ok: true,
      answer: checked.answer,
      answeredFromDocuments: !notFound,
      citations: checked.verified,
      // Reported, not hidden: if the model invented references, the user
      // is entitled to know its answer was less grounded than it looked.
      removedCitations: checked.fabricated.length,
      skippedFiles: context.skipped,
      truncated: context.truncated,
      creditsCharged: settlement.creditsCharged,
      disclosure: aiGeneratedNotice(language),
    });
  } catch (err) {
    if (reservationId && userId) await releaseReservation(userId, reservationId);
    logApiError("/api/files/ask", err, {});
    return NextResponse.json({ ok: false, error: "Something went wrong." }, { status: 500 });
  }
}
