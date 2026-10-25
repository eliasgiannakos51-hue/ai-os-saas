import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { logApiError } from "@/lib/log-error";
import { isFeatureOn } from "@/lib/flags/flags";
import { checkRateLimit } from "@/lib/rate-limit";
import {
  normalisePairingCode,
  isPairingExpired,
  isDeviceIdle,
  MAX_DEVICES_PER_USER,
} from "@/lib/iowork/pairing";

export const dynamic = "force-dynamic";

type DeviceRow = { id: string; label: string; platform: string; created_at: string; last_seen_at: string };

/**
 * THE ACCOUNT'S SIDE OF iowork (Φάση 1, κομμάτι 2 of the owner's "IOWORK:
 * ΛΕΙΤΟΥΡΓΙΚΟ, ΚΟΜΜΑΤΙ ΚΟΜΜΑΤΙ", 2026-10-25). GET lists the computers this
 * account has connected; POST is the person typing the eight-character
 * code their computer is showing (§3 of docs/IOWORK-SECURITY-PLAN.md).
 *
 * No marker is needed for the admin client below even though POST uses it:
 * this route establishes the session itself with auth.getUser(), and every
 * row it touches is bound to that user's id. The admin client is here only
 * because iowork_pairings deliberately has no RLS policy at all — a
 * pending pairing must not be readable from a browser, not even its
 * owner's, or a code could be harvested before it is typed
 * (supabase/migrations/20261031000000_iowork_devices.sql).
 */
export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ ok: false, code: "not_signed_in" }, { status: 401 });
  if (!(await isFeatureOn("iowork-tool", user))) {
    return NextResponse.json({ ok: false, code: "not_enabled" }, { status: 403 });
  }

  try {
    const { data, error } = await supabase
      .from("iowork_devices")
      .select("id, label, platform, created_at, last_seen_at")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false });
    if (error) throw error;
    const devices = ((data as DeviceRow[] | null) ?? []).map((d) => ({
      ...d,
      // §3's thirty days, decided here rather than in the browser so the
      // screen and the routes cannot disagree about which is still live.
      idle: isDeviceIdle(d.last_seen_at),
    }));
    return NextResponse.json({ ok: true, devices, max: MAX_DEVICES_PER_USER });
  } catch (err) {
    logApiError("/api/iowork/devices", err, { stage: "list" });
    return NextResponse.json({ ok: false, code: "failed" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ ok: false, code: "not_signed_in" }, { status: 401 });
  if (!(await isFeatureOn("iowork-tool", user))) {
    return NextResponse.json({ ok: false, code: "not_enabled" }, { status: 403 });
  }

  const body = await request.json().catch(() => null);
  const code = typeof body?.code === "string" ? normalisePairingCode(body.code) : null;
  if (!code) return NextResponse.json({ ok: false, code: "bad_code" }, { status: 400 });

  // THE ONE DEFENCE THAT MATTERS AGAINST GUESSING. The code is eight
  // characters a person can retype, so its space is 32^8 — large, but not
  // large enough to leave unlimited. Ten tries an hour per account turns
  // the ten-minute window into something nobody can search.
  const { allowed } = await checkRateLimit({
    scope: "iowork_pair_claim",
    identifier: user.id,
    maxAttempts: 10,
    windowMinutes: 60,
  });
  if (!allowed) return NextResponse.json({ ok: false, code: "rateLimited" }, { status: 429 });

  try {
    return await claimPairing(user.id, code);
  } catch (err) {
    logApiError("/api/iowork/devices", err, { stage: "claim" });
    return NextResponse.json({ ok: false, code: "failed" }, { status: 500 });
  }
}

/** Binds one pending pairing to this account. */
async function claimPairing(userId: string, code: string) {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("iowork_pairings")
    .select("id, label, platform, user_id, created_at")
    .eq("code", code)
    .maybeSingle();
  if (error) throw error;

  const pairing = data as { id: string; label: string; platform: string; user_id: string | null; created_at: string } | null;
  // A code already claimed by somebody else answers exactly as a code that
  // never existed. Anything else would tell a guesser which codes are real.
  if (!pairing || pairing.user_id) return NextResponse.json({ ok: false, code: "not_found" }, { status: 404 });
  if (isPairingExpired(pairing.created_at)) {
    return NextResponse.json({ ok: false, code: "expired" }, { status: 410 });
  }

  const { count } = await admin
    .from("iowork_devices")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId);
  if ((count ?? 0) >= MAX_DEVICES_PER_USER) {
    return NextResponse.json({ ok: false, code: "tooMany" }, { status: 409 });
  }

  const { error: claimError } = await admin
    .from("iowork_pairings")
    .update({ user_id: userId, claimed_at: new Date().toISOString() })
    // The null check is the race: two people typing the same code at once
    // must not both claim it, and this makes the second update match no row.
    .eq("id", pairing.id)
    .is("user_id", null);
  if (claimError) throw claimError;

  return NextResponse.json({ ok: true, label: pairing.label, platform: pairing.platform });
}
