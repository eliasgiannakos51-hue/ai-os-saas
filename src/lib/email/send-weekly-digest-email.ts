import "server-only";
import { createResendClient } from "@/lib/resend";
import { weeklyDigestEmailHtml } from "@/lib/email/templates";
import { logApiError } from "@/lib/log-error";
import { checkEmailAllowed, recordEmailSend } from "@/lib/email/email-gate";
import { getSiteUrl } from "@/lib/site-url";
import type { DigestContent } from "@/lib/notify/digest";

const FROM_ADDRESS = process.env.RESEND_FROM_EMAIL || "Ionexa AI <onboarding@resend.dev>";

// Best-effort, same pattern as sendWelcomeEmail — never throws, just logs.
//
// It takes a composed DigestContent rather than raw numbers: what is worth
// saying is decided once, in lib/notify/digest.ts, where the build gate
// can check it. This function's only judgement is the one it has always
// had — the email gate and the daily cap.
export async function sendWeeklyDigestEmail({
  email,
  userId,
  digest,
  periodLabel,
}: {
  email: string;
  userId: string;
  digest: DigestContent;
  periodLabel: string;
}): Promise<boolean> {
  try {
    // A DIGEST WITH NOTHING IN IT IS NEVER SENT. The route checks this
    // too; it is repeated here because this function is the last thing
    // between a decision and somebody's inbox.
    if (!digest.worth.worth || digest.lines.length === 0) return false;

    const gate = await checkEmailAllowed(userId, "weekly_digest");
    if (!gate.allowed) return false;

    if (!process.env.RESEND_API_KEY) {
      logApiError("email:send-weekly-digest", new Error("RESEND_API_KEY is not set"), { stage: "not_configured" });
      return false;
    }

    const resend = createResendClient();
    const { error } = await resend.emails.send({
      from: FROM_ADDRESS,
      to: email,
      // The subject carries the week's first real fact, so the inbox line
      // is different every week instead of the same four words.
      subject: digest.lines[0] ? `this week: ${digest.lines[0].text}` : "your week on Ionexa AI",
      html: weeklyDigestEmailHtml({
        lines: digest.lines,
        observations: digest.observations,
        periodLabel,
        dashboardUrl: `${getSiteUrl()}/dashboard`,
      }),
    });

    if (error) {
      logApiError("email:send-weekly-digest", error, { stage: "resend_error" });
      return false;
    }
    await recordEmailSend(userId, "weekly_digest");
    return true;
  } catch (err) {
    logApiError("email:send-weekly-digest", err, { stage: "unhandled" });
    return false;
  }
}
