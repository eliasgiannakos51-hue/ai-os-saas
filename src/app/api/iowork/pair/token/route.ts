import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { logApiError } from "@/lib/log-error";
import { getClientIp } from "@/lib/get-client-ip";
import { checkRateLimit } from "@/lib/rate-limit";
import { readFlagAudiences } from "@/lib/flags/flags";
import { newSecret, hashSecret, isPairingExpired, MAX_DEVICES_PER_USER } from "@/lib/iowork/pairing";

export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

type PairingRow = {
  id: string;
  user_id: string | null;
  label: string;
  platform: string;
  claimed_at: string | null;
  collected_at: string | null;
  created_at: string;
};

// @service-role-justified token-auth
//
// THE SECOND HALF OF PAIRING (§3 of docs/IOWORK-SECURITY-PLAN.md). The app
// asks, every PAIR_POLL_SECONDS, whether the person has typed its code into
// ionexa.ai yet. The answer is "waiting" until they have, and exactly once
// after that it is the device token.
//
// THE CLAIM SECRET IS THE AUTHORISATION, and it is looked up as a hash
// rather than compared in this process. That is the standard shape for an
// API token and it is deliberate here: the stored column is a digest, the
// lookup is an indexed equality on that digest, and the value presented is
// 32 bytes from randomBytes. There is no dictionary to walk and no partial
// match to time.
//
// THE ANSWER CARRIES THE ACCOUNT'S EMAIL, on purpose. The one attack the
// eight-character code cannot prevent is somebody reading it off the screen
// and claiming the pairing to THEIR account; the app then shows whose
// account it joined, and a person who sees a name that is not theirs
// disconnects on the spot. A pairing that announced nothing would make that
// attack silent.
export async function POST(request: Request) {
  try {
    // Same kill switch as api/iowork/pair, same reason: this route has no
    // user either, so the owner's flag has to be read directly or the
    // "staff only" promise is false for exactly the two routes nobody
    // signs in to call.
    const audiences = await readFlagAudiences();
    if (audiences["iowork-tool"] === "off") {
      return NextResponse.json({ ok: false, code: "not_enabled" }, { status: 403 });
    }

    const body = await request.json().catch(() => ({}));
    const claimSecret = (body as { claimSecret?: unknown }).claimSecret;
    if (typeof claimSecret !== "string" || claimSecret.length < 16) {
      return NextResponse.json({ ok: false, code: "bad_secret" }, { status: 400 });
    }

    // The app polls this, so the ceiling is well above honest use (a ten
    // minute pairing at ten seconds a poll is sixty calls) and only stops a
    // caller hammering it. The secret's own entropy is what stops guessing;
    // this is about load.
    const { allowed } = await checkRateLimit({
      scope: "iowork_pair_token",
      identifier: getClientIp(request),
      maxAttempts: 180,
      windowMinutes: 60,
    });
    if (!allowed) {
      return NextResponse.json({ ok: false, code: "rateLimited" }, { status: 429 });
    }

    const admin = createAdminClient();
    const { data, error } = await admin
      .from("iowork_pairings")
      .select("id, user_id, label, platform, claimed_at, collected_at, created_at")
      .eq("claim_secret_hash", hashSecret(claimSecret))
      .maybeSingle();

    if (error) {
      logApiError("/api/iowork/pair/token", error, { stage: "lookup" });
      return NextResponse.json({ ok: false, code: "failed" }, { status: 500 });
    }
    const pairing = data as PairingRow | null;
    if (!pairing) return NextResponse.json({ ok: false, code: "not_found" }, { status: 404 });

    if (isPairingExpired(pairing.created_at)) {
      // Gone, and gone from the table too: an expired pairing that lingers
      // is a code still occupying the unique index for no reason.
      await admin.from("iowork_pairings").delete().eq("id", pairing.id);
      return NextResponse.json({ ok: false, code: "expired" }, { status: 410 });
    }
    if (pairing.collected_at) {
      return NextResponse.json({ ok: false, code: "already_used" }, { status: 409 });
    }
    if (!pairing.claimed_at || !pairing.user_id) {
      // The normal answer for most of a pairing's life.
      return NextResponse.json({ ok: true, status: "waiting" });
    }

    return await mintDevice(admin, pairing);
  } catch (err) {
    logApiError("/api/iowork/pair/token", err, { stage: "collect" });
    return NextResponse.json({ ok: false, code: "failed" }, { status: 500 });
  }
}

/**
 * Turns a claimed pairing into one device row, exactly once — and "exactly
 * once" is enforced BEFORE anything is created, not after.
 *
 * WHAT WAS WRONG HERE (found by an independent review, 2026-10-28, before
 * any of this had run in production). The POST handler's own check of
 * `pairing.collected_at` reads a row fetched moments earlier; two
 * concurrent polls with the SAME claim secret both see it null, both pass,
 * and both used to reach the insert below — minting two device rows and
 * two working tokens from one approval, past MAX_DEVICES_PER_USER, with
 * "disconnect" only ever able to remove one of them. The fix moves the
 * lock to the one statement Postgres can make atomic: an UPDATE with a
 * WHERE that only matches an unclaimed row, read back with .select() so a
 * zero-row result is visible rather than silently looking like success —
 * the same pattern api/iowork/devices/route.ts already used for the
 * user-side claim, just missing here.
 *
 * THE TRADE THIS MAKES: the old comment said marking collected_at LAST let
 * a transient failure here retry. Locking first gives that up — a device-
 * insert failure now burns the pairing, and the person re-pairs with a
 * fresh code. A rare extra re-pair is a far smaller cost than a window two
 * concurrent callers can both walk through.
 */
async function mintDevice(admin: ReturnType<typeof createAdminClient>, pairing: PairingRow) {
  const userId = pairing.user_id as string;
  const { data: claimed, error: collectError } = await admin
    .from("iowork_pairings")
    .update({ collected_at: new Date().toISOString() })
    .eq("id", pairing.id)
    .is("collected_at", null)
    .select("id");
  if (collectError) throw collectError;
  if (!claimed || claimed.length === 0) {
    // Lost the race, or genuinely already used — the caller cannot tell
    // the difference and does not need to.
    return NextResponse.json({ ok: false, code: "already_used" }, { status: 409 });
  }

  // THE ONLY CALLER THAT CAN EVER REACH HERE FOR THIS PAIRING holds the
  // lock now. A second, different pairing for the same account racing
  // THIS count check is a real but much narrower gap — a soft cap the
  // person can self-correct by disconnecting one, not a security boundary
  // — and is not closed by this change.
  const { count } = await admin
    .from("iowork_devices")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId);
  if ((count ?? 0) >= MAX_DEVICES_PER_USER) {
    return NextResponse.json({ ok: false, code: "too_many_devices" }, { status: 409 });
  }

  const token = newSecret();
  const { data: device, error: insertError } = await admin
    .from("iowork_devices")
    .insert({ user_id: userId, label: pairing.label, platform: pairing.platform, token_hash: hashSecret(token) })
    .select("id")
    .single();
  if (insertError || !device) {
    logApiError("/api/iowork/pair/token", insertError, { stage: "device_insert" });
    return NextResponse.json({ ok: false, code: "not_finished" }, { status: 500 });
  }

  const { data: account } = await admin.auth.admin.getUserById(userId);
  return NextResponse.json({
    ok: true,
    status: "paired",
    token,
    deviceId: device.id,
    label: pairing.label,
    account: account?.user?.email ?? null,
  });
}
