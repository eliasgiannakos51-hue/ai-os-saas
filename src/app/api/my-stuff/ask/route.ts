import { NextResponse } from "next/server";
import { getLocale } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { logApiError } from "@/lib/log-error";
import { modelTextFrom, truncationNotice } from "@/lib/verification/truncation";
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
import { isFeatureOn } from "@/lib/flags/flags";
import { kindsToRead } from "@/lib/my-stuff/classify";
import { loadMyStuffCandidates } from "@/lib/my-stuff/ask-store";
import { buildMyStuffPrompt, citationsFor, renderMyStuffContext, MY_STUFF_MAX_QUESTION_CHARS, type MyStuffCitation } from "@/lib/my-stuff/ask-context";

export const dynamic = "force-dynamic";
export const maxDuration = 60; // @function-limit 60

const MODEL = "claude-sonnet-4-6";
// A short answer about a handful of records, not a report — bounded so a
// run that somehow drifted off-task cannot turn one question into a long
// generation nobody asked for or budgeted.
const MAX_OUTPUT_TOKENS = 700;

type SessionTurn = { role: "user" | "tool"; text: string; citations?: MyStuffCitation[]; createdAt: string };

/**
 * «ΡΩΤΑΣ ΜΕ ΛΟΓΙΑ ΚΑΙ ΑΠΑΝΤΑ ΑΠΟ ΤΑ ΔΕΔΟΜΕΝΑ ΣΟΥ» (the owner's message,
 * 2026-10-22) — READ-ONLY. Nothing here writes to, moves or deletes a row
 * in finance_entries, leads, trades, or any of the other nine kinds'
 * tables (lib/my-stuff/sources.ts) — only this tool's OWN session history
 * (my_stuff_sessions, this route's one write) and the credit ledger every
 * AI route writes to.
 *
 * SAME RESERVE-THEN-SETTLE SHAPE AS CODING (api/coding/run/route.ts) and
 * DATA ANALYSIS'S FOLLOW-UP QUESTION (api/data-analysis/[id]/ask/route.ts):
 * breaker check, bypass/ceiling check, estimate from the real input size,
 * reserve, call, settle on measured usage, release whole on a Stop or a
 * failure. Declared in scripts/tests/billing-coverage.test.mjs's ROUTED
 * table, which is what requires this shape to stay honest as the file
 * changes.
 */
export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "not_signed_in" }, { status: 401 });
  if (!(await isFeatureOn("my-stuff", user))) return NextResponse.json({ error: "not_enabled" }, { status: 404 });

  try {
    const body = (await request.json()) as Record<string, unknown>;
    const question = typeof body.question === "string" ? body.question : "";
    const sessionId = typeof body.sessionId === "string" && body.sessionId ? body.sessionId : null;

    const kinds = kindsToRead(question);
    // THE READ HAPPENS BEFORE THE PROMPT IS BUILT, because the context is
    // part of what is priced — the same ordering api/coding/run keeps for
    // its own workspace read.
    const candidates = await loadMyStuffCandidates(supabase, user.id, kinds);
    const contextText = renderMyStuffContext(candidates);

    const prompt = buildMyStuffPrompt(question, contextText);
    if (!prompt.ok) {
      return NextResponse.json(
        { error: prompt.reason, limit: prompt.reason === "too_long" ? MY_STUFF_MAX_QUESTION_CHARS : undefined },
        { status: 400 }
      );
    }

    const breaker = await checkAiCallAllowed(user.id, "my_stuff_ask", fingerprintRequest("ask", question));
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
      "myStuffAsk",
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
      const reservation = await reserveCredits(user.id, estimate.reserveCredits, "my_stuff_ask", { kinds });
      if (!reservation.ok) return NextResponse.json({ error: "reserve_failed", detail: reservation.reason }, { status: 402 });
      reservationId = reservation.reservationId;
    }

    const costs = new CostAccumulator();
    const outcome = await runCompletion(
      {
        purpose: "file_ask",
        model: MODEL,
        maxTokens: MAX_OUTPUT_TOKENS,
        system: [{ type: "text", text: prompt.system }],
        messages: [{ role: "user", content: prompt.user }],
      },
      { userId: user.id, signal: request.signal }
    );

    if (!outcome.ok && outcome.kind === "aborted") {
      await releaseReservation(user.id, reservationId);
      return NextResponse.json({ error: "stopped" }, { status: 499 });
    }
    if (!outcome.ok) {
      await releaseReservation(user.id, reservationId);
      logApiError("/api/my-stuff/ask", new Error(outcome.detail), { kind: outcome.kind });
      return NextResponse.json({ error: "ai_unavailable" }, { status: 503 });
    }

    costs.record("generation", outcome.usage, outcome.reportedModel || outcome.model);
    const settlement = await settleReservation({
      userId: user.id,
      reservationId,
      feature: "my_stuff_ask",
      costs,
      plan,
      bypassCharge: bypass,
      metadata: { kinds, candidatesRead: candidates.length },
    });

    // modelTextFrom is the router's door onto the rule every deliverable
    // answer in this codebase goes through: a reply cut at MAX_OUTPUT_TOKENS
    // must say so, not read as a finished answer that simply stops short.
    const extracted = modelTextFrom({ text: outcome.text, stopReason: outcome.stopReason });
    const citations = citationsFor(extracted.text, candidates);
    const answerText = extracted.truncated
      ? `${extracted.text}\n\n_${truncationNotice(await getLocale())}_`
      : extracted.text;
    const admin = createAdminClient();
    const nowIso = new Date().toISOString();
    const userTurn: SessionTurn = { role: "user", text: question.trim(), createdAt: nowIso };
    const toolTurn: SessionTurn = { role: "tool", text: answerText, citations, createdAt: nowIso };

    let savedSessionId = sessionId;
    if (sessionId) {
      const { data: existing, error: readErr } = await admin
        .from("my_stuff_sessions")
        .select("id, turns")
        .eq("id", sessionId)
        .eq("user_id", user.id)
        .maybeSingle();
      if (readErr || !existing) {
        savedSessionId = null; // the session is gone; fall through and start a new one
      } else {
        const turns = Array.isArray(existing.turns) ? existing.turns : [];
        const { error: updateErr } = await admin
          .from("my_stuff_sessions")
          .update({ turns: [...turns, userTurn, toolTurn] })
          .eq("id", sessionId)
          .eq("user_id", user.id);
        if (updateErr) logApiError("/api/my-stuff/ask", updateErr, { stage: "append" });
      }
    }
    if (!savedSessionId) {
      const { data: created, error: insertErr } = await admin
        .from("my_stuff_sessions")
        .insert({
          user_id: user.id,
          title: question.trim().slice(0, 120) || "Ερώτηση",
          turns: [userTurn, toolTurn],
        })
        .select("id")
        .single();
      if (insertErr) logApiError("/api/my-stuff/ask", insertErr, { stage: "create" });
      savedSessionId = created?.id ?? null;
    }

    return NextResponse.json({
      ok: true,
      sessionId: savedSessionId,
      answer: answerText,
      citations,
      kindsRead: kinds,
      candidatesRead: candidates.length,
      creditsCharged: settlement.creditsCharged,
    });
  } catch (err) {
    logApiError("/api/my-stuff/ask", err);
    return NextResponse.json({ error: "ask_failed" }, { status: 500 });
  }
}
