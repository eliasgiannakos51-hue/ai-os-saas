import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { generateDeleteAccountToken, DELETE_ACCOUNT_TOKEN_TTL_MS } from "@/lib/delete-account-token";
import { sendDeleteAccountConfirmationEmail } from "@/lib/email/send-delete-account-confirmation-email";
import { logApiError } from "@/lib/log-error";
import { checkRateLimit } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

const DELETE_REQUEST_MAX_ATTEMPTS = 3;
const DELETE_REQUEST_WINDOW_MINUTES = 60;

// Step 1 of account deletion: does NOT delete anything. Generates a
// short-lived token, stores its hash, and emails a confirmation link. The
// account is only actually deleted when that link is opened and confirmed
// via /api/delete-account/confirm.
export async function POST() {
  try {
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user || !user.email) {
      return NextResponse.json({ ok: false, error: "Not authenticated." }, { status: 401 });
    }

    // By user id, not IP — bounds how many deletion-confirmation emails a
    // single account can be sent (email-bombing an inbox), same rationale
    // as api/signup/api/checkout's rate limits, just scoped to "self"
    // since this route is always authenticated.
    const { allowed } = await checkRateLimit({
      scope: "delete_account_request",
      identifier: user.id,
      maxAttempts: DELETE_REQUEST_MAX_ATTEMPTS,
      windowMinutes: DELETE_REQUEST_WINDOW_MINUTES,
    });
    if (!allowed) {
      return NextResponse.json(
        { ok: false, error: "Too many attempts. Please try again later." },
        { status: 429 }
      );
    }

    const { token, tokenHash } = generateDeleteAccountToken();
    const expiresAt = new Date(Date.now() + DELETE_ACCOUNT_TOKEN_TTL_MS).toISOString();

    const admin = createAdminClient();
    const { error: insertError } = await admin.from("account_deletion_requests").insert({
      user_id: user.id,
      token_hash: tokenHash,
      expires_at: expiresAt,
    });

    if (insertError) {
      logApiError("/api/delete-account/request", insertError);
      return NextResponse.json(
        { ok: false, error: "Could not start account deletion. Please try again." },
        { status: 500 }
      );
    }

    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000";
    const confirmUrl = `${siteUrl}/delete-account/confirm?token=${token}`;

    const { ok: emailOk } = await sendDeleteAccountConfirmationEmail(user.email, confirmUrl);
    if (!emailOk) {
      return NextResponse.json(
        { ok: false, error: "Could not send the confirmation email. Please try again." },
        { status: 500 }
      );
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    logApiError("/api/delete-account/request", err);
    return NextResponse.json(
      { ok: false, error: "Something went wrong. Please try again." },
      { status: 500 }
    );
  }
}
