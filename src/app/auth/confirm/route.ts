import { NextResponse } from "next/server";
import type { EmailOtpType } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { safeNextPath } from "@/lib/auth/confirm-email";
import { mergeUserMetadata } from "@/lib/auth/user-metadata";
import { sendWelcomeEmail } from "@/lib/email/send-welcome-email";
import { logApiError } from "@/lib/log-error";

export const dynamic = "force-dynamic";

/**
 * THE LINK IN THE CONFIRMATION MAIL (lib/auth/confirm-email.ts).
 *
 * verifyOtp proves the address and opens the session in one call, on the
 * server, so the cookies are set on this response and the person lands
 * signed in. A link that is used, expired or altered is refused and sent
 * to /verify-email?error=1, where a new one can be asked for.
 *
 * The welcome mail goes here, once: before this point nobody had proved
 * they own the address it would go to.
 */
const ACCEPTED_TYPES: readonly EmailOtpType[] = ["magiclink", "email", "signup"];

export async function GET(request: Request) {
  try {
    return await confirm(request);
  } catch (err) {
    logApiError("/auth/confirm", err);
    return NextResponse.redirect(new URL("/verify-email?error=1", new URL(request.url).origin));
  }
}

async function confirm(request: Request) {
  const url = new URL(request.url);
  const tokenHash = url.searchParams.get("token_hash");
  const type = url.searchParams.get("type") as EmailOtpType | null;
  const next = safeNextPath(url.searchParams.get("next"));

  if (!tokenHash || !type || !ACCEPTED_TYPES.includes(type)) {
    return NextResponse.redirect(new URL("/verify-email?error=1", url.origin));
  }

  const supabase = await createClient();
  const { data, error } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type });
  if (error || !data.user) {
    logApiError("/auth/confirm", error ?? new Error("verifyOtp returned no user"), { stage: "verify" });
    return NextResponse.redirect(new URL("/verify-email?error=1", url.origin));
  }

  const user = data.user;
  if (!user.user_metadata?.welcome_sent_at && user.email) {
    const marked = await mergeUserMetadata(
      user.id,
      { welcome_sent_at: new Date().toISOString() },
      { context: "/auth/confirm" }
    );
    if (marked) {
      await sendWelcomeEmail(user.email, user.id).catch((err) => {
        logApiError("/auth/confirm", err, { stage: "welcome_email" });
      });
    }
  }

  return NextResponse.redirect(new URL(next, url.origin));
}
