import "server-only";
import { createResendClient } from "@/lib/resend";
import { welcomeEmailHtml } from "@/lib/email/templates";
import { logApiError } from "@/lib/log-error";

const FROM_ADDRESS = process.env.RESEND_FROM_EMAIL || "Ionexa AI <onboarding@resend.dev>";

// Best-effort — never throws. Signup must succeed even if the email fails
// to send (missing/invalid RESEND_API_KEY, Resend outage, unverified
// sending domain, etc.), so failures are logged and swallowed here rather
// than surfaced to the caller.
export async function sendWelcomeEmail(email: string): Promise<void> {
  try {
    const resend = createResendClient();
    const { error } = await resend.emails.send({
      from: FROM_ADDRESS,
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
