import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { isAdminEmail } from "@/lib/auth/admin-emails";
import { checkRateLimit } from "@/lib/rate-limit";
import { sendOwnerAlert } from "@/lib/email/owner-alert";
import { logApiError } from "@/lib/log-error";

export const dynamic = "force-dynamic";

/**
 * "DO MY ALERTS REACH ME?" — ONE PRESS (docs/SECURITY-AUDIT.md ΑΣ-8.5).
 *
 * Sends one test email through lib/email/owner-alert.ts, the same path the
 * error, cost, margin and failed-sign-in alerts take, to the same
 * ADMIN_EMAILS, from the same sender — and answers with what Resend
 * answered. Nothing in the request chooses a recipient: the body is not
 * read at all.
 *
 * Owner-only, and a 404 to anyone else, as the page it sits on. At most
 * five an hour per owner, so a stuck button cannot become a mailbox full
 * of tests.
 */
export async function POST() {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ ok: false }, { status: 401 });
    if (!isAdminEmail(user.email)) return NextResponse.json({ ok: false }, { status: 404 });

    const limited = await checkRateLimit({ scope: "owner_test_alert", identifier: user.id, maxAttempts: 5, windowMinutes: 60 });
    if (!limited.allowed) return NextResponse.json({ ok: false, code: "rate_limited" }, { status: 429 });

    const outcome = await sendOwnerAlert("test-alert", {
      subject: "[Ionexa] Test alert — your alerts reach you",
      html: `
        <div style="font-family:system-ui,-apple-system,sans-serif;max-width:560px">
          <h2 style="margin:0 0 4px">Test alert</h2>
          <p style="margin:0 0 16px">Sent from System Health. Error, cost, margin and failed sign-in alerts are sent the same way, to the same addresses.</p>
        </div>`,
    });
    if (outcome.ok) return NextResponse.json({ ok: true, recipients: outcome.recipients });
    const status = outcome.reason === "refused" ? 502 : outcome.reason === "not_configured" ? 503 : 409;
    return NextResponse.json(
      { ok: false, code: outcome.reason, detail: outcome.reason === "refused" ? outcome.detail : undefined },
      { status }
    );
  } catch (err) {
    // sendOwnerAlert never throws; what can is the session read or the
    // rate limit's database call. Logged like any route's failure, and the
    // panel says "not sent, try again".
    logApiError("/api/system-health/test-alert", err, { stage: "unhandled" });
    return NextResponse.json({ ok: false, code: "failed" }, { status: 500 });
  }
}
