import "server-only";
import { createResendClient } from "@/lib/resend";
import { deleteAccountConfirmationEmailHtml } from "@/lib/email/templates";
import { logApiError } from "@/lib/log-error";

const FROM_ADDRESS = process.env.RESEND_FROM_EMAIL || "Ionexa AI <onboarding@resend.dev>";

export async function sendDeleteAccountConfirmationEmail(
  email: string,
  confirmUrl: string
): Promise<{ ok: boolean; error?: unknown }> {
  try {
    const resend = createResendClient();
    const { error } = await resend.emails.send({
      from: FROM_ADDRESS,
      to: email,
      subject: "confirm account deletion — Ionexa AI",
      html: deleteAccountConfirmationEmailHtml({ email, confirmUrl }),
    });

    if (error) {
      logApiError("email:send-delete-account-confirmation", error, { stage: "resend_error" });
      return { ok: false, error };
    }
    return { ok: true };
  } catch (err) {
    logApiError("email:send-delete-account-confirmation", err, { stage: "unhandled" });
    return { ok: false, error: err };
  }
}
