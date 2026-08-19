import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { isAdminEmail } from "@/lib/admin";
import { hasActiveBetaBypass } from "@/lib/beta";
import { checkBypassCeiling } from "@/lib/billing/bypass-ceiling";
import {
  hasEnoughCredits,
  resolveEffectivePlan,
  getPurchasedPackCreditPriceEur,
} from "@/lib/billing/credits";
import { effectiveCreditPriceEurForAccount } from "@/lib/billing/credit-formula";
import { CostAccumulator } from "@/lib/billing/cost-accumulator";
import { estimateForAction } from "@/lib/billing/estimate";
import { resolvePricingConfig } from "@/lib/billing/pricing-config";
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
import { planContext } from "@/lib/files/ask";
import { startJob } from "@/lib/jobs/start-job";
import { resolveLanguage } from "@/lib/text/resolve-language";

export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";
export const maxDuration = 60;

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
    // THE QUESTION DECIDES, not the interface — the same fix as
    // api/research, because this route had the identical bug: it sent the
    // UI locale, so a Greek question asked from an English interface came
    // back answered in English. lib/text/resolve-language.ts.
    const uiLocale = typeof body?.language === "string" ? body.language.slice(0, 12) : "en";
    const language = resolveLanguage(question, uiLocale);

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

    const context = planContext(files);
    if (context.passes.length === 0) {
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
    //
    // ACROSS EVERY PASS. A corpus too large for one call is now read in
    // several rather than truncated, and each pass sends its own text
    // plus its own copy of the question. Pricing the first pass alone
    // would under-reserve by a factor of the pass count on exactly the
    // questions that cost the most — and an under-sized hold is not a
    // discount, it is a settlement that overdraws an account which was
    // told it could afford the question.
    const estimate = estimateForAction(
      "fileAsk",
      {
        model: FILE_ASK_MODEL,
        inputChars: context.totalChars + question.length * context.passes.length,
        planSlug: plan?.slug ?? null,
      },
      pricingConfig,
      accountCreditPriceEur
    );

    // FROM HERE THE ROUTE DOES NOT ANSWER.
    //
    // It declared maxDuration = 60 while sending an entire document set
    // through one model call. A large PDF plus a real question is exactly
    // the request most likely to exceed that, and a kill runs no catch
    // block: the answer is lost and the hold stands against it.
    //
    // The files are NOT put in the job input — a document set can be
    // megabytes, and storing the user's whole contract a second time in a
    // jsonb column would be both wasteful and wrong. The worker re-reads
    // them, scoped to the same user, so a file deleted in between is not
    // answerable from a copy we kept.
    const started = await startJob({
      userId: user.id,
      kind: "file_ask",
      reserve: bypassCredits || !plan ? 0 : estimate.reserveCredits,
      reserveMetadata: {
        files: files.length,
        estimatedCredits: estimate.estimatedCredits,
        passes: context.passes.length,
      },
      input: { question, language, fileIds: files.map((f) => f.id) },
    });

    if (!started.ok) {
      if (started.reason === "insufficient") {
        return NextResponse.json(
          { ok: false, insufficientCredits: true, error: "Not enough credits for this question." },
          { status: 402 }
        );
      }
      return NextResponse.json({ ok: false, error: started.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true, jobId: started.jobId, queued: true }, { status: 202 });
  } catch (err) {
    // No reservation to release here any more: the hold is taken inside
    // startJob, which gives it straight back if the row cannot be written.
    // Everything after that belongs to the job, which has its own refund
    // path. Releasing here as well would double-release a hold this route
    // no longer owns.
    logApiError("/api/files/ask", err, {});
    return NextResponse.json({ ok: false, error: "Something went wrong." }, { status: 500 });
  }
}
