import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { isPushConfigured, PUSH_TYPES, type PushType } from "@/lib/push/web-push";
import { logApiError } from "@/lib/log-error";

export const dynamic = "force-dynamic";

// Register / update / remove this browser's push subscription.
//
// POST   — store (or refresh) the subscription this browser just created.
// PATCH  — change the per-type opt-in for this browser.
// DELETE — the user turned notifications off here.
//
// Writes go through an authenticated route rather than straight from the
// client, because a push endpoint is a CAPABILITY URL — anyone holding it
// can push to that browser — and the route is where we can guarantee the
// row is stamped with the caller's own user_id rather than one supplied
// by the client.

type SubscriptionBody = {
  endpoint?: unknown;
  keys?: { p256dh?: unknown; auth?: unknown };
};

function readSubscription(body: SubscriptionBody): { endpoint: string; p256dh: string; auth: string } | null {
  const endpoint = typeof body?.endpoint === "string" ? body.endpoint : "";
  const p256dh = typeof body?.keys?.p256dh === "string" ? body.keys.p256dh : "";
  const auth = typeof body?.keys?.auth === "string" ? body.keys.auth : "";
  // An endpoint must be an https URL from a push service. Rejecting
  // anything else keeps a malformed or hostile body from being stored and
  // retried forever by the sender.
  if (!endpoint.startsWith("https://") || !p256dh || !auth) return null;
  if (endpoint.length > 2000) return null;
  return { endpoint, p256dh, auth };
}

export async function POST(request: Request) {
  try {
    if (!isPushConfigured()) {
      return NextResponse.json({ ok: false, error: "Push notifications are not configured." }, { status: 503 });
    }
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ ok: false, error: "Not authenticated." }, { status: 401 });

    let body: SubscriptionBody;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ ok: false, error: "Invalid request body." }, { status: 400 });
    }
    const sub = readSubscription(body);
    if (!sub) return NextResponse.json({ ok: false, error: "Invalid subscription." }, { status: 400 });

    // onConflict on endpoint, not on (user, endpoint): a browser that was
    // signed into another account keeps the same endpoint, and the row
    // must move to whoever is signed in now rather than pushing that
    // account's notifications to the new user.
    const { error } = await supabase.from("push_subscriptions").upsert(
      {
        user_id: user.id,
        endpoint: sub.endpoint,
        p256dh: sub.p256dh,
        auth: sub.auth,
        user_agent: request.headers.get("user-agent")?.slice(0, 400) ?? null,
        revoked_at: null,
      },
      { onConflict: "endpoint" }
    );
    if (error) {
      logApiError("/api/push/subscribe", error, { stage: "upsert" });
      return NextResponse.json({ ok: false, error: "Could not save the subscription." }, { status: 500 });
    }
    return NextResponse.json({ ok: true });
  } catch (err) {
    logApiError("/api/push/subscribe", err);
    return NextResponse.json({ ok: false, error: "Something went wrong." }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  try {
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ ok: false, error: "Not authenticated." }, { status: 401 });

    let body: { endpoint?: unknown; type?: unknown; enabled?: unknown };
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ ok: false, error: "Invalid request body." }, { status: 400 });
    }
    const endpoint = typeof body.endpoint === "string" ? body.endpoint : "";
    const type = String(body.type ?? "") as PushType;
    if (!endpoint || !PUSH_TYPES.includes(type) || typeof body.enabled !== "boolean") {
      return NextResponse.json({ ok: false, error: "Invalid preference." }, { status: 400 });
    }

    const column = {
      agent_results: "notify_agent_results",
      mission_reminders: "notify_mission_reminders",
      low_credits: "notify_low_credits",
      collaboration: "notify_collaboration",
    }[type];

    // RLS scopes the update to this user's own rows, so a stranger's
    // endpoint simply matches nothing.
    const { error } = await supabase
      .from("push_subscriptions")
      .update({ [column]: body.enabled })
      .eq("endpoint", endpoint)
      .eq("user_id", user.id);
    if (error) {
      logApiError("/api/push/subscribe", error, { stage: "patch" });
      return NextResponse.json({ ok: false, error: "Could not save the preference." }, { status: 500 });
    }
    return NextResponse.json({ ok: true });
  } catch (err) {
    logApiError("/api/push/subscribe", err, { stage: "patch_unhandled" });
    return NextResponse.json({ ok: false, error: "Something went wrong." }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  try {
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ ok: false, error: "Not authenticated." }, { status: 401 });

    let body: { endpoint?: unknown };
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ ok: false, error: "Invalid request body." }, { status: 400 });
    }
    const endpoint = typeof body.endpoint === "string" ? body.endpoint : "";
    if (!endpoint) return NextResponse.json({ ok: false, error: "Missing endpoint." }, { status: 400 });

    const { error } = await supabase
      .from("push_subscriptions")
      .delete()
      .eq("endpoint", endpoint)
      .eq("user_id", user.id);
    if (error) {
      logApiError("/api/push/subscribe", error, { stage: "delete" });
      return NextResponse.json({ ok: false, error: "Could not remove the subscription." }, { status: 500 });
    }
    return NextResponse.json({ ok: true });
  } catch (err) {
    logApiError("/api/push/subscribe", err, { stage: "delete_unhandled" });
    return NextResponse.json({ ok: false, error: "Something went wrong." }, { status: 500 });
  }
}
