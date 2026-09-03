import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
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
import { loadWorkspaceContext, renderWorkspaceContext } from "@/lib/ai/workspace-context";
import { loadChatContextForCoding } from "@/lib/ai/cross-module-store";
import {
  MAX_INPUT_CHARS,
  OPERATION_SPECS,
  buildCodePrompt,
  deriveTitle,
  isCodeLanguage,
  isCodeOperation,
} from "@/lib/coding/operations";

export const dynamic = "force-dynamic";
export const maxDuration = 120; // @function-limit 120

const MODEL = "claude-sonnet-4-6";

/**
 * ONE CODING OPERATION.
 *
 * Five of them, and four things it does not do — see
 * lib/coding/operations.ts, where the exclusions are the load-bearing
 * part. Nothing here clones a repository, runs anything, or writes
 * anywhere except this account's own history table.
 *
 * THE WORKSPACE CONTEXT IS OPTIONAL AND EXPLICIT. When the caller asks
 * for it, the user's OWN modules (through their OWN RLS-scoped client)
 * contribute a short list of headlines, so "a function that calculates
 * the margin" can mean what it means in this account. The flag comes from
 * a visible toggle; nothing reads the workspace because a default said so.
 */
export async function POST(request: Request) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "not_signed_in" }, { status: 401 });

  try {
    const body = (await request.json()) as Record<string, unknown>;
    const operation = body.operation;
    if (!isCodeOperation(operation)) return NextResponse.json({ error: "unknown_operation" }, { status: 400 });

    const input = typeof body.input === "string" ? body.input : "";
    // `codeLanguage`, not `language`. This is a PROGRAMMING language —
    // typescript, python — and every other route in this app uses
    // `body.language` for the natural language a reply should be written
    // in. Two different meanings behind one field name is how somebody
    // later wires this into resolveLanguage and starts answering Greek
    // users in Python; scripts/tests/resolve-language.test.mjs was right
    // to stop on it.
    const language = isCodeLanguage(body.codeLanguage) ? body.codeLanguage : null;
    const targetLanguage = isCodeLanguage(body.targetCodeLanguage) ? body.targetCodeLanguage : null;
    const useWorkspace = body.useWorkspace !== false;

    const spec = OPERATION_SPECS[operation];

    // The workspace read happens BEFORE the prompt is built, because the
    // context is part of what is priced.
    const workspace = await loadWorkspaceContext(supabase, { include: useWorkspace });

    // THE OTHER HALF OF THE CONVERSATION (V4 #36). The workspace context
    // says what the user is BUILDING; this says what they and the model
    // already SAID about it — which is the only place the answer to "why
    // did you do it that way?" exists.
    //
    // Behind the same toggle as the workspace read, and gated by the same
    // relevance rule: a request that mentions nothing the user has
    // discussed adds nothing, and the prompt is byte-identical to what it
    // was before this existed. Through the RLS-scoped client, never the
    // admin one.
    const chatContext = useWorkspace
      ? await loadChatContextForCoding(supabase, `${input} ${operation}`)
      : { text: "", selection: { chosen: [], reason: "workspace off", chars: 0 }, pool: 0 };

    const contextText = [renderWorkspaceContext(workspace), chatContext.text]
      .filter((part) => part.trim() !== "")
      .join("\n\n");

    const prompt = buildCodePrompt({ operation, input, language, targetLanguage }, contextText);
    if (!prompt.ok) {
      return NextResponse.json(
        { error: prompt.reason, limit: prompt.reason === "too_long" ? MAX_INPUT_CHARS : undefined },
        { status: 400 }
      );
    }

    const breaker = await checkAiCallAllowed(user.id, "code_assist", fingerprintRequest(operation, input));
    if (!breaker.allowed) return NextResponse.json({ error: "rate_limited", detail: breaker.reason }, { status: 429 });

    const isAdmin = isAdminEmail(user.email);
    const isBeta = await hasActiveBetaBypass(user);
    const bypass = isAdmin || isBeta;
    if (bypass) {
      const ceiling = await checkBypassCeiling(user.id, isAdmin, isBeta);
      if (!ceiling.allowed) return NextResponse.json({ error: "bypass_ceiling", detail: ceiling.reason }, { status: 429 });
    }

    const plan = await resolveEffectivePlan(user);
    const pricingConfig = resolvePricingConfig();
    const estimate = estimateForAction(
      "codeAssist",
      { model: MODEL, inputChars: prompt.system.length + prompt.user.length, planSlug: plan?.slug ?? null },
      pricingConfig,
      plan
        ? effectiveCreditPriceEurForAccount(plan, await getPurchasedPackCreditPriceEur(user.id), pricingConfig)
        : undefined
    );

    let reservationId = "";
    if (!bypass && plan) {
      const enough = await hasEnoughCredits(user.id, estimate.reserveCredits, plan);
      if (!enough.ok) {
        return NextResponse.json(
          { error: "insufficient_credits", detail: insufficientCreditsMessage(enough.remaining, estimate.reserveCredits) },
          { status: 402 }
        );
      }
      const reservation = await reserveCredits(user.id, estimate.reserveCredits, "code_assist", { operation });
      if (!reservation.ok) return NextResponse.json({ error: "reserve_failed", detail: reservation.reason }, { status: 402 });
      reservationId = reservation.reservationId;
    }

    const costs = new CostAccumulator();
    const outcome = await runCompletion(
      {
        purpose: "create",
        model: MODEL,
        maxTokens: spec.maxTokens,
        system: [{ type: "text", text: prompt.system }],
        messages: [{ role: "user", content: prompt.user }],
      },
      // THE STOP BUTTON — V4.6: the request's own abort signal. When the
      // person stops, the provider call is aborted with it.
      { userId: user.id, signal: request.signal }
    );

    const admin = createAdminClient();

    if (!outcome.ok && outcome.kind === "aborted") {
      // Stopped before a result existed. A non-streaming call has no
      // partial output to charge for — the answer is produced whole or
      // not at all — so nothing was delivered and nothing is charged: the
      // hold goes back in full. No failed row either: the person did
      // this, and a history entry saying "failed" would be the wrong word.
      await releaseReservation(user.id, reservationId);
      return NextResponse.json({ error: "stopped" }, { status: 499 });
    }

    if (!outcome.ok) {
      // Nothing produced, nothing charged — the hold goes back whole.
      await releaseReservation(user.id, reservationId);
      logApiError("/api/coding/run", new Error(outcome.detail), { operation, kind: outcome.kind });
      // The FAILED row is still written, because a run that cost the user
      // a wait and produced nothing is a thing they should be able to see
      // in their history rather than an event that never happened.
      const { error: failError } = await admin.from("code_sessions").insert({
        user_id: user.id,
        operation,
        title: deriveTitle({ operation, input }),
        input,
        language,
        target_language: targetLanguage,
        status: "failed",
        // A REASON CODE in the column, not a sentence: the row is read
        // back by a page that renders its own translated wording, and an
        // English sentence stored here would be one a Greek user reads in
        // English forever.
        error: "ai_unavailable",
      });
      if (failError) logApiError("/api/coding/run", failError, { stage: "record_failure" });
      return NextResponse.json({ error: "ai_unavailable" }, { status: 503 });
    }

    costs.record("generation", outcome.usage, outcome.reportedModel || outcome.model);
    const settlement = await settleReservation({
      userId: user.id,
      reservationId,
      feature: "code_assist",
      costs,
      plan,
      bypassCharge: bypass,
      metadata: {
        operation,
        workspaceModules: workspace.facts.length,
        chatTurnsUsed: chatContext.selection.chosen.length,
      },
    });

    const { data: row, error: saveError } = await admin
      .from("code_sessions")
      .insert({
        user_id: user.id,
        operation,
        title: deriveTitle({ operation, input }),
        input,
        language,
        target_language: targetLanguage,
        output: outcome.text,
        status: "done",
        credits_charged: settlement.creditsCharged,
      })
      .select("id")
      .single();
    if (saveError) logApiError("/api/coding/run", saveError, { stage: "save" });

    return NextResponse.json({
      ok: true,
      id: row?.id ?? null,
      output: outcome.text,
      outputKind: spec.outputKind,
      creditsCharged: settlement.creditsCharged,
      /** So the panel can say "using 4 of your modules" rather than
       *  leaving the user to wonder what it read. */
      workspaceModulesUsed: workspace.facts.length,
      /** So the panel can say "and 2 turns from your chat" rather than
       *  silently reading the user's conversation into a code request. */
      chatTurnsUsed: chatContext.selection.chosen.length,
    });
  } catch (err) {
    logApiError("/api/coding/run", err);
    return NextResponse.json({ error: "run_failed" }, { status: 500 });
  }
}
