import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { logApiError } from "@/lib/log-error";
import { listNotifications } from "@/lib/notifications/store";

export const dynamic = "force-dynamic";

/**
 * The bell's contents.
 *
 * Read through the user's OWN client, so RLS decides what is in it. There
 * is no user parameter and no admin client here, which is what makes
 * "show me the notifications" a question that can only ever be asked
 * about oneself.
 */
export async function GET() {
  try {
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ ok: false, error: "Not authenticated." }, { status: 401 });

    const notifications = await listNotifications(supabase);
    return NextResponse.json({
      ok: true,
      notifications,
      unread: notifications.filter((n) => !n.readAt).length,
    });
  } catch (err) {
    // An un-migrated deployment has no table yet. The bell showing
    // nothing is the old behaviour and a perfectly good degradation; a
    // 500 on every dashboard load is not.
    logApiError("/api/notifications", err, {
      hint: "run supabase/migrations/20260814_agent_delivery_channels.sql if user_notifications does not exist yet",
    });
    return NextResponse.json({ ok: true, notifications: [], unread: 0 });
  }
}

/** Marks notifications read. The user's own client does the write, under
 *  the update-own policy — there is no column here worth a service-role
 *  client, and using one would mean a bug could mark anyone's. */
export async function PATCH(request: Request) {
  try {
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ ok: false, error: "Not authenticated." }, { status: 401 });

    let body: { ids?: unknown; all?: unknown };
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ ok: false, error: "Invalid request body." }, { status: 400 });
    }

    const readAt = new Date().toISOString();
    let query = supabase.from("user_notifications").update({ read_at: readAt }).is("read_at", null);
    if (body.all !== true) {
      const ids = Array.isArray(body.ids) ? body.ids.filter((id): id is string => typeof id === "string") : [];
      if (ids.length === 0) return NextResponse.json({ ok: true, updated: 0 });
      query = query.in("id", ids.slice(0, 100));
    }
    // Scoped by RLS, not by a user_id filter written here — but the
    // filter is written anyway, because a policy and a predicate are two
    // independent chances to get this right and only one of them is
    // visible in the query.
    const { data, error } = await query.eq("user_id", user.id).select("id");
    if (error) throw error;
    return NextResponse.json({ ok: true, updated: (data ?? []).length });
  } catch (err) {
    logApiError("/api/notifications", err);
    return NextResponse.json({ ok: false, error: "Something went wrong." }, { status: 500 });
  }
}
