import "server-only";
import { emailLocaleFor } from "@/lib/email/email-locale";
import { createResendClient } from "@/lib/resend";
import { senderAddress } from "@/lib/email/resend-config";
import { subscriptionCancelledEmailHtml } from "@/lib/email/templates";
import { getSiteUrl } from "@/lib/site-url";
import { logApiError } from "@/lib/log-error";

// The From address, from ONE definition — see lib/email/resend-config.ts.
// This was one of fourteen copies of the same line — the constant AND
// its fallback, repeated per file. The fallback is the half that decides
// whether mail reaches anybody, so it now has one definition.

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
  userId,
}: {
  to: string;
  endsAt: string | null;
  userId?: string | null;
}): Promise<void> {
  if (!to) return;
  try {
    const locale = await emailLocaleFor(userId);
    // THE DATE IN THE ACCOUNT'S OWN LANGUAGE. This was hard-coded en-GB
    // and the comment here explained it with a reason that was not true —
    // "the messages/*.json catalogue is not loaded outside a request's
    // locale context". lib/ai/module-vocabulary.ts imports every
    // catalogue at module scope, outside any request, and
    // lib/email/email-locale.ts now does the same. What had actually been
    // missing was the account: this function was handed an address.
    //
    // toLocaleDateString takes the same bare code the catalogue does, and
    // falls back to the runtime's own formatting for one it does not know
    // rather than throwing — so a date is never the reason an email about
    // somebody's subscription fails to arrive.
    const endsOn = endsAt
      ? new Date(endsAt).toLocaleDateString(locale, { day: "numeric", month: "long", year: "numeric" })
      : null;

    const resend = createResendClient();
    const { error } = await resend.emails.send({
      from: senderAddress(),
      to,
      subject: endsOn ? `your subscription ends on ${endsOn}` : "your subscription is set to end",
      html: subscriptionCancelledEmailHtml({
        locale,
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
