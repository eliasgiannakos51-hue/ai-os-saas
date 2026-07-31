import "server-only";
import { createResendClient } from "@/lib/resend";
import { deleteAccountConfirmationEmailHtml } from "@/lib/email/templates";

const FROM_ADDRESS = process.env.RESEND_FROM_EMAIL || "Ionexa AI <onboarding@resend.dev>";

export async function sendDeleteAccountConfirmationEmail(
  email: string,
  confirmUrl: string
): Promise<{ ok: boolean }> {
  try {
    const resend = createResendClient();
    const { error } = await resend.emails.send({
      from: FROM_ADDRESS,
      to: email,
      subject: "confirm account deletion — Ionexa AI",
      html: deleteAccountConfirmationEmailHtml({ email, confirmUrl }),
    });

    if (error) {
      console.error("sendDeleteAccountConfirmationEmail: Resend returned an error", error);
      return { ok: false };
    }
    return { ok: true };
  } catch (err) {
    console.error("sendDeleteAccountConfirmationEmail: failed to send", err);
    return { ok: false };
  }
}
