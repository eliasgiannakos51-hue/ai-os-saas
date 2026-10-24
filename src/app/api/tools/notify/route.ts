import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { logApiError } from "@/lib/log-error";

export const dynamic = "force-dynamic";

const MAX_TOOL_KEY_CHARS = 40;

/**
 * «ΕΙΔΟΠΟΙΗΣΕ ΜΕ ΟΤΑΝ ΑΝΟΙΞΕΙ» (the final All tools grid, §3): the press
 * on a not-ready tile's Coming Soon screen. Stores one row — RLS
 * (insert_own_tool_notify_subscriptions,
 * supabase/migrations/20261028000000_tool_notify_subscriptions.sql)
 * scopes it to the caller, and the unique (user_id, tool_key) constraint
 * makes a second press a no-op rather than a second row.
 *
 * `tool_key` is not checked against lib/nav/all-tools.ts here on
 * purpose: the registry is a browser-loaded module (it imports nothing
 * server-only), and a key that names nothing simply has no subscriber
 * scripts/notify-tool-ready.mjs will ever find — the same shape as a
 * stale href in an old link, not a hole a person could exploit.
 */
export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "not_signed_in" }, { status: 401 });

  const body = await request.json().catch(() => null);
  const tool = typeof body?.tool === "string" ? body.tool.trim() : "";
  if (!tool || tool.length > MAX_TOOL_KEY_CHARS) {
    return NextResponse.json({ error: "bad_tool" }, { status: 400 });
  }

  const { error } = await supabase
    .from("tool_notify_subscriptions")
    .upsert({ user_id: user.id, tool_key: tool }, { onConflict: "user_id,tool_key", ignoreDuplicates: true });
  if (error) {
    logApiError("/api/tools/notify", error, { tool });
    return NextResponse.json({ error: "subscribe_failed" }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}

export async function DELETE(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "not_signed_in" }, { status: 401 });

  const body = await request.json().catch(() => null);
  const tool = typeof body?.tool === "string" ? body.tool.trim() : "";
  if (!tool) return NextResponse.json({ error: "bad_tool" }, { status: 400 });

  const { error } = await supabase.from("tool_notify_subscriptions").delete().eq("user_id", user.id).eq("tool_key", tool);
  if (error) {
    logApiError("/api/tools/notify", error, { tool, stage: "delete" });
    return NextResponse.json({ error: "unsubscribe_failed" }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
