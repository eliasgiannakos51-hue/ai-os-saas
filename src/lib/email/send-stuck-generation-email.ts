import "server-only";
import { createResendClient } from "@/lib/resend";
import { senderAddress } from "@/lib/email/resend-config";
import { stuckGenerationEmailHtml } from "@/lib/email/templates";
import { emailLocaleFor, emailTranslator } from "@/lib/email/email-locale";
import { getSiteUrl } from "@/lib/site-url";
import { logApiError } from "@/lib/log-error";
import { checkEmailAllowed, recordEmailSend } from "@/lib/email/email-gate";

// The From address, from ONE definition — see lib/email/resend-config.ts.
// This was one of fourteen copies of the same line — the constant AND
// its fallback, repeated per file. The fallback is the half that decides
// whether mail reaches anybody, so it now has one definition.

// Sent by api/cron/scheduled-runs's daily "stuck work" detection phase —
// a Website Builder generation/edit that's been pending/processing for
// over 24h. Best-effort, same pattern as every other transactional email
// in this app: never throws, just logs.
export async function sendStuckGenerationEmail({
  email,
  userId,
  websiteName,
}: {
  email: string;
  userId: string;
  websiteName: string;
}): Promise<void> {
  if (!email) return;
  try {
    const gate = await checkEmailAllowed(userId, "stuck_generation");
    if (!gate.allowed) return;

    const locale = await emailLocaleFor(userId);
    const t = emailTranslator(locale);

    const resend = createResendClient();
    const { error } = await resend.emails.send({
      from: senderAddress(),
      to: email,
      subject: t("email.stuck.subject", { name: websiteName }),
      html: stuckGenerationEmailHtml({
        websiteName,
        dashboardUrl: `${getSiteUrl()}/dashboard/website-builder`,
        locale,
      }),
    });
    if (error) {
      logApiError("email:send-stuck-generation", error, { stage: "resend_error" });
    } else {
      await recordEmailSend(userId, "stuck_generation");
    }
  } catch (err) {
    logApiError("email:send-stuck-generation", err, { stage: "unhandled" });
  }
}
