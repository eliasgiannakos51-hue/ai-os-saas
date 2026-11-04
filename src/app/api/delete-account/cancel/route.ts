import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { cancelDeletion } from "@/lib/account/pending-deletion";
import { logApiError } from "@/lib/log-error";
import { checkRateLimit } from "@/lib/rate-limit";
import { getClientIp } from "@/lib/get-client-ip";

// @service-role-justified token-auth — the cancel token from the emailed
// link IS the proof of identity, same pattern as the deletion confirm route.

export const dynamic = "force-dynamic";

const CANCEL_MAX_ATTEMPTS = 10;
const CANCEL_WINDOW_MINUTES = 60;

export async function POST(request: Request) {
  try {
    const ip = getClientIp(request);
    const { allowed } = await checkRateLimit({
      scope: "delete_account_cancel",
      identifier: ip,
      maxAttempts: CANCEL_MAX_ATTEMPTS,
      windowMinutes: CANCEL_WINDOW_MINUTES,
    });
    if (!allowed) {
      return NextResponse.json(
        { ok: false, error: "Too many attempts. Please try again later." },
        { status: 429 },
      );
    }

    let token: string;
    try {
      const body = await request.json();
      token = typeof body?.token === "string" ? body.token : "";
    } catch {
      return NextResponse.json(
        { ok: false, error: "Invalid request." },
        { status: 400 },
      );
    }

    if (!token) {
      return NextResponse.json(
        { ok: false, error: "Missing token." },
        { status: 400 },
      );
    }

    // The link stops the ACCOUNT's deletion — every open row of the person
    // it was sent to, not only its own (lib/account/pending-deletion.ts).
    const admin = createAdminClient();
    const result = await cancelDeletion(admin, token);

    if (!result) {
      return NextResponse.json(
        { ok: false, error: "This link is invalid, already used, or the deletion was already executed." },
        { status: 400 },
      );
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    logApiError("/api/delete-account/cancel", err);
    return NextResponse.json(
      { ok: false, error: "Something went wrong. Please try again." },
      { status: 500 },
    );
  }
}
