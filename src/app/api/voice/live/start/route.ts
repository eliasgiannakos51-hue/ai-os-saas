import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isAdminEmail } from "@/lib/auth/admin-emails";
import { isFeatureOn } from "@/lib/flags/flags";
import { resolveEffectivePlan } from "@/lib/billing/credits";
import { checkRateLimit } from "@/lib/rate-limit";
import { logApiError } from "@/lib/log-error";
import { loadRecentMemories } from "@/lib/chat/memory";
import { isChatMemoryEnabled, chatMemoryActive } from "@/lib/chat/memory-policy";
import { memoryActiveFor } from "@/lib/memory/memory-policy";
import { memoryWindowFor } from "@/lib/memory/memory-window";
import { languageHint } from "@/lib/voice/voice-config";
import { voiceMinutesForPlan } from "@/lib/voice/voice-pricing";
import { LIVE_MAX_SESSION_MINUTES } from "@/lib/voice/live-pricing";
import { liveInstructions } from "@/lib/voice/live-instructions";
import { hangupLiveCall, liveConfigured, openLiveCall } from "@/lib/voice/live-provider";
import { billLiveMinutes, closeLiveSession, liveRefusalStatus } from "@/lib/voice/live-session";

export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";
export const maxDuration = 60; // @function-limit 60

/** A WebRTC offer for one audio track and one data channel is a few
 *  kilobytes; anything near this is not one. */
const MAX_OFFER_CHARS = 20_000;
const MAX_PERSONA_NAME_LENGTH = 40;

/**
 * START A LIVE CONVERSATION (FS1) — behind the switch "voice-live".
 *
 * The browser sends its WebRTC offer. In this order:
 *
 *   signed in, the switch open to this account, not too many starts
 *   the provider key is set and the plan includes voice
 *   the table is there — read BEFORE anything is charged
 *   the call is opened at the provider, with the real key, the settings
 *     and the instructions set here (lib/voice/live-provider.ts)
 *   the first minute is paid for (lib/voice/live-session.ts)
 *   the row that lets the server end this call later is written
 *   only then does the provider's answer go back to the browser
 *
 * A call whose minute is refused, or whose row cannot be written, is
 * hung up here and its answer is never returned, so it never connects.
 */
export async function POST(request: Request) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ ok: false, code: "unauthenticated", error: "Not authenticated." }, { status: 401 });

    if (!(await isFeatureOn("voice-live", user))) {
      return NextResponse.json({ ok: false, code: "not_found", error: "Not found." }, { status: 404 });
    }

    const limited = await checkRateLimit({
      scope: "voice_live_start",
      identifier: user.id,
      maxAttempts: 12,
      windowMinutes: 60,
    });
    if (!limited.allowed) {
      return NextResponse.json({ ok: false, code: "rate_limited", error: "Too many conversations started in the last hour." }, { status: 429 });
    }

    let offerSdp = "";
    let conversationId: string | null = null;
    let locale: string | undefined;
    try {
      const body = await request.json();
      offerSdp = typeof body?.sdp === "string" ? body.sdp : "";
      conversationId = typeof body?.conversationId === "string" && body.conversationId ? body.conversationId : null;
      locale = languageHint(typeof body?.locale === "string" ? body.locale : null);
    } catch {
      return NextResponse.json({ ok: false, code: "bad_request", error: "Invalid request body." }, { status: 400 });
    }
    if (!offerSdp.startsWith("v=0") || offerSdp.length > MAX_OFFER_CHARS) {
      return NextResponse.json({ ok: false, code: "bad_request", error: "That is not a call offer." }, { status: 400 });
    }

    if (!liveConfigured()) {
      return NextResponse.json(
        { ok: false, code: "not_configured", error: "OPENAI_API_KEY is not set on this deployment." },
        { status: 503 }
      );
    }

    const plan = await resolveEffectivePlan(user);
    if (voiceMinutesForPlan(plan.slug) <= 0) {
      return NextResponse.json({ ok: false, code: "not_included", error: "Voice is not included on this plan." }, { status: 403 });
    }

    // The thread this lands in must be the person's own. Read through
    // their own session, so row level security is what answers.
    if (conversationId) {
      const { data: own } = await supabase.from("chat_conversations").select("id").eq("id", conversationId).maybeSingle();
      if (!own) conversationId = null;
    }

    // ONE CALL AT A TIME, AND THE TABLE IS THERE. A call this account
    // left open — a closed laptop, a second tab — is ended before another
    // starts. The same read is what finds a database the migration was
    // never pasted into, before a cent is taken.
    const admin = createAdminClient();
    const { data: stillOpen, error: openError } = await admin
      .from("voice_live_sessions")
      .select("id, call_id")
      .eq("user_id", user.id)
      .is("ended_at", null)
      .limit(5);
    if (openError) {
      logApiError("/api/voice/live/start", openError, { stage: "read_open" });
      return NextResponse.json(
        { ok: false, code: "not_ready", error: "Live conversation is not set up on this deployment yet." },
        { status: 503 }
      );
    }
    for (const row of stillOpen ?? []) {
      await hangupLiveCall(String(row.call_id));
      await closeLiveSession(admin, String(row.id), "closed");
    }

    // THE SAME MEMORY THE WRITTEN CHAT READS, under the same switches.
    const memoryWindow = memoryWindowFor(plan.capabilities.chatMemoryLimit, isAdminEmail(user.email));
    const memoryActive = chatMemoryActive({
      userEnabled: isChatMemoryEnabled(user) && memoryActiveFor({ surface: "chat", user, planLimit: memoryWindow }),
      planLimit: memoryWindow,
    });
    const memories = memoryActive ? await loadRecentMemories(supabase, user.id, memoryWindow) : [];
    const rawPersonaName = user.user_metadata?.ai_persona_name;
    const personaName =
      plan.capabilities.customAiPersona && typeof rawPersonaName === "string" && rawPersonaName.trim()
        ? rawPersonaName.trim().slice(0, MAX_PERSONA_NAME_LENGTH)
        : "Ionexa";

    const call = await openLiveCall({
      offerSdp,
      instructions: liveInstructions({ personaName, memories }),
      language: locale,
    });
    if (!call.ok) {
      const status = call.failure.kind === "not_configured" ? 503 : 502;
      return NextResponse.json({ ok: false, code: call.failure.kind, error: call.failure.detail }, { status });
    }

    const billed = await billLiveMinutes(admin, user, 1, { callId: call.callId, minute: 1 });
    if (!billed.ok) {
      await hangupLiveCall(call.callId);
      return NextResponse.json(
        { ok: false, code: billed.code, insufficientCredits: billed.code === "insufficient_credits", error: billed.detail ?? "This conversation cannot start." },
        { status: liveRefusalStatus(billed.code) }
      );
    }

    const startedAt = new Date();
    const paidUntil = new Date(startedAt.getTime() + 60_000);
    const { data: row, error: insertError } = await admin
      .from("voice_live_sessions")
      .insert({
        user_id: user.id,
        call_id: call.callId,
        conversation_id: conversationId,
        started_at: startedAt.toISOString(),
        paid_until: paidUntil.toISOString(),
        minutes_billed: 1,
      })
      .select("id")
      .single();
    if (insertError || !row) {
      // A call with no row is a call the sweep cannot find. It ends here.
      await hangupLiveCall(call.callId);
      logApiError("/api/voice/live/start", insertError, { stage: "insert", callId: call.callId });
      return NextResponse.json({ ok: false, code: "failed", error: "The conversation could not be started." }, { status: 500 });
    }

    return NextResponse.json({
      ok: true,
      sdp: call.answerSdp,
      sessionId: row.id,
      paidUntil: paidUntil.toISOString(),
      creditsPerMinute: billed.creditsPerMinute,
      creditsCharged: billed.creditsCharged,
      remainingSeconds: billed.remainingSeconds,
      maxMinutes: LIVE_MAX_SESSION_MINUTES,
    });
  } catch (err) {
    logApiError("/api/voice/live/start", err);
    return NextResponse.json({ ok: false, code: "failed", error: "Something went wrong." }, { status: 500 });
  }
}
