import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { checkRateLimit } from "@/lib/rate-limit";
import { confirmLinkFor } from "@/lib/auth/confirm-email";
import { sendConfirmEmail } from "@/lib/email/send-confirm-email";
import { emailLocaleFor } from "@/lib/email/email-locale";
import { logApiError } from "@/lib/log-error";

// generateLink is an admin call; the address it is called with is the
// caller's own, read from their session, never from the request.

export const dynamic = "force-dynamic";

/**
 * A NEW CONFIRMATION LINK, for the signed-in account that has not proved
 * its address yet (src/app/verify-email/page.tsx). Three an hour: the link
 * goes to an inbox somebody else may own, and a button that sends mail on
 * every click is a way to send somebody mail.
 */
export async function POST() {
  try {
    return await resend();
  } catch (err) {
    logApiError("/api/auth/resend-confirmation", err);
    return NextResponse.json({ ok: false, code: "not_sent" }, { status: 503 });
  }
}

async function resend() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user || !user.email) return NextResponse.json({ ok: false, code: "not_signed_in" }, { status: 401 });
  if (user.email_confirmed_at) return NextResponse.json({ ok: true, alreadyConfirmed: true });

  const limit = await checkRateLimit({
    scope: "resend_confirmation",
    identifier: user.id,
    maxAttempts: 3,
    windowMinutes: 60,
  });
  if (!limit.allowed) return NextResponse.json({ ok: false, code: "rate_limited" }, { status: 429 });

  const link = await confirmLinkFor(createAdminClient(), user.email, "/dashboard/overview");
  if (!link) return NextResponse.json({ ok: false, code: "not_sent" }, { status: 503 });
  const sent = await sendConfirmEmail(user.email, link, await emailLocaleFor(user.id));
  return sent
    ? NextResponse.json({ ok: true })
    : NextResponse.json({ ok: false, code: "not_sent" }, { status: 503 });
}
