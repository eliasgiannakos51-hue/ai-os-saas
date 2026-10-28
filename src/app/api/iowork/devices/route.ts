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
type PairingPreview = { id: string; label: string; platform: string; user_id: string | null; created_at: string; requester_ip: string | null };
type ClaimAction = "preview" | "confirm" | "cancel";

/**
 * THE ACCOUNT'S SIDE OF iowork (Φάση 1, κομμάτι 2 of the owner's "IOWORK:
 * ΛΕΙΤΟΥΡΓΙΚΟ, ΚΟΜΜΑΤΙ ΚΟΜΜΑΤΙ", 2026-10-25). GET lists the computers this
 * account has connected; POST is the three-step act of typing the
 * eight-character code a computer is showing (§3 of
 * docs/IOWORK-SECURITY-PLAN.md) — see claimPairing below for what changed
 * here on 2026-10-28 and why.
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

const CLAIM_ACTIONS: readonly ClaimAction[] = ["preview", "confirm", "cancel"];

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
  const action = (body as { action?: unknown })?.action;
  if (typeof action !== "string" || !CLAIM_ACTIONS.includes(action as ClaimAction)) {
    return NextResponse.json({ ok: false, code: "bad_action" }, { status: 400 });
  }

  // THE ONE DEFENCE THAT MATTERS AGAINST GUESSING. The code is eight
  // characters a person can retype, so its space is 32^8 — large, but not
  // large enough to leave unlimited. Ten tries an hour per account turns
  // the ten-minute window into something nobody can search. Charged on
  // every action, "cancel" included — it is one more call against the
  // same ceiling, not a free one.
  const { allowed } = await checkRateLimit({
    scope: "iowork_pair_claim",
    identifier: user.id,
    maxAttempts: 10,
    windowMinutes: 60,
  });
  if (!allowed) return NextResponse.json({ ok: false, code: "rateLimited" }, { status: 429 });

  try {
    return await actOnPairing(user.id, code, action as ClaimAction);
  } catch (err) {
    logApiError("/api/iowork/devices", err, { stage: "claim", action });
    return NextResponse.json({ ok: false, code: "failed" }, { status: 500 });
  }
}

/**
 * THREE ACTIONS ON ONE CODE, where there used to be one.
 *
 * WHY THIS CHANGED (found by an independent review, 2026-10-28, before any
 * of this had run in production). The old "type the code, it's connected"
 * was a textbook device-code-phishing hole: api/iowork/pair has no
 * session by design (nothing exists to sign in as yet), so ANYONE could
 * start a pairing, send the eight characters to a real account holder
 * ("your Ionexa computer is showing ABCD-EF23"), and once that person
 * typed it into their own genuine, signed-in session, the attacker — who
 * had held the claim secret the whole time — collected a device token
 * bound to the VICTIM's account from api/iowork/pair/token, email address
 * included. Nothing about the old flow let the victim notice anything was
 * wrong before it was done.
 *
 * "preview" answers with what the code claims to be — a label, a
 * platform, when it was requested, and the address that asked for it —
 * WITHOUT binding anything. "confirm" is the only action that mutates,
 * and only once the browser has shown that preview and the person pressed
 * a second, separate button. "cancel" lets a person who does not
 * recognise the request kill the code immediately rather than leave it
 * live for the rest of its ten minutes. None of this makes the underlying
 * pattern un-phishable — nothing about "read eight characters, type them
 * elsewhere" can be, the same way OAuth's own device-code grant cannot —
 * but it is the real, standard mitigation for the class: show the human
 * what they are approving, in a second, deliberate step, with enough
 * context to notice "that is not me."
 */
async function actOnPairing(userId: string, code: string, action: ClaimAction) {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("iowork_pairings")
    .select("id, label, platform, user_id, created_at, requester_ip")
    .eq("code", code)
    .maybeSingle();
  if (error) throw error;

  // A code somebody else already claimed answers exactly like one that
  // never existed, for every action — telling a guesser which codes are
  // real is the one thing none of these three may ever do.
  const pairing = data as PairingPreview | null;
  if (!pairing || pairing.user_id) return NextResponse.json({ ok: false, code: "not_found" }, { status: 404 });
  if (isPairingExpired(pairing.created_at)) {
    return NextResponse.json({ ok: false, code: "expired" }, { status: 410 });
  }

  if (action === "preview") {
    return NextResponse.json({
      ok: true,
      status: "preview",
      label: pairing.label,
      platform: pairing.platform,
      requestedAt: pairing.created_at,
      requesterIp: pairing.requester_ip,
    });
  }

  if (action === "cancel") {
    // Unclaimed only (the `.is` guard) — a pairing already bound to this
    // or another account is not this call's to touch. Whether or not a
    // row actually matched, the answer is the same: the code is dead to
    // this caller either way, which is all "cancel" promises.
    await admin.from("iowork_pairings").delete().eq("id", pairing.id).is("user_id", null);
    return NextResponse.json({ ok: true, status: "cancelled" });
  }

  // action === "confirm"
  const { count } = await admin
    .from("iowork_devices")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId);
  if ((count ?? 0) >= MAX_DEVICES_PER_USER) {
    return NextResponse.json({ ok: false, code: "tooMany" }, { status: 409 });
  }

  const { data: claimed, error: claimError } = await admin
    .from("iowork_pairings")
    .update({ user_id: userId, claimed_at: new Date().toISOString() })
    // The `.is` null check is the race guard: two people confirming the
    // same code at once must not both win, and this makes the loser's
    // update match no row — checked below via .select(), not assumed from
    // "no error", because Postgres does not error on an update that
    // matched zero rows.
    .eq("id", pairing.id)
    .is("user_id", null)
    .select("id");
  if (claimError) throw claimError;
  if (!claimed || claimed.length === 0) {
    // Lost the race: somebody else's confirm landed first. Answered as
    // "not_found" rather than a fabricated success — the old code
    // returned ok:true here on a zero-row update, telling the loser of a
    // race that their claim had gone through when it had not.
    return NextResponse.json({ ok: false, code: "not_found" }, { status: 404 });
  }

  return NextResponse.json({ ok: true, status: "confirmed", label: pairing.label, platform: pairing.platform });
}
