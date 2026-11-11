import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isFeatureOn } from "@/lib/flags/flags";
import { logApiError } from "@/lib/log-error";
import { LIVE_GRACE_SECONDS, liveMayContinue } from "@/lib/voice/live-pricing";
import { hangupLiveCall } from "@/lib/voice/live-provider";
import {
  billLiveMinutes,
  closeLiveSession,
  liveRefusalStatus,
  LIVE_SESSION_COLUMNS,
  type LiveSessionRow,
} from "@/lib/voice/live-session";

export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";
export const maxDuration = 60; // @function-limit 60

/**
 * THE NEXT MINUTE OF A LIVE CONVERSATION (FS1, Κομμάτι 6).
 *
 * The browser asks shortly before its paid time runs out. The minute is
 * CLAIMED first — one conditional update that only succeeds if nobody
 * else has moved `minutes_billed` — and paid for second, so two requests
 * arriving together charge once. A minute that cannot be paid for ends
 * the call from here: the server hangs up, the row is closed, and the
 * answer says why.
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

    let sessionId = "";
    try {
      const body = await request.json();
      sessionId = typeof body?.sessionId === "string" ? body.sessionId : "";
    } catch {
      return NextResponse.json({ ok: false, code: "bad_request", error: "Invalid request body." }, { status: 400 });
    }
    if (!sessionId) return NextResponse.json({ ok: false, code: "bad_request", error: "No conversation named." }, { status: 400 });

    const admin = createAdminClient();
    const { data, error } = await admin
      .from("voice_live_sessions")
      .select(LIVE_SESSION_COLUMNS)
      .eq("id", sessionId)
      .eq("user_id", user.id)
      .maybeSingle();
    if (error) throw error;
    const row = data as LiveSessionRow | null;
    if (!row) return NextResponse.json({ ok: false, code: "not_found", error: "No such conversation." }, { status: 404 });
    if (row.ended_at) {
      return NextResponse.json({ ok: false, code: "ended", ended: true, reason: row.end_reason, error: "This conversation has ended." }, { status: 409 });
    }

    const now = Date.now();
    const paidUntilMs = new Date(row.paid_until).getTime();

    if (!liveMayContinue(row.minutes_billed)) {
      await hangupLiveCall(row.call_id);
      await closeLiveSession(admin, row.id, "cap");
      return NextResponse.json({ ok: false, code: "cap", ended: true, reason: "cap", error: "This conversation reached its longest length." }, { status: 409 });
    }
    if (now > paidUntilMs + LIVE_GRACE_SECONDS * 1000) {
      await hangupLiveCall(row.call_id);
      await closeLiveSession(admin, row.id, "unpaid");
      return NextResponse.json({ ok: false, code: "ended", ended: true, reason: "unpaid", error: "This conversation's paid time ran out." }, { status: 409 });
    }

    const nextPaidUntil = new Date(paidUntilMs + 60_000).toISOString();
    const { data: claimed, error: claimError } = await admin
      .from("voice_live_sessions")
      .update({ minutes_billed: row.minutes_billed + 1, paid_until: nextPaidUntil })
      .eq("id", row.id)
      .eq("minutes_billed", row.minutes_billed)
      .is("ended_at", null)
      .select("id");
    if (claimError) throw claimError;
    if (!claimed || claimed.length === 0) {
      // Somebody else claimed this minute a moment ago. Nothing is
      // charged twice; the browser asks again when it is next due.
      return NextResponse.json({ ok: true, duplicate: true, paidUntil: row.paid_until, minutesBilled: row.minutes_billed });
    }

    const billed = await billLiveMinutes(admin, user, 1, { callId: row.call_id, minute: row.minutes_billed + 1 });
    if (!billed.ok) {
      await hangupLiveCall(row.call_id);
      await closeLiveSession(admin, row.id, "unpaid");
      return NextResponse.json(
        {
          ok: false,
          code: billed.code,
          ended: true,
          reason: "unpaid",
          insufficientCredits: billed.code === "insufficient_credits",
          error: billed.detail ?? "The next minute could not be paid for.",
        },
        { status: liveRefusalStatus(billed.code) }
      );
    }

    return NextResponse.json({
      ok: true,
      paidUntil: nextPaidUntil,
      minutesBilled: row.minutes_billed + 1,
      creditsCharged: billed.creditsCharged,
      remainingSeconds: billed.remainingSeconds,
    });
  } catch (err) {
    logApiError("/api/voice/live/tick", err);
    return NextResponse.json({ ok: false, code: "failed", error: "Something went wrong." }, { status: 500 });
  }
}
