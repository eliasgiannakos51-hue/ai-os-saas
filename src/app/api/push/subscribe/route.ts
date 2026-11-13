import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isPushConfigured, PUSH_TYPES, type PushType } from "@/lib/push/web-push";
import { isAllowedPushEndpoint, isPushKey, MAX_PUSH_SUBSCRIPTIONS_PER_USER } from "@/lib/push/delivery";
import { checkRateLimit } from "@/lib/rate-limit";
import { logApiError } from "@/lib/log-error";

export const dynamic = "force-dynamic";

// Register / update / remove this browser's push subscription.
//
// GET    — the per-type opt-in this browser already has.
// POST   — store (or refresh) the subscription this browser just created.
// PATCH  — change the per-type opt-in for this browser.
// DELETE — the user turned notifications off here.
//
// Writes go through an authenticated route rather than straight from the
// client, because a push endpoint is a CAPABILITY URL — anyone holding it
// can push to that browser — and the route is where we can guarantee the
// row is stamped with the caller's own user_id rather than one supplied
// by the client.
//
// SINCE 2026-11-05 THE ROUTE IS THE ONLY WAY TO WRITE ONE.
// supabase/migrations/20261116000000_push_subscriptions_server_written.sql
// takes INSERT and UPDATE away from the signed-in role, so the checks
// below — a known push service's host (lib/push/delivery.ts), keys of
// the right shape, a rate limit, at most MAX_PUSH_SUBSCRIPTIONS_PER_USER
// rows — cannot be stepped around by writing the table directly. POST and
// PATCH write with the service role, scoped to the caller's id; GET and
// DELETE still go through the caller's own client and its policies.

type SubscriptionBody = {
  endpoint?: unknown;
  keys?: { p256dh?: unknown; auth?: unknown };
};

function readSubscription(body: SubscriptionBody): { endpoint: string; p256dh: string; auth: string } | null {
  const endpoint = body?.endpoint;
  const p256dh = body?.keys?.p256dh;
  const auth = body?.keys?.auth;
  // An endpoint must be a URL minted by a known push service. Rejecting
  // anything else keeps a hostile body from turning the sender into a
  // way to make signed requests to an arbitrary host, and from being
  // retried forever. The sender checks the same list again.
  if (!isAllowedPushEndpoint(endpoint) || !isPushKey(p256dh) || !isPushKey(auth)) return null;
  return { endpoint: endpoint as string, p256dh, auth };
}

/**
 * What this browser's opt-in actually IS.
 *
 * The panel used to open with every toggle drawn ON, because the client
 * initialised its state to all-true and nothing ever asked the server.
 * Someone who turned off low-credit alerts on their laptop saw them
 * switched back on at the next reload — the UI said one thing, the row
 * said another, and the row was what decided whether a notification was
 * sent. A control that misreports its own state is worse than no control.
 */
export async function GET(request: Request) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ ok: false, error: "Not authenticated." }, { status: 401 });

    const endpoint = new URL(request.url).searchParams.get("endpoint") ?? "";
    if (!endpoint) return NextResponse.json({ ok: false, error: "Missing endpoint." }, { status: 400 });

    const { data, error } = await supabase
      .from("push_subscriptions")
      .select(
        "notify_agent_results, notify_mission_reminders, notify_low_credits, notify_collaboration, revoked_at"
      )
      .eq("endpoint", endpoint)
      .eq("user_id", user.id)
      .maybeSingle();

    if (error) {
      logApiError("/api/push/subscribe", error, { stage: "get" });
      return NextResponse.json({ ok: false, error: "Could not read the preferences." }, { status: 500 });
    }
    if (!data) return NextResponse.json({ ok: true, known: false, preferences: null });

    return NextResponse.json({
      ok: true,
      known: true,
      revoked: data.revoked_at !== null,
      preferences: {
        agent_results: data.notify_agent_results !== false,
        mission_reminders: data.notify_mission_reminders !== false,
        low_credits: data.notify_low_credits !== false,
        collaboration: data.notify_collaboration !== false,
      },
    });
  } catch (err) {
    logApiError("/api/push/subscribe", err, { stage: "get_unhandled" });
    return NextResponse.json({ ok: false, error: "Something went wrong." }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    if (!isPushConfigured()) {
      return NextResponse.json({ ok: false, error: "Push notifications are not configured." }, { status: 503 });
    }
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ ok: false, error: "Not authenticated." }, { status: 401 });

    // A browser subscribes once and refreshes now and then; thirty an
    // hour is far above that and far below a loop.
    const limited = await checkRateLimit({ scope: "push_subscribe", identifier: user.id, maxAttempts: 30, windowMinutes: 60 });
    if (!limited.allowed) return NextResponse.json({ ok: false, code: "rate_limited" }, { status: 429 });

    let body: SubscriptionBody;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ ok: false, error: "Invalid request body." }, { status: 400 });
    }
    const sub = readSubscription(body);
    if (!sub) return NextResponse.json({ ok: false, error: "Invalid subscription." }, { status: 400 });

    const admin = createAdminClient();
    // onConflict on endpoint, not on (user, endpoint): a browser that was
    // signed into another account keeps the same endpoint, and the row
    // must move to whoever is signed in now rather than pushing that
    // account's notifications to the new user.
    const { error } = await admin.from("push_subscriptions").upsert(
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

    // AT MOST MAX_PUSH_SUBSCRIPTIONS_PER_USER, THE OLDEST GOING FIRST. The
    // one just written is the newest, so it is never the one removed. A
    // failure here leaves one row too many, which the sender's own limit
    // already bounds; it does not undo the subscription.
    const { data: rows, error: listError } = await admin
      .from("push_subscriptions")
      .select("id")
      .eq("user_id", user.id)
      .order("updated_at", { ascending: false })
      .order("created_at", { ascending: false })
      .range(MAX_PUSH_SUBSCRIPTIONS_PER_USER, MAX_PUSH_SUBSCRIPTIONS_PER_USER + 99);
    if (listError) {
      logApiError("/api/push/subscribe", listError, { stage: "cap_list" });
    } else if (rows && rows.length > 0) {
      const { error: capError } = await admin
        .from("push_subscriptions")
        .delete()
        .eq("user_id", user.id)
        .in("id", rows.map((r) => r.id as string));
      if (capError) logApiError("/api/push/subscribe", capError, { stage: "cap_delete" });
    }
    return NextResponse.json({ ok: true });
  } catch (err) {
    logApiError("/api/push/subscribe", err);
    return NextResponse.json({ ok: false, error: "Something went wrong." }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  try {
    const supabase = await createClient();
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

    // The service role, because the signed-in role cannot update this
    // table any more (see the header); scoped to the caller's own rows,
    // so a stranger's endpoint simply matches nothing.
    const { error } = await createAdminClient()
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
    const supabase = await createClient();
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
