import "server-only";
import { createResendClient } from "@/lib/resend";
import { weeklyDigestEmailHtml } from "@/lib/email/templates";
import { logApiError } from "@/lib/log-error";
import { checkEmailAllowed, recordEmailSend } from "@/lib/email/email-gate";

const FROM_ADDRESS = process.env.RESEND_FROM_EMAIL || "Ionexa AI <onboarding@resend.dev>";

// Best-effort, same pattern as sendWelcomeEmail — never throws, just logs.
export async function sendWeeklyDigestEmail({
  email,
  userId,
  moduleCounts,
  periodLabel,
}: {
  email: string;
  userId: string;
  moduleCounts: { title: string; count: number }[];
  periodLabel: string;
}): Promise<void> {
  try {
    const gate = await checkEmailAllowed(userId, "weekly_digest");
    if (!gate.allowed) return;

    const resend = createResendClient();
    const { error } = await resend.emails.send({
      from: FROM_ADDRESS,
      to: email,
      subject: "your week on Ionexa AI",
      html: weeklyDigestEmailHtml({ email, moduleCounts, periodLabel }),
    });

    if (error) {
      logApiError("email:send-weekly-digest", error, { stage: "resend_error" });
    } else {
      await recordEmailSend(userId, "weekly_digest");
    }
  } catch (err) {
    logApiError("email:send-weekly-digest", err, { stage: "unhandled" });
  }
}
