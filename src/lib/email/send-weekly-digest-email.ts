import "server-only";
import { createResendClient } from "@/lib/resend";
import { senderAddress } from "@/lib/email/resend-config";
import { weeklyDigestEmailHtml } from "@/lib/email/templates";
import { logApiError } from "@/lib/log-error";
import { checkEmailAllowed, recordEmailSend } from "@/lib/email/email-gate";
import { getSiteUrl } from "@/lib/site-url";
import type { DigestContent } from "@/lib/notify/digest";

// The From address, from ONE definition — see lib/email/resend-config.ts.
// This was one of fourteen copies of the same line — the constant AND
// its fallback, repeated per file. The fallback is the half that decides
// whether mail reaches anybody, so it now has one definition.

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
      from: senderAddress(),
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
