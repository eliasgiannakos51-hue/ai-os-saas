import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { hashDeleteAccountToken } from "@/lib/delete-account-token";
import { logApiError } from "@/lib/log-error";
import { checkRateLimit } from "@/lib/rate-limit";
import { getClientIp } from "@/lib/get-client-ip";

export const dynamic = "force-dynamic";

const DELETE_CONFIRM_MAX_ATTEMPTS = 10;
const DELETE_CONFIRM_WINDOW_MINUTES = 60;

// Step 2 of account deletion: the token from the emailed link IS the proof
// of authorization here — deliberately does not require an active session,
// since the link may be opened on a different device/browser than the one
// that requested it (same reasoning as password-reset links). The token
// itself is 256 bits of randomness (see lib/delete-account-token.ts), so
// brute-forcing it is already infeasible — this is defense-in-depth
// against scripted hammering of the endpoint, not a real brute-force gate.
export async function POST(request: Request) {
  try {
    const ip = getClientIp(request);
    const { allowed } = await checkRateLimit({
      scope: "delete_account_confirm",
      identifier: ip,
      maxAttempts: DELETE_CONFIRM_MAX_ATTEMPTS,
      windowMinutes: DELETE_CONFIRM_WINDOW_MINUTES,
    });
    if (!allowed) {
      return NextResponse.json(
        { ok: false, error: "Too many attempts. Please try again later." },
        { status: 429 }
      );
    }

    let token: string;
    try {
      const body = await request.json();
      token = typeof body?.token === "string" ? body.token : "";
    } catch {
      return NextResponse.json({ ok: false, error: "Invalid request." }, { status: 400 });
    }

    if (!token) {
      return NextResponse.json({ ok: false, error: "Missing token." }, { status: 400 });
    }

    const admin = createAdminClient();
    const tokenHash = hashDeleteAccountToken(token);

    // Atomically claim the request: only succeeds once, and only while
    // unexpired — a second click (or a race between two tabs) on the same
    // link can't trigger two deletes.
    const { data: claimed, error: claimError } = await admin
      .from("account_deletion_requests")
      .update({ used_at: new Date().toISOString() })
      .eq("token_hash", tokenHash)
      .is("used_at", null)
      .gt("expires_at", new Date().toISOString())
      .select("user_id")
      .maybeSingle();

    if (claimError) {
      logApiError("/api/delete-account/confirm", claimError);
      return NextResponse.json(
        { ok: false, error: "Something went wrong. Please try again." },
        { status: 500 }
      );
    }

    if (!claimed) {
      return NextResponse.json(
        { ok: false, error: "This link is invalid or has expired." },
        { status: 400 }
      );
    }

    const { error: deleteError } = await admin.auth.admin.deleteUser(claimed.user_id);

    if (deleteError) {
      logApiError("/api/delete-account/confirm", deleteError, { stage: "deleteUser" });
      return NextResponse.json(
        { ok: false, error: "Could not delete the account. Please contact support." },
        { status: 500 }
      );
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    logApiError("/api/delete-account/confirm", err);
    return NextResponse.json(
      { ok: false, error: "Something went wrong. Please try again." },
      { status: 500 }
    );
  }
}
