import "server-only";
import { createResendClient } from "@/lib/resend";
import { senderAddress } from "@/lib/email/resend-config";
import { scheduledRunCompleteEmailHtml } from "@/lib/email/templates";
import { emailLocaleFor, emailTranslator } from "@/lib/email/email-locale";
import { getSiteUrl } from "@/lib/site-url";
import { logApiError } from "@/lib/log-error";
import { checkEmailAllowed, recordEmailSend } from "@/lib/email/email-gate";

// The From address, from ONE definition — see lib/email/resend-config.ts.
// This was one of fourteen copies of the same line — the constant AND
// its fallback, repeated per file. The fallback is the half that decides
// whether mail reaches anybody, so it now has one definition.

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
  detailKey,
}: {
  email: string;
  userId: string;
  stepText: string;
  succeeded: boolean;
  /** What happened, as the runner said it. Not translated: at six of the
   *  nine call sites this is model output or a provider error, which is
   *  not a closed set. */
  detail: string;
  /** …and at the other two it is a sentence this product wrote, so those
   *  pass a catalogue key instead and get it in the account's language.
   *  When it is set, `detail` is not used — the caller still passes one so
   *  that a key which somehow resolves to nothing has a sentence behind
   *  it rather than an empty paragraph. */
  detailKey?: string;
}): Promise<void> {
  if (!email) return;
  try {
    const gate = await checkEmailAllowed(userId, "scheduled_run_complete");
    if (!gate.allowed) return;

    const locale = await emailLocaleFor(userId);
    const t = emailTranslator(locale);

    const resend = createResendClient();
    const { error } = await resend.emails.send({
      from: senderAddress(),
      to: email,
      subject: t(succeeded ? "email.scheduledRun.subjectDone" : "email.scheduledRun.subjectFailed"),
      html: scheduledRunCompleteEmailHtml({
        stepText,
        succeeded,
        detail: detailKey ? t(detailKey) : detail,
        missionUrl: `${getSiteUrl()}/dashboard/mission`,
        locale,
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
