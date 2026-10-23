import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { memoryPromptFor } from "@/lib/memory/store";
import { memoryActiveFor } from "@/lib/memory/memory-policy";
import { createAdminClient } from "@/lib/supabase/admin";
import { logApiError } from "@/lib/log-error";
import { isAdminEmail } from "@/lib/auth/admin-emails";
import { memoryWindowFor } from "@/lib/memory/memory-window";
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
import { MAX_INPUT_CHARS, OPERATION_SPECS, buildCodePrompt, deriveTitle, isCodeLanguage, planTurn } from "@/lib/coding/operations";
import { isPowerLevel, modelForPower } from "@/lib/coding/power";

export const dynamic = "force-dynamic";
export const maxDuration = 120; // @function-limit 120

/**
 * ONE TURN OF THE CONVERSATION.
 *
 * Five operations behind it, and four things it does not do — see
 * lib/coding/operations.ts, where the exclusions and `planTurn` (what
 * reads the operation off the message, now that there is no button for
 * it) are the load-bearing part. Nothing here clones a repository, runs
 * anything, or writes anywhere except this account's own history table.
 *
 * THE WORKSPACE CONTEXT IS ALWAYS INCLUDED (2026-10-22). The visible
 * "use your other modules" toggle was one of the controls the owner's
 * critical message asked off the screen — a verified-working capability
 * applies to everyone, with no switch, per the same message's item 1.
 */
export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "not_signed_in" }, { status: 401 });

  try {
    const body = (await request.json()) as Record<string, unknown>;
    const text = typeof body.text === "string" ? body.text : "";
    if (!text.trim()) return NextResponse.json({ error: "empty" }, { status: 400 });

    // WHAT THE WORK PANEL IS SHOWING RIGHT NOW, sent back by the client
    // each turn rather than kept server-side: `code_sessions` still holds
    // one row per turn, as it always did, so there is no multi-turn row
    // to read this from server-side — the conversation lives in the
    // browser tab for the visit, each turn still saved on its own.
    // `priorLanguage`, not `language`: a PROGRAMMING language, and
    // every other route in this app uses `body.language` for the natural
    // language a reply is written in. scripts/tests/resolve-language.test.mjs
    // scans for that second meaning; this field's different name is why
    // it is not on that list.
    const priorCode = typeof body.priorCode === "string" && body.priorCode.trim() ? body.priorCode : null;
    const priorLanguage = isCodeLanguage(body.priorLanguage) ? body.priorLanguage : null;
    // «ΙΣΧΥΣ» (the owner's message, 2026-10-23): the field's own choice,
    // sent as a tier name rather than a model id — lib/coding/power.ts is
    // the one place that name becomes a model, on the server, so no model
    // id travels over the wire either. Anything else in the body is the
    // unchanged default, same model every turn had before this control
    // existed.
    const power = isPowerLevel(body.power) ? body.power : "normal";
    const MODEL = modelForPower(power);

    const turn = planTurn(text, { code: priorCode, language: priorLanguage });
    const spec = OPERATION_SPECS[turn.operation];
    // What gets SAVED and shown in history: the user's own words for the
    // generate-as-edit path (turn.input there is "EXISTING CODE: ...\n\n
    // REQUESTED CHANGE: ..." — correct for the model, unreadable as a
    // title or a history row), the code itself for the other four.
    const storedInput = turn.isEdit ? text.trim() : turn.input;

    // The workspace read happens BEFORE the prompt is built, because the
    // context is part of what is priced.
    const workspace = await loadWorkspaceContext(supabase, { include: true });

    // THE OTHER HALF OF THE CONVERSATION (V4 #36). The workspace context
    // says what the user is BUILDING; this says what they and the model
    // already SAID about it — which is the only place the answer to "why
    // did you do it that way?" exists. A request that mentions nothing
    // the user has discussed adds nothing. Through the RLS-scoped
    // client, never the admin one.
    const chatContext = await loadChatContextForCoding(supabase, `${turn.input} ${turn.operation}`);

    const contextText = [renderWorkspaceContext(workspace), chatContext.text]
      .filter((part) => part.trim() !== "")
      .join("\n\n");

    const prompt = buildCodePrompt(
      { operation: turn.operation, input: turn.input, language: turn.language, targetLanguage: turn.targetLanguage },
      contextText
    );
    if (!prompt.ok) {
      return NextResponse.json(
        { error: prompt.reason, limit: prompt.reason === "too_long" ? MAX_INPUT_CHARS : undefined },
        { status: 400 }
      );
    }

    const breaker = await checkAiCallAllowed(user.id, "code_assist", fingerprintRequest(turn.operation, turn.input));
    if (!breaker.allowed) return NextResponse.json({ error: "rate_limited", code: breaker.code, retryAt: breaker.retryAt, detail: breaker.reason }, { status: 429 });

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
      const reservation = await reserveCredits(user.id, estimate.reserveCredits, "code_assist", { operation: turn.operation });
      if (!reservation.ok) return NextResponse.json({ error: "reserve_failed", detail: reservation.reason }, { status: 402 });
      reservationId = reservation.reservationId;
    }

    // THE HOUSE STYLE, remembered — V6 #2. One predicate decides whether
    // this feature participates at all (lib/memory/memory-policy.ts); a
    // surface that is not read is not written either.
    //
    // IT IS A SECOND SYSTEM BLOCK, NOT APPENDED TO THE FIRST. Concatenating
    // it into prompt.system would change the static prefix per user and
    // destroy the cache hit for the prompt itself — which is the expensive
    // half. As its own block it sits after a prefix that stays
    // byte-identical, which is what Anthropic matches on.
    const memoryBlock = memoryActiveFor({
      surface: "coding",
      user,
      planLimit: memoryWindowFor(plan?.capabilities.chatMemoryLimit ?? 0, isAdmin),
    })
      ? await memoryPromptFor(supabase, user.id, memoryWindowFor(plan?.capabilities.chatMemoryLimit ?? 0, isAdmin))
      : "";
    const costs = new CostAccumulator();
    const outcome = await runCompletion(
      {
        purpose: "create",
        model: MODEL,
        maxTokens: spec.maxTokens,
        system: memoryBlock
          ? [
              { type: "text", text: prompt.system },
              { type: "text", text: memoryBlock },
            ]
          : [{ type: "text", text: prompt.system }],
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
      logApiError("/api/coding/run", new Error(outcome.detail), { operation: turn.operation, kind: outcome.kind });
      // The FAILED row is still written, because a run that cost the user
      // a wait and produced nothing is a thing they should be able to see
      // in their history rather than an event that never happened.
      const { error: failError } = await admin.from("code_sessions").insert({
        user_id: user.id,
        operation: turn.operation,
        title: deriveTitle({ operation: turn.operation, input: storedInput }),
        input: storedInput,
        language: turn.language,
        target_language: turn.targetLanguage,
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
        operation: turn.operation,
        workspaceModules: workspace.facts.length,
        chatTurnsUsed: chatContext.selection.chosen.length,
      },
    });

    const { data: row, error: saveError } = await admin
      .from("code_sessions")
      .insert({
        user_id: user.id,
        operation: turn.operation,
        title: deriveTitle({ operation: turn.operation, input: storedInput }),
        input: storedInput,
        language: turn.language,
        target_language: turn.targetLanguage,
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
      // True only for the generate-based edit path (operations.ts,
      // planTurn): the panel diffs this against the code it already had.
      isEdit: turn.isEdit,
      resultLanguage: turn.targetLanguage ?? turn.language ?? null,
      creditsCharged: settlement.creditsCharged,
      // So the panel can say what it read on the user's behalf, rather
      // than silently reading their modules and conversation.
      workspaceModulesUsed: workspace.facts.length,
      chatTurnsUsed: chatContext.selection.chosen.length,
    });
  } catch (err) {
    logApiError("/api/coding/run", err);
    return NextResponse.json({ error: "run_failed" }, { status: 500 });
  }
}
