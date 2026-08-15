import "server-only";
import { createResendClient } from "@/lib/resend";
import { subscriptionCancelledEmailHtml } from "@/lib/email/templates";
import { getSiteUrl } from "@/lib/site-url";
import { logApiError } from "@/lib/log-error";

const FROM_ADDRESS = process.env.RESEND_FROM_EMAIL || "Ionexa AI <onboarding@resend.dev>";

/**
 * Best-effort, never throws — the same posture as every other email in
 * this folder, and it matters more here than anywhere else: a cancellation
 * that fails because a confirmation email could not be sent would trap
 * somebody in a subscription they asked to leave.
 *
 * NOT GATED by user_email_preferences. Those toggles cover digests, agent
 * results and reminders; a receipt for a billing change the user just made
 * is a transactional confirmation, and suppressing it would leave them
 * with no written record of when their access ends.
 */
export async function sendSubscriptionCancelledEmail({
  to,
  endsAt,
}: {
  to: string;
  endsAt: string | null;
}): Promise<void> {
  if (!to) return;
  try {
    // Formatted in en-GB, matching every other email in this folder: the
    // messages/*.json catalogue is not loaded outside a request's locale
    // context, and an email is not rendered inside one.
    const endsOn = endsAt
      ? new Date(endsAt).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" })
      : null;

    const resend = createResendClient();
    const { error } = await resend.emails.send({
      from: FROM_ADDRESS,
      to,
      subject: endsOn ? `your subscription ends on ${endsOn}` : "your subscription is set to end",
      html: subscriptionCancelledEmailHtml({
        email: to,
        endsOn,
        restoreUrl: `${getSiteUrl()}/dashboard/settings#billing`,
      }),
    });
    if (error) logApiError("email:subscription-cancelled", error, { stage: "resend_error" });
  } catch (err) {
    logApiError("email:subscription-cancelled", err, { stage: "unhandled" });
  }
}
