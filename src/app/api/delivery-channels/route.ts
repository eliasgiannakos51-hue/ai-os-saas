import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { logApiError } from "@/lib/log-error";
import { checkRateLimit } from "@/lib/rate-limit";
import {
  saveDeliveryChannel,
  listDeliveryChannels,
  deleteDeliveryChannel,
  testDeliveryChannel,
} from "@/lib/agents/delivery-store";
import { isCredentialChannel } from "@/lib/agents/delivery-channels";

export const dynamic = "force-dynamic";

/**
 * The destinations a user has connected for their agents to deliver to.
 *
 * WHAT NEVER CROSSES THIS BOUNDARY: the secret. A Telegram bot token and a
 * Discord webhook URL are both bearer credentials — whoever holds one can
 * speak as that bot or post into that server until it is revoked — so GET
 * answers with a hint ("1234••••wxyz") and never the value. There is no
 * "reveal" endpoint, deliberately: the user has the original where they
 * created it, and an endpoint that can hand a secret back is an endpoint
 * that can hand a secret to whoever borrows a logged-in laptop.
 */
export async function GET() {
  try {
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ ok: false, error: "Not authenticated." }, { status: 401 });

    return NextResponse.json({ ok: true, channels: await listDeliveryChannels(user.id) });
  } catch (err) {
    logApiError("/api/delivery-channels", err);
    return NextResponse.json({ ok: false, error: "Something went wrong." }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ ok: false, error: "Not authenticated." }, { status: 401 });

    // Every save posts a real message to a third party to prove the
    // credential works, so this is rate-limited like any other outbound
    // action. Without it, the endpoint is a way to make our servers post
    // to an attacker-chosen Discord webhook as fast as they can ask.
    const limited = await checkRateLimit({
      scope: "delivery_channel_save",
      identifier: user.id,
      maxAttempts: 10,
      windowMinutes: 60,
    });
    if (!limited.allowed) {
      return NextResponse.json(
        { ok: false, error: "Too many connection attempts in the last hour. Try again shortly." },
        { status: 429 }
      );
    }

    let body: { channel?: unknown; secret?: unknown; chat?: unknown };
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ ok: false, error: "Invalid request body." }, { status: 400 });
    }

    if (!isCredentialChannel(body.channel)) {
      return NextResponse.json({ ok: false, error: "That channel cannot be connected here." }, { status: 400 });
    }
    if (typeof body.secret !== "string") {
      return NextResponse.json({ ok: false, error: "Paste the token or address to connect." }, { status: 400 });
    }

    const saved = await saveDeliveryChannel({
      userId: user.id,
      channel: body.channel,
      secret: body.secret,
      chat: typeof body.chat === "string" ? body.chat : undefined,
    });
    if (!saved.ok) {
      // 400 for something the user can fix, 503 for something only an
      // operator can — a missing encryption key is not a typo.
      return NextResponse.json(
        { ok: false, error: saved.message },
        { status: saved.reason === "not_configured" ? 503 : 400 }
      );
    }
    return NextResponse.json({ ok: true, channel: saved.channel });
  } catch (err) {
    logApiError("/api/delivery-channels", err);
    return NextResponse.json({ ok: false, error: "Something went wrong." }, { status: 500 });
  }
}

/**
 * Send a real test message to an ALREADY-connected channel.
 *
 * Separate verb from POST because it is a different act: POST connects
 * something new, PUT proves something existing still works. A credential
 * can be revoked at any time and nothing tells us — without this, the
 * first sign is an agent result that silently never arrived.
 *
 * Rate-limited on its own scope: it posts to a third party, and a button
 * anyone can hold down is a button that posts to Telegram as fast as it
 * can be clicked.
 */
export async function PUT(request: Request) {
  try {
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ ok: false, error: "Not authenticated." }, { status: 401 });

    const limited = await checkRateLimit({
      scope: "delivery_channel_test",
      identifier: user.id,
      maxAttempts: 10,
      windowMinutes: 60,
    });
    if (!limited.allowed) {
      return NextResponse.json(
        { ok: false, error: "Too many test messages in the last hour. Try again shortly." },
        { status: 429 }
      );
    }

    let body: { channel?: unknown };
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ ok: false, error: "Invalid request body." }, { status: 400 });
    }
    if (!isCredentialChannel(body.channel)) {
      return NextResponse.json({ ok: false, error: "That channel cannot be tested here." }, { status: 400 });
    }

    const result = await testDeliveryChannel(user.id, body.channel);
    if (!result.ok) {
      return NextResponse.json(
        { ok: false, error: result.message },
        { status: result.reason === "not_connected" ? 404 : 400 }
      );
    }
    return NextResponse.json({ ok: true });
  } catch (err) {
    logApiError("/api/delivery-channels", err);
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

    const channel = new URL(request.url).searchParams.get("channel");
    if (!isCredentialChannel(channel)) {
      return NextResponse.json({ ok: false, error: "Unknown channel." }, { status: 400 });
    }
    // The agents pointed at it are deliberately NOT changed. Silently
    // re-routing somebody's results to their inbox because a connection
    // was removed would be a surprise about where their data went; the
    // run instead reports "Telegram is no longer connected", which is
    // true and fixable.
    const removed = await deleteDeliveryChannel(user.id, channel);
    if (!removed) {
      return NextResponse.json({ ok: false, error: "Could not disconnect that channel." }, { status: 500 });
    }
    return NextResponse.json({ ok: true });
  } catch (err) {
    logApiError("/api/delivery-channels", err);
    return NextResponse.json({ ok: false, error: "Something went wrong." }, { status: 500 });
  }
}
