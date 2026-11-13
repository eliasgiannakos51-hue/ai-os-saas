import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { logApiError } from "@/lib/log-error";
import { autoTitleFromMessage } from "@/lib/chat/conversation-title";
import { cleanLiveTurns } from "@/lib/voice/live-pricing";
import { hangupLiveCall } from "@/lib/voice/live-provider";
import { closeLiveSession, LIVE_SESSION_COLUMNS, type LiveSessionRow } from "@/lib/voice/live-session";

export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";
export const maxDuration = 60; // @function-limit 60

/**
 * END A LIVE CONVERSATION, AND KEEP IT AS TEXT (FS1, Κομμάτι 5: «μετά το
 * κλείσιμο όλη η συνομιλία ως κείμενο στο Chat, ο ήχος δεν αποθηκεύεται»).
 *
 * NOT BEHIND THE SWITCH, on purpose: a call that is open when the switch
 * is closed must still be endable, and its words still kept. The row is
 * the authority — no row for this account, nothing happens.
 *
 * The call is hung up from here whatever the browser did, the row is
 * closed, and the turns the browser collected are written to
 * chat_messages through the person's OWN session — the same table, the
 * same columns and the same row level security a typed message goes
 * through. Once: `transcript_saved_at` is claimed with a conditional
 * update first, so a request sent twice writes the conversation once.
 *
 * NO AUDIO EXISTS TO STORE. It went browser to provider and back.
 */
export async function POST(request: Request) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ ok: false, code: "unauthenticated", error: "Not authenticated." }, { status: 401 });

    let sessionId = "";
    let rawTurns: unknown = [];
    try {
      const body = await request.json();
      sessionId = typeof body?.sessionId === "string" ? body.sessionId : "";
      rawTurns = body?.turns;
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

    await hangupLiveCall(row.call_id);
    await closeLiveSession(admin, row.id, "closed");

    const turns = cleanLiveTurns(rawTurns);
    if (turns.length === 0) {
      return NextResponse.json({ ok: true, saved: 0, conversationId: row.conversation_id });
    }

    const { data: claimed, error: claimError } = await admin
      .from("voice_live_sessions")
      .update({ transcript_saved_at: new Date().toISOString() })
      .eq("id", row.id)
      .is("transcript_saved_at", null)
      .select("id");
    if (claimError) throw claimError;
    if (!claimed || claimed.length === 0) {
      return NextResponse.json({ ok: true, saved: 0, alreadySaved: true, conversationId: row.conversation_id });
    }

    let conversationId = row.conversation_id;
    if (conversationId) {
      const { data: own } = await supabase.from("chat_conversations").select("id").eq("id", conversationId).maybeSingle();
      if (!own) conversationId = null;
    }
    if (!conversationId) {
      const firstSaid = turns.find((turn) => turn.role === "user")?.text ?? turns[0].text;
      const { data: created, error: createError } = await supabase
        .from("chat_conversations")
        .insert({ user_id: user.id, title: autoTitleFromMessage(firstSaid) })
        .select("id")
        .single();
      if (createError || !created) {
        logApiError("/api/voice/live/end", createError, { stage: "create_conversation" });
        return NextResponse.json({ ok: false, code: "failed", error: "The conversation could not be kept." }, { status: 500 });
      }
      conversationId = created.id as string;
    }

    const { error: saveError } = await supabase.from("chat_messages").insert(
      turns.map((turn) => ({
        conversation_id: conversationId,
        user_id: user.id,
        role: turn.role,
        content: turn.text,
      }))
    );
    if (saveError) {
      logApiError("/api/voice/live/end", saveError, { stage: "save_messages" });
      return NextResponse.json({ ok: false, code: "failed", error: "The conversation could not be kept." }, { status: 500 });
    }
    await supabase.from("chat_conversations").update({ updated_at: new Date().toISOString() }).eq("id", conversationId);

    return NextResponse.json({ ok: true, saved: turns.length, conversationId });
  } catch (err) {
    logApiError("/api/voice/live/end", err);
    return NextResponse.json({ ok: false, code: "failed", error: "Something went wrong." }, { status: 500 });
  }
}
