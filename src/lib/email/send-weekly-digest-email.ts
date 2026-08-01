import "server-only";
import { createResendClient } from "@/lib/resend";
import { weeklyDigestEmailHtml } from "@/lib/email/templates";
import { logApiError } from "@/lib/log-error";

const FROM_ADDRESS = process.env.RESEND_FROM_EMAIL || "Ionexa AI <onboarding@resend.dev>";

// Best-effort, same pattern as sendWelcomeEmail — never throws, just logs.
export async function sendWeeklyDigestEmail({
  email,
  moduleCounts,
  periodLabel,
}: {
  email: string;
  moduleCounts: { title: string; count: number }[];
  periodLabel: string;
}): Promise<void> {
  try {
    const resend = createResendClient();
    const { error } = await resend.emails.send({
      from: FROM_ADDRESS,
      to: email,
      subject: "your week on Ionexa AI",
      html: weeklyDigestEmailHtml({ email, moduleCounts, periodLabel }),
    });

    if (error) {
      logApiError("email:send-weekly-digest", error, { stage: "resend_error" });
    }
  } catch (err) {
    logApiError("email:send-weekly-digest", err, { stage: "unhandled" });
  }
}
