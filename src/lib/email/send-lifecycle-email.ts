import "server-only";
import { createResendClient } from "@/lib/resend";
import { lifecycleEmailHtml } from "@/lib/email/templates";
import { logApiError } from "@/lib/log-error";
import { checkEmailAllowed, recordEmailSend } from "@/lib/email/email-gate";
import type { EmailType } from "@/lib/email/email-types";

const FROM_ADDRESS = process.env.RESEND_FROM_EMAIL || "Ionexa AI <onboarding@resend.dev>";

/**
 * One sender for the whole lifecycle sequence AND the "your feature
 * request shipped" notice — the same gate/log/never-throw contract as
 * every other sender, with the email TYPE passed in because the two
 * flows are separately opt-out-able.
 *
 * Returns whether the send actually happened, because the lifecycle
 * cron claims the log row BEFORE sending and needs to know whether the
 * claim consumed a real email or a suppressed one.
 */
export async function sendLifecycleEmail({
  email,
  userId,
  type,
  subject,
  kicker,
  heading,
  paragraphs,
  bullets,
  ctaLabel,
  ctaPath,
}: {
  email: string;
  userId: string;
  type: EmailType;
  subject: string;
  kicker: string;
  heading: string;
  paragraphs: string[];
  bullets?: string[];
  ctaLabel: string;
  ctaPath: string;
}): Promise<boolean> {
  try {
    const gate = await checkEmailAllowed(userId, type);
    if (!gate.allowed) return false;

    const resend = createResendClient();
    const { error } = await resend.emails.send({
      from: FROM_ADDRESS,
      to: email,
      subject,
      html: lifecycleEmailHtml({ kicker, heading, paragraphs, bullets, ctaLabel, ctaPath }),
    });

    if (error) {
      logApiError("email:send-lifecycle", error, { stage: "resend_error", type });
      return false;
    }
    await recordEmailSend(userId, type);
    return true;
  } catch (err) {
    logApiError("email:send-lifecycle", err, { stage: "unhandled", type });
    return false;
  }
}
