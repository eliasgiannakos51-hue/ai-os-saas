import { NextResponse } from "next/server";
import { createHash } from "crypto";
import { createClient } from "@/lib/supabase/server";
import { logApiError } from "@/lib/log-error";
import { parseUserAgent } from "@/lib/parse-user-agent";
import { sendNewDeviceLoginEmail } from "@/lib/email/send-new-device-login-email";
import { getClientIp } from "@/lib/get-client-ip";
import { checkRateLimit } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

function computeFingerprint(ip: string, userAgent: string): string {
  return createHash("sha256").update(`${ip}|${userAgent}`).digest("hex");
}

// Called once, client-side, right after a successful sign-in — this app's
// login itself goes straight through supabase-js on the client, not a
// server route, so this is the server-side touchpoint for "have we seen
// this device before" and the "new sign-in" security email. Every branch
// here is best-effort: the caller never lets a failure here block login,
// and this route itself never lets an email failure block recording the
// device.
export async function POST(request: Request) {
  try {
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user || !user.email) {
      return NextResponse.json({ ok: false, error: "Not authenticated." }, { status: 401 });
    }

    // A fresh user-agent string per request would otherwise mean a fresh
    // "new device" row and a fresh security email per request — the
    // fingerprint is derived from attacker-controllable headers, so the
    // dedup that normally makes this route quiet cannot be trusted to.
    // Ten distinct devices an hour covers any real household.
    const limited = await checkRateLimit({
      scope: "device_check",
      identifier: user.id,
      maxAttempts: 10,
      windowMinutes: 60,
    });
    if (!limited.allowed) {
      // Best-effort by contract (login never blocks on this route), so a
      // capped call reports ok rather than an error the caller ignores.
      return NextResponse.json({ ok: true, newDevice: false });
    }

    const ipAddress = getClientIp(request);
    const userAgent = request.headers.get("user-agent") ?? "unknown";
    const fingerprint = computeFingerprint(ipAddress, userAgent);
    const nowIso = new Date().toISOString();

    const { data: existing, error: lookupError } = await supabase
      .from("known_devices")
      .select("id")
      .eq("user_id", user.id)
      .eq("device_fingerprint", fingerprint)
      .maybeSingle();

    if (lookupError) {
      logApiError("/api/auth/device-check", lookupError, { stage: "lookup" });
      return NextResponse.json({ ok: false, error: "Could not check device." }, { status: 500 });
    }

    if (existing) {
      const { error: updateError } = await supabase
        .from("known_devices")
        .update({ last_seen: nowIso })
        .eq("id", existing.id);
      if (updateError) {
        logApiError("/api/auth/device-check", updateError, { stage: "touch_last_seen" });
      }
      return NextResponse.json({ ok: true, newDevice: false });
    }

    const { error: insertError } = await supabase.from("known_devices").insert({
      user_id: user.id,
      device_fingerprint: fingerprint,
      user_agent: userAgent,
      ip_address: ipAddress,
      first_seen: nowIso,
      last_seen: nowIso,
    });

    if (insertError) {
      logApiError("/api/auth/device-check", insertError, { stage: "insert" });
      return NextResponse.json({ ok: false, error: "Could not record device." }, { status: 500 });
    }

    const { label } = parseUserAgent(userAgent);
    await sendNewDeviceLoginEmail(user.email, {
      userId: user.id,
      deviceLabel: label,
      ipAddress,
      signedInAt: nowIso,
    });

    return NextResponse.json({ ok: true, newDevice: true });
  } catch (err) {
    logApiError("/api/auth/device-check", err);
    return NextResponse.json(
      { ok: false, error: "Something went wrong." },
      { status: 500 }
    );
  }
}
