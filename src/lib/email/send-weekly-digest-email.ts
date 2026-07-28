import "server-only";
import { createResendClient } from "@/lib/resend";
import { weeklyDigestEmailHtml } from "@/lib/email/templates";

const FROM_ADDRESS = process.env.RESEND_FROM_EMAIL || "AI_OS <onboarding@resend.dev>";

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
      subject: "your week on AI_OS",
      html: weeklyDigestEmailHtml({ email, moduleCounts, periodLabel }),
    });

    if (error) {
      console.error("sendWeeklyDigestEmail: Resend returned an error", error);
    }
  } catch (err) {
    console.error("sendWeeklyDigestEmail: failed to send", err);
  }
}
