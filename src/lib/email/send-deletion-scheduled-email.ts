import "server-only";
import { createResendClient } from "@/lib/resend";
import { senderAddress } from "@/lib/email/resend-config";
import { deletionScheduledEmailHtml } from "@/lib/email/templates";
import { logApiError } from "@/lib/log-error";
import { emailLocaleFor } from "@/lib/email/email-locale";

export async function sendDeletionScheduledEmail(
  email: string,
  cancelToken: string,
  deleteAfter: string,
  userId?: string | null
): Promise<{ ok: boolean; error?: unknown }> {
  try {
    const locale = await emailLocaleFor(userId);
    const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://ionexa.ai";
    const cancelUrl = `${baseUrl}/delete-account/cancel?token=${encodeURIComponent(cancelToken)}`;
    const resend = createResendClient();
    const { error } = await resend.emails.send({
      from: senderAddress(),
      to: email,
      subject: "account deletion scheduled — Ionexa AI",
      html: deletionScheduledEmailHtml({ cancelUrl, deleteAfter, locale }),
    });

    if (error) {
      logApiError("email:send-deletion-scheduled", error, { stage: "resend_error" });
      return { ok: false, error };
    }
    return { ok: true };
  } catch (err) {
    logApiError("email:send-deletion-scheduled", err, { stage: "unhandled" });
    return { ok: false, error: err };
  }
}
