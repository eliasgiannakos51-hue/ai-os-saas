import "server-only";
import { createResendClient } from "@/lib/resend";
import { badgeExpiringEmailHtml } from "@/lib/email/templates";
import { getSiteUrl } from "@/lib/site-url";
import { logApiError } from "@/lib/log-error";
import { checkEmailAllowed, recordEmailSend } from "@/lib/email/email-gate";

const FROM_ADDRESS = process.env.RESEND_FROM_EMAIL || "Ionexa AI <onboarding@resend.dev>";

/**
 * "Badge removal on this site expires in N days" (V4 #25).
 *
 * Sent once per paid period per site by api/cron/badge-renewals, seven days
 * before the period ends. Best-effort and never throws, like every sender
 * here — but note what the CALLER does with that: the cron only stamps
 * badge_removal_expiry_notified_at when this resolves, and this resolves
 * whether or not Resend accepted the message. A permanently bouncing
 * address must not make the cron re-send the same warning every hour
 * forever, so "we tried" is deliberately what counts as sent.
 */
export async function sendBadgeExpiringEmail({
  email,
  userId,
  subdomain,
  daysRemaining,
  credits,
  autoRenew,
}: {
  email: string;
  userId: string;
  subdomain: string;
  daysRemaining: number;
  credits: number;
  autoRenew: boolean;
}): Promise<void> {
  if (!email) return;
  try {
    const gate = await checkEmailAllowed(userId, "badge_expiring");
    if (!gate.allowed) return;

    const siteUrl = getSiteUrl();
    const resend = createResendClient();
    const { error } = await resend.emails.send({
      from: FROM_ADDRESS,
      to: email,
      subject: autoRenew
        ? `${subdomain} renews in ${daysRemaining} days — ${credits} credits`
        : `The Ionexa badge returns to ${subdomain} in ${daysRemaining} days`,
      html: badgeExpiringEmailHtml({
        subdomain,
        siteUrl: `${siteUrl}/s/${subdomain}`,
        daysRemaining,
        credits,
        autoRenew,
        manageUrl: `${siteUrl}/dashboard/published`,
      }),
    });
    if (error) {
      logApiError("email:send-badge-expiring", error, { stage: "resend_error" });
    } else {
      await recordEmailSend(userId, "badge_expiring");
    }
  } catch (err) {
    logApiError("email:send-badge-expiring", err, { stage: "unhandled" });
  }
}
