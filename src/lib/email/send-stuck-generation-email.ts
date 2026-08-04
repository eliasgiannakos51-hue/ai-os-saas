import "server-only";
import { createResendClient } from "@/lib/resend";
import { stuckGenerationEmailHtml } from "@/lib/email/templates";
import { getSiteUrl } from "@/lib/site-url";
import { logApiError } from "@/lib/log-error";
import { checkEmailAllowed, recordEmailSend } from "@/lib/email/email-gate";

const FROM_ADDRESS = process.env.RESEND_FROM_EMAIL || "Ionexa AI <onboarding@resend.dev>";

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

    const resend = createResendClient();
    const { error } = await resend.emails.send({
      from: FROM_ADDRESS,
      to: email,
      subject: `"${websiteName}" seems stuck — Ionexa AI`,
      html: stuckGenerationEmailHtml({
        websiteName,
        dashboardUrl: `${getSiteUrl()}/dashboard/website-builder`,
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
