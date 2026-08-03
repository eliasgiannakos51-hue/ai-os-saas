import "server-only";
import { createResendClient } from "@/lib/resend";
import { stuckGenerationEmailHtml } from "@/lib/email/templates";
import { getSiteUrl } from "@/lib/site-url";
import { logApiError } from "@/lib/log-error";

const FROM_ADDRESS = process.env.RESEND_FROM_EMAIL || "Ionexa AI <onboarding@resend.dev>";

// Sent by api/cron/scheduled-runs's daily "stuck work" detection phase —
// a Website Builder generation/edit that's been pending/processing for
// over 24h. Best-effort, same pattern as every other transactional email
// in this app: never throws, just logs.
export async function sendStuckGenerationEmail({
  email,
  websiteName,
}: {
  email: string;
  websiteName: string;
}): Promise<void> {
  if (!email) return;
  try {
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
    }
  } catch (err) {
    logApiError("email:send-stuck-generation", err, { stage: "unhandled" });
  }
}
