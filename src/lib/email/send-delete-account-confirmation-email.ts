import "server-only";
import { createResendClient } from "@/lib/resend";
import { senderAddress } from "@/lib/email/resend-config";
import { deleteAccountConfirmationEmailHtml } from "@/lib/email/templates";
import { logApiError } from "@/lib/log-error";

// The From address, from ONE definition — see lib/email/resend-config.ts.
// This was one of fourteen copies of the same line — the constant AND
// its fallback, repeated per file. The fallback is the half that decides
// whether mail reaches anybody, so it now has one definition.

export async function sendDeleteAccountConfirmationEmail(
  email: string,
  confirmUrl: string
): Promise<{ ok: boolean; error?: unknown }> {
  try {
    const resend = createResendClient();
    const { error } = await resend.emails.send({
      from: senderAddress(),
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
