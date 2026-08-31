import "server-only";
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
export async function sendWelcomeEmail(email: string): Promise<void> {
  try {
    const resend = createResendClient();
    const { error } = await resend.emails.send({
      from: senderAddress(),
      to: email,
      subject: "welcome to Ionexa AI",
      html: welcomeEmailHtml({ email }),
    });

    if (error) {
      logApiError("email:send-welcome", error, { stage: "resend_error" });
    }
  } catch (err) {
    logApiError("email:send-welcome", err, { stage: "unhandled" });
  }
}
