import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getLocale } from "next-intl/server";
import { memoryPromptFor } from "@/lib/memory/store";
import { memoryActiveFor } from "@/lib/memory/memory-policy";
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
import { resolveLanguage } from "@/lib/text/resolve-language";
import { buildTurnPrompt, buildEditPrompt, deriveConversationTitle } from "@/lib/coding/coding-prompt";
import { parseReply, reduceFiles, isValidFilePath, type ParsedFile } from "@/lib/coding/file-blocks";
import { modelTextFrom, truncationNotice } from "@/lib/verification/truncation";

export const dynamic = "force-dynamic";
export const maxDuration = 120; // @function-limit 120

const MODEL = "claude-sonnet-4-6";

/**
 * ONE TURN OF A CODING CONVERSATION (owner, 2026-10-18), replacing the
 * five fixed operations of lib/coding/operations.ts's own route
 * (api/coding/run, now removed — its history stays in code_sessions,
 * read read-only alongside the conversations this writes).
 *
 * `{ conversationId, text, editPath? }`. No conversationId starts a new
 * conversation. `editPath` is «πατάω ένα κουτί, γράφω μια αλλαγή,
 * αλλάζει μόνο αυτό» — the request is scoped to exactly that one file's
 * current content, through buildEditPrompt rather than buildTurnPrompt,
 * and the MERGE below is what actually guarantees only that path
 * changes: it keeps every file the model's reply did not mention,
 * whatever the model's reply itself claims.
 *
 * code_conversations / code_messages are RLS-scoped exactly like
 * chat_conversations / chat_messages (not server-written-only, unlike
 * code_sessions before it): `credits_charged` here is history the
 * server itself already settled through the reservations system before
 * this insert runs, so a row a client forged would mislead only that
 * account's own view of its own spend, not move real credits — the
 * same risk chat_messages already accepts, not the kind
 * server-written-tables.dbtest.mjs exists for (a forged insert that
 * grants real access, storage or a real publish).
 */
export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ ok: false, code: "not_signed_in" }, { status: 401 });

  try {
    const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
    if (!body || typeof body !== "object") return NextResponse.json({ ok: false, code: "bad_request" }, { status: 400 });

    const text = typeof body.text === "string" ? body.text : "";
    const conversationId = typeof body.conversationId === "string" && body.conversationId ? body.conversationId : null;
    const editPath = typeof body.editPath === "string" && body.editPath ? body.editPath : null;

    // THE CONVERSATION THIS TURN BELONGS TO, loaded before the prompt is
    // built: a scoped edit needs the CURRENT content of editPath, and a
    // plain turn needs the current file set either way.
    let turns: { files: ParsedFile[] | null }[] = [];
    let existingTitle: string | null = null;
    if (conversationId) {
      const { data: conv } = await supabase
        .from("code_conversations")
        .select("id, title")
        .eq("id", conversationId)
        .eq("user_id", user.id)
        .maybeSingle();
      if (!conv) return NextResponse.json({ ok: false, code: "not_found" }, { status: 404 });
      existingTitle = conv.title;
      const { data: rows } = await supabase
        .from("code_messages")
        .select("files")
        .eq("conversation_id", conversationId)
        .eq("role", "assistant")
        .order("created_at", { ascending: true });
      turns = (rows ?? []).map((r) => ({ files: (r.files as ParsedFile[] | null) ?? null }));
    }
    const currentFiles = reduceFiles(turns);

    if (editPath) {
      const target = currentFiles.find((f) => f.path === editPath);
      if (!target) return NextResponse.json({ ok: false, code: "file_not_found" }, { status: 400 });
    }

    const locale = await getLocale();
    const replyLanguage = resolveLanguage(text, locale);

    const workspace = await loadWorkspaceContext(supabase, { include: true });
    const chatContext = await loadChatContextForCoding(supabase, text);
    const contextText = [renderWorkspaceContext(workspace), chatContext.text].filter((p) => p.trim() !== "").join("\n\n");

    const prompt = editPath
      ? buildEditPrompt(
          { text, path: editPath, content: currentFiles.find((f) => f.path === editPath)!.content, replyLanguage },
          contextText
        )
      : buildTurnPrompt({ text, files: currentFiles, replyLanguage }, contextText);
    if (!prompt.ok) {
      return NextResponse.json({ ok: false, code: prompt.reason, limit: prompt.limit }, { status: 400 });
    }

    const breaker = await checkAiCallAllowed(user.id, "code_assist", fingerprintRequest(editPath ?? "turn", text));
    // THE CODE AND THE INSTANT IT OPENS AGAIN, PASSED THROUGH AS-IS —
    // never a flat "rate_limited" string. limit-texts.test.mjs holds
    // every AI-calling route to this because lib/errors/use-error-text.ts's
    // useLimitText() reads breaker.code to say WHICH limit and WHEN, on
    // the reader's own clock; a route that renames it to one generic
    // code is a route whose refusal reads as "wait a minute" forever.
    if (!breaker.allowed) return NextResponse.json({ ok: false, code: breaker.code, retryAt: breaker.retryAt, detail: breaker.reason }, { status: 429 });

    const isAdmin = isAdminEmail(user.email);
    const isBeta = await hasActiveBetaBypass(user);
    const bypass = isAdmin || isBeta;
    if (bypass) {
      const ceiling = await checkBypassCeiling(user.id, isAdmin, isBeta);
      if (!ceiling.allowed) return NextResponse.json({ ok: false, code: "bypass_ceiling", detail: ceiling.reason }, { status: 429 });
    }

    const plan = await resolveEffectivePlan(user);
    const pricingConfig = resolvePricingConfig();
    const estimate = estimateForAction(
      "codeAssist",
      { model: MODEL, inputChars: prompt.system.length + prompt.user.length, planSlug: plan?.slug ?? null },
      pricingConfig,
      plan ? effectiveCreditPriceEurForAccount(plan, await getPurchasedPackCreditPriceEur(user.id), pricingConfig) : undefined
    );

    let reservationId = "";
    if (!bypass && plan) {
      const enough = await hasEnoughCredits(user.id, estimate.reserveCredits, plan);
      if (!enough.ok) {
        return NextResponse.json({ ok: false, code: "insufficient_credits", detail: insufficientCreditsMessage(enough.remaining, estimate.reserveCredits) }, { status: 402 });
      }
      const reservation = await reserveCredits(user.id, estimate.reserveCredits, "code_assist", { editPath: editPath ?? undefined });
      if (!reservation.ok) return NextResponse.json({ ok: false, code: "reserve_failed", detail: reservation.reason }, { status: 402 });
      reservationId = reservation.reservationId;
    }

    // THE CONVERSATION ROW, created now — before the model answers — so
    // a conversation that errors out still exists to show the failed
    // turn in, exactly as code_sessions used to write a 'failed' row.
    let convId = conversationId;
    if (!convId) {
      const { data: created, error: createErr } = await supabase
        .from("code_conversations")
        .insert({ user_id: user.id, title: deriveConversationTitle(text) })
        .select("id")
        .single();
      if (createErr || !created) {
        if (reservationId) await releaseReservation(user.id, reservationId);
        logApiError("/api/coding/send", createErr ?? new Error("no row"), { stage: "create_conversation" });
        return NextResponse.json({ ok: false, code: "create_failed" }, { status: 500 });
      }
      convId = created.id;
    }

    const { error: userMsgError } = await supabase.from("code_messages").insert({
      conversation_id: convId,
      user_id: user.id,
      role: "user",
      content: text,
    });
    if (userMsgError) logApiError("/api/coding/send", userMsgError, { stage: "save_user_message" });

    const memoryBlock = memoryActiveFor({
      surface: "coding",
      user,
      planLimit: memoryWindowFor(plan?.capabilities.chatMemoryLimit ?? 0, isAdmin),
    })
      ? await memoryPromptFor(supabase, user.id, memoryWindowFor(plan?.capabilities.chatMemoryLimit ?? 0, isAdmin))
      : "";

    const outcome = await runCompletion(
      {
        purpose: "create",
        model: MODEL,
        maxTokens: 8_000,
        system: memoryBlock ? [{ type: "text", text: prompt.system }, { type: "text", text: memoryBlock }] : [{ type: "text", text: prompt.system }],
        messages: [{ role: "user", content: prompt.user }],
      },
      { userId: user.id, signal: request.signal }
    );

    if (!outcome.ok && outcome.kind === "aborted") {
      // Stopped before a result existed — nothing to charge, nothing to
      // record as failed: the person did this. Same as the old route.
      if (reservationId) await releaseReservation(user.id, reservationId);
      return NextResponse.json({ ok: false, code: "stopped" }, { status: 499 });
    }

    if (!outcome.ok) {
      if (reservationId) await releaseReservation(user.id, reservationId);
      logApiError("/api/coding/send", new Error(outcome.detail), { kind: outcome.kind });
      await supabase.from("code_messages").insert({
        conversation_id: convId,
        user_id: user.id,
        role: "assistant",
        status: "failed",
        error: "ai_unavailable",
      });
      return NextResponse.json({ ok: false, code: "ai_unavailable", conversationId: convId }, { status: 503 });
    }

    const costs = new CostAccumulator();
    costs.record("generation", outcome.usage, outcome.reportedModel || outcome.model);
    const settlement = await settleReservation({
      userId: user.id,
      reservationId,
      feature: "code_assist",
      costs,
      plan,
      bypassCharge: bypass,
      metadata: {
        editPath: editPath ?? undefined,
        workspaceModules: workspace.facts.length,
        chatTurnsUsed: chatContext.selection.chosen.length,
      },
    });

    // TRUNCATION, MARKED RATHER THAN SILENTLY SHIPPED. lib/verification/
    // truncation.ts exists because thirty-three of thirty-four call
    // sites that pick a ceiling never looked at whether the model
    // actually finished; this is the thirty-fifth, and it looks. A
    // reply cut mid-file-block still parses (file-blocks.ts's own
    // tests cover the unclosed-block case — its partial text falls
    // back to prose rather than becoming a corrupt file), so the
    // person reads what was produced AND is told, in their own
    // language, that it stopped short rather than finished.
    const { text: modelReplyText, truncated } = modelTextFrom({ text: outcome.text, stopReason: outcome.stopReason });
    const parsed = parseReply(modelReplyText);
    if (truncated) parsed.prose = [parsed.prose, truncationNotice(locale)].filter((p) => p.trim()).join("\n\n");
    // THE MERGE THAT ACTUALLY ENFORCES "ONLY THAT FILE CHANGES". A
    // scoped edit asked the model for exactly one block at exactly
    // `editPath`; this does not trust that it complied — it keeps only
    // the block whose path matches, and drops anything else the model
    // wrote, however reasonable-looking.
    const files = editPath ? parsed.files.filter((f) => f.path === editPath && isValidFilePath(f.path)) : parsed.files;

    const { data: assistantRow, error: saveError } = await supabase
      .from("code_messages")
      .insert({
        conversation_id: convId,
        user_id: user.id,
        role: "assistant",
        content: parsed.prose,
        files: files.length > 0 ? files : null,
        credits_charged: settlement.creditsCharged,
      })
      .select("id, created_at")
      .single();
    if (saveError) logApiError("/api/coding/send", saveError, { stage: "save_assistant_message" });

    await supabase.from("code_conversations").update({ updated_at: new Date().toISOString() }).eq("id", convId);

    return NextResponse.json({
      ok: true,
      conversationId: convId,
      title: existingTitle ?? deriveConversationTitle(text),
      messageId: assistantRow?.id ?? null,
      prose: parsed.prose,
      files,
      creditsCharged: settlement.creditsCharged,
      /** So the panel can say "using 4 of your modules" rather than
       *  leaving the person to wonder what it read — same as the old
       *  route's own response shape. */
      workspaceModulesUsed: workspace.facts.length,
      /** So the panel can say "and 2 turns from your chat". */
      chatTurnsUsed: chatContext.selection.chosen.length,
    });
  } catch (err) {
    logApiError("/api/coding/send", err);
    return NextResponse.json({ ok: false, code: "send_failed" }, { status: 500 });
  }
}
