import "server-only";
import { createResendClient } from "@/lib/resend";
import { scheduledRunCompleteEmailHtml } from "@/lib/email/templates";
import { getSiteUrl } from "@/lib/site-url";
import { logApiError } from "@/lib/log-error";
import { checkEmailAllowed, recordEmailSend } from "@/lib/email/email-gate";

const FROM_ADDRESS = process.env.RESEND_FROM_EMAIL || "Ionexa AI <onboarding@resend.dev>";

// Sent by api/cron/scheduled-runs/route.ts once a scheduled step's
// execution day arrives and it either completes or fails — the only way
// a user finds out, since they aren't watching live the way they would be
// for a manual "Create with AI" click. Best-effort, same pattern as every
// other transactional email in this app: never throws, just logs.
export async function sendScheduledRunCompleteEmail({
  email,
  userId,
  stepText,
  succeeded,
  detail,
}: {
  email: string;
  userId: string;
  stepText: string;
  succeeded: boolean;
  detail: string;
}): Promise<void> {
  if (!email) return;
  try {
    const gate = await checkEmailAllowed(userId, "scheduled_run_complete");
    if (!gate.allowed) return;

    const resend = createResendClient();
    const { error } = await resend.emails.send({
      from: FROM_ADDRESS,
      to: email,
      subject: succeeded ? `Your scheduled task is done — Ionexa AI` : `Your scheduled task couldn't run — Ionexa AI`,
      html: scheduledRunCompleteEmailHtml({
        stepText,
        succeeded,
        detail,
        missionUrl: `${getSiteUrl()}/dashboard/mission`,
      }),
    });

    if (error) {
      logApiError("email:send-scheduled-run-complete", error, { stage: "resend_error" });
    } else {
      await recordEmailSend(userId, "scheduled_run_complete");
    }
  } catch (err) {
    logApiError("email:send-scheduled-run-complete", err, { stage: "unhandled" });
  }
}
