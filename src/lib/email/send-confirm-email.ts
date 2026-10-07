import "server-only";
import { createResendClient } from "@/lib/resend";
import { senderAddress } from "@/lib/email/resend-config";
import { confirmEmailHtml } from "@/lib/email/templates";
import { emailTranslator } from "@/lib/email/email-locale";
import { logApiError } from "@/lib/log-error";

/**
 * The confirmation link, in the language the person signed up in
 * (lib/auth/confirm-email.ts says why it is ours and not Supabase's).
 *
 * Returns whether Resend accepted it — the signup route does not fail on
 * false (the account exists, and /verify-email can send it again), but the
 * caller is told rather than left to assume.
 */
export async function sendConfirmEmail(email: string, confirmUrl: string, knownLocale: string): Promise<boolean> {
  // The caller always knows it: the page the person signed up or signed in
  // from, or the account (api/auth/resend-confirmation).
  const locale = knownLocale;
  try {
    const t = emailTranslator(locale);
    const resend = createResendClient();
    const { error } = await resend.emails.send({
      from: senderAddress(),
      to: email,
      subject: t("email.confirm.subject"),
      html: confirmEmailHtml({ email, confirmUrl, locale }),
    });
    if (error) {
      logApiError("email:confirm", error, { stage: "send" });
      return false;
    }
    return true;
  } catch (err) {
    logApiError("email:confirm", err, { stage: "send" });
    return false;
  }
}
