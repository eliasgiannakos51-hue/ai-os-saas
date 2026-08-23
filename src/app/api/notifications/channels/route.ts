import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { logApiError } from "@/lib/log-error";
import { getSiteUrl } from "@/lib/site-url";
import { saveChatTarget, type ChatKind } from "@/lib/notify/preferences";
import { sendTelegram, telegramConfigured } from "@/lib/notify/channels/telegram";
import { checkDiscordWebhook, sendDiscord } from "@/lib/notify/channels/discord";

export const dynamic = "force-dynamic";

/**
 * CONNECTING A CHAT CHANNEL, which is a credential exchange rather than a
 * settings toggle — and is treated like one.
 *
 * A TEST MESSAGE IS SENT BEFORE THE ROW IS MARKED VERIFIED, and the row is
 * only marked verified if it arrived. A stored target that has never been
 * proved is a channel that silently swallows every notification: the user
 * sees "connected", nothing ever arrives, and there is nothing anywhere
 * that says why. Typing a chat id wrong is the ordinary case, not the
 * exotic one.
 *
 * THE USER CANNOT WRITE THIS TABLE. notification_channels grants them
 * select and delete only; the insert happens here, through the service
 * role, after the check above. Without that a user could point our sender
 * at somebody else's Discord channel and use it to post in our name.
 *
 * The stored value is CIPHERTEXT (lib/integrations/crypto.ts) and is never
 * returned by this route, in any response, ever — including the one that
 * lists what is connected, which returns only the kind and the label.
 *
 * EVERY ERROR IS A CODE, NOT A SENTENCE. The rest of this app's API
 * routes return English prose that the client renders verbatim, which is
 * a known gap the i18n gate counts and holds flat: a Greek user reads
 * "Could not connect that channel." in English. There was no reason to
 * add eleven more, because the panel that calls this route already has
 * translated strings for every outcome — so the body carries a stable
 * code the client maps to its own key, and nothing here needs
 * translating at all.
 */
export async function GET() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "not_signed_in" }, { status: 401 });

  const { data, error } = await supabase
    .from("notification_channels")
    // NEVER target_encrypted. There is no screen that needs it and no
    // response it belongs in.
    .select("kind, label, verified_at")
    .eq("user_id", user.id);
  if (error) {
    logApiError("api:notification-channels", error, { stage: "list" });
    return NextResponse.json({ error: "channels_unreadable" }, { status: 500 });
  }

  return NextResponse.json({
    channels: data ?? [],
    // What the SERVER can do, which is not the same as what the user has
    // connected: without TELEGRAM_BOT_TOKEN there is no bot to send with,
    // and the UI must say so rather than offering a field that cannot work.
    telegramAvailable: telegramConfigured(),
  });
}

export async function POST(request: Request) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "not_signed_in" }, { status: 401 });

  try {
    const body = (await request.json()) as { kind?: string; target?: string; label?: string };
    const kind = body.kind === "telegram" || body.kind === "discord" ? (body.kind as ChatKind) : null;
    if (!kind) return NextResponse.json({ error: "unknown_channel" }, { status: 400 });

    const target = typeof body.target === "string" ? body.target.trim() : "";
    if (!target) return NextResponse.json({ error: "empty_target" }, { status: 400 });

    if (kind === "telegram" && !telegramConfigured()) {
      // NAMED, not a generic failure. This one is the operator's job, and
      // a user staring at "could not connect" cannot tell that.
      return NextResponse.json(
        { error: "telegram_not_configured" },
        { status: 503 }
      );
    }
    if (kind === "discord") {
      const check = checkDiscordWebhook(target);
      if (!check.ok) return NextResponse.json({ error: "not_a_discord_webhook", detail: check.reason }, { status: 400 });
    }

    // THE TEST MESSAGE. Sent to the target the user just gave us, before
    // anything is stored as working.
    const site = getSiteUrl();
    const probe = {
      title: "Ionexa is connected",
      body: "You will get your notifications here. You can change which ones in Settings.",
      url: `${site}/dashboard/settings`,
    };
    const result =
      kind === "telegram"
        ? await sendTelegram({ chatId: target, ...probe })
        : await sendDiscord({ webhookUrl: target, ...probe });

    if (!result.ok) {
      return NextResponse.json(
        { error: "test_message_undelivered", detail: result.kind },
        { status: 400 }
      );
    }

    const saved = await saveChatTarget({
      userId: user.id,
      kind,
      target,
      label: typeof body.label === "string" ? body.label : null,
      verified: true,
    });
    if (!saved.ok) return NextResponse.json({ error: saved.reason }, { status: 400 });

    return NextResponse.json({ ok: true, kind });
  } catch (err) {
    logApiError("api:notification-channels", err, { stage: "connect" });
    return NextResponse.json({ error: "connect_failed" }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "not_signed_in" }, { status: 401 });

  try {
    const { searchParams } = new URL(request.url);
    const kind = searchParams.get("kind");
    if (kind !== "telegram" && kind !== "discord") {
      return NextResponse.json({ error: "unknown_channel" }, { status: 400 });
    }

    // Through the ADMIN client but scoped to this user's own row. The
    // table grants the user delete, so the RLS-scoped client would work
    // too; this path exists so disconnecting also clears the preferences
    // that pointed at it, which the user's client may not.
    const admin = createAdminClient();
    const { error } = await admin
      .from("notification_channels")
      .delete()
      .eq("user_id", user.id)
      .eq("kind", kind);
    if (error) throw error;

    return NextResponse.json({ ok: true });
  } catch (err) {
    logApiError("api:notification-channels", err, { stage: "disconnect" });
    return NextResponse.json({ error: "disconnect_failed" }, { status: 500 });
  }
}
