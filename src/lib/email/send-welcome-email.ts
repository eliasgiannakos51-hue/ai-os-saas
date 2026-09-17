import "server-only";
import { emailLocaleFor } from "@/lib/email/email-locale";
import { createResendClient } from "@/lib/resend";
import { senderAddress } from "@/lib/email/resend-config";
import { welcomeEmailHtml } from "@/lib/email/templates";
import { logApiError } from "@/lib/log-error";

// The From address, from ONE definition — see lib/email/resend-config.ts.
// This was one of fourteen copies of the same line — the constant AND
// its fallback, repeated per file. The fallback is the half that decides
// whether mail reaches anybody, so it now has one definition.

// Best-effort — never throws. Signup must succeed even if the email fails
// to send (missing/invalid RESEND_API_KEY, Resend outage, unverified
// sending domain, etc.), so failures are logged and swallowed here rather
// than surfaced to the caller.
/**
 * `locale` is passed directly when the caller already knows it, which at
 * SIGNUP is the only way: the account was created a second ago and has no
 * preferred_locale on it yet. The page they signed up from does know —
 * it is the NEXT_LOCALE cookie i18n/request.ts reads — so the route hands
 * it over rather than looking up a field that is still empty.
 *
 * Everywhere else there is a userId and the account answers.
 */
export async function sendWelcomeEmail(
  email: string,
  userId?: string | null,
  knownLocale?: string | null
): Promise<void> {
  const locale = knownLocale ?? (await emailLocaleFor(userId));
  try {
    const resend = createResendClient();
    const { error } = await resend.emails.send({
      from: senderAddress(),
      to: email,
      subject: "welcome to Ionexa AI",
      html: welcomeEmailHtml({ email, locale }),
    });

    if (error) {
      logApiError("email:send-welcome", error, { stage: "resend_error" });
    }
  } catch (err) {
    logApiError("email:send-welcome", err, { stage: "unhandled" });
  }
}
