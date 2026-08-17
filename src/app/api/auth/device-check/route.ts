import { NextResponse } from "next/server";
import { createHash } from "crypto";
import { createClient } from "@/lib/supabase/server";
import { logApiError } from "@/lib/log-error";
import { parseUserAgent } from "@/lib/parse-user-agent";
import { sendNewDeviceLoginEmail } from "@/lib/email/send-new-device-login-email";
import { getClientIp } from "@/lib/get-client-ip";

export const dynamic = "force-dynamic";

/**
 * The NETWORK an address belongs to, not the address.
 *
 * WHY THE FULL IP WAS WRONG. The fingerprint was
 * sha256(`${ip}|${userAgent}`), so a device got a new identity every time
 * its address changed — and addresses change constantly without the
 * device moving: a mobile carrier rotates its NAT pool between requests, a
 * home router picks up a new DHCP lease overnight, and IPv6 privacy
 * extensions (RFC 4941) deliberately mint a fresh address every few hours.
 *
 * The result reported from a live account is exactly what that predicts:
 * "the same device appears many times in Login Activity for no reason".
 * The dedup was not broken; it was keying on something that is not stable.
 *
 * Worse than the clutter: a "new sign-in" security email fires per NEW
 * row, so the alert that is supposed to mean "somebody else is in your
 * account" arrived every time a phone changed cell. An alert that cries
 * wolf daily is one nobody reads, which is the actual security cost.
 *
 * SO: the /24 for IPv4 and the /48 for IPv6 — the prefix a network is
 * routed as, which survives a lease renewal and a privacy-extension
 * rotation. It still changes when the user is genuinely somewhere else,
 * which is when the alert is worth sending.
 */
function networkOf(ip: string): string {
  const raw = ip.trim();
  if (!raw || raw === "unknown") return "unknown";
  // IPv4-mapped IPv6 ("::ffff:1.2.3.4") is an IPv4 address wearing a hat.
  const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/i.exec(raw);
  const addr = mapped ? mapped[1] : raw;

  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(addr)) {
    return addr.split(".").slice(0, 3).join(".") + ".0/24";
  }
  if (addr.includes(":")) {
    // First three hextets = /48. `::` is expanded first, or "2001:db8::1"
    // and "2001:db8:0:0:0:0:0:1" would be different networks.
    const parts = addr.split("%")[0].split("::");
    const head = parts[0].split(":").filter(Boolean);
    const tail = (parts[1] ?? "").split(":").filter(Boolean);
    const missing = 8 - head.length - tail.length;
    const full = [...head, ...Array(Math.max(missing, 0)).fill("0"), ...tail];
    return full.slice(0, 3).map((h) => h.toLowerCase().replace(/^0+(?=.)/, "")).join(":") + "::/48";
  }
  return addr;
}

function computeFingerprint(ip: string, userAgent: string): string {
  return createHash("sha256").update(`${networkOf(ip)}|${userAgent}`).digest("hex");
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
