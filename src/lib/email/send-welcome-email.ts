import "server-only";
import { createResendClient } from "@/lib/resend";
import { welcomeEmailHtml } from "@/lib/email/templates";

const FROM_ADDRESS = process.env.RESEND_FROM_EMAIL || "Veron AI <onboarding@resend.dev>";

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
      subject: "welcome to Veron AI",
      html: welcomeEmailHtml({ email }),
    });

    if (error) {
      console.error("sendWelcomeEmail: Resend returned an error", error);
    }
  } catch (err) {
    console.error("sendWelcomeEmail: failed to send", err);
  }
}
