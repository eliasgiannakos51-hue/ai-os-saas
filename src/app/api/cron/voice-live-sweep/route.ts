import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { checkCronAuth } from "@/lib/cron-auth";
import { logApiError } from "@/lib/log-error";
import { LIVE_GRACE_SECONDS, LIVE_MAX_SESSION_MINUTES } from "@/lib/voice/live-pricing";
import { hangupLiveCall } from "@/lib/voice/live-provider";
import { billLiveMinutes, closeLiveSession, LIVE_SESSION_COLUMNS, type LiveSessionRow } from "@/lib/voice/live-session";

export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";
export const maxDuration = 60; // @function-limit 60

const BATCH = 100;

/**
 * END EVERY LIVE CALL THAT IS OPEN PAST ITS PAID TIME (FS1).
 *
 * A browser that keeps a call open and simply stops asking for the next
 * minute is talking for free, and the server is the only one who can end
 * it: api/voice/live/tick never runs for a browser that does not call it.
 * This does, every five minutes (vercel.json): each row still open whose
 * paid_until is more than the grace behind is hung up at the provider
 * and closed as «swept».
 *
 * AND THE MINUTES IT RAN UNPAID ARE CHARGED, as far as the account can
 * pay for them, through the same function start and tick use — so the
 * gap between two sweeps is not a discount. A charge that fails is
 * logged; the call is ended either way.
 *
 * Auth: CRON_SECRET, fail-closed, same as every other cron route.
 */
export async function GET(request: Request) {
  const auth = checkCronAuth(request);
  if (!auth.ok) return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });

  try {
    const admin = createAdminClient();
    const now = Date.now();
    const cutoff = new Date(now - LIVE_GRACE_SECONDS * 1000).toISOString();
    const { data, error } = await admin
      .from("voice_live_sessions")
      .select(LIVE_SESSION_COLUMNS)
      .is("ended_at", null)
      .lt("paid_until", cutoff)
      .order("paid_until", { ascending: true })
      .limit(BATCH);
    if (error) throw error;
    const rows = (data ?? []) as LiveSessionRow[];

    let ended = 0;
    let billedMinutes = 0;
    for (const row of rows) {
      const hungUp = await hangupLiveCall(row.call_id);
      const overrunMinutes = Math.min(
        Math.max(0, LIVE_MAX_SESSION_MINUTES - row.minutes_billed),
        Math.ceil((now - new Date(row.paid_until).getTime()) / 60_000)
      );
      if (overrunMinutes > 0) {
        try {
          const { data: found } = await admin.auth.admin.getUserById(row.user_id);
          if (found?.user) {
            const billed = await billLiveMinutes(admin, found.user, overrunMinutes, { callId: row.call_id, swept: true });
            if (billed.ok) billedMinutes += overrunMinutes;
            else logApiError("/api/cron/voice-live-sweep", new Error(`overrun not charged: ${billed.code}`), { sessionId: row.id });
          }
        } catch (err) {
          logApiError("/api/cron/voice-live-sweep", err, { stage: "bill_overrun", sessionId: row.id });
        }
      }
      // Closed even when the hang-up did not confirm: a row left open
      // would be billed again by the next sweep for a call that is, at
      // the provider's own one-hour ceiling, already over.
      await closeLiveSession(admin, row.id, "swept");
      if (hungUp) ended += 1;
    }

    return NextResponse.json({ ok: true, found: rows.length, ended, billedMinutes });
  } catch (err) {
    logApiError("/api/cron/voice-live-sweep", err);
    return NextResponse.json({ ok: false, error: "Sweep failed." }, { status: 500 });
  }
}
