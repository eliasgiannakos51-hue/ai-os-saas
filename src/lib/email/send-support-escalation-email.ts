import "server-only";
import { createResendClient } from "@/lib/resend";
import { ADMIN_EMAILS } from "@/lib/admin";

const FROM_ADDRESS = process.env.RESEND_FROM_EMAIL || "Ionexa AI <onboarding@resend.dev>";

/**
 * Tells the owner that the support assistant gave up on a question.
 *
 * Deliberately NOT routed through lib/email/email-gate.ts, for the same
 * reason sendErrorAlertEmail is not: that gate implements the RECIPIENT's
 * notification preferences and daily cap, and the recipient here is the
 * operator, not a customer. Suppressing a customer's unanswered question
 * because the owner's inbox already had twenty emails today would lose the
 * message.
 *
 * `replyTo` is the asker. Hitting reply in the inbox should answer the
 * person, not start a thread with the app.
 *
 * Never throws — api/support/escalate has already stored the row, and a
 * mail failure must not turn a recorded question into an error the user
 * sees.
 */
export async function sendSupportEscalationEmail(params: {
  email: string;
  question: string;
  reason: string;
}): Promise<void> {
  const recipients = ADMIN_EMAILS;
  if (recipients.length === 0) return;

  try {
    const resend = createResendClient();
    await resend.emails.send({
      from: FROM_ADDRESS,
      to: recipients,
      replyTo: params.email,
      subject: `[Ionexa] Support question the assistant couldn't answer`,
      html: `
        <div style="font-family:system-ui,-apple-system,sans-serif;max-width:560px">
          <h2 style="margin:0 0 4px">Unanswered support question</h2>
          <p style="color:#666;margin:0 0 16px">
            From ${escapeHtml(params.email)} — assistant declined: <code>${escapeHtml(params.reason)}</code>
          </p>
          <blockquote style="margin:0;padding:12px 16px;border-left:3px solid #f97316;background:#fafafa;font-size:15px">
            ${escapeHtml(params.question)}
          </blockquote>
          <p style="color:#666;font-size:13px;margin-top:20px">
            Reply to this email to answer them directly. If the same question keeps arriving,
            it belongs in help_articles — see help_articles_migration.sql.
          </p>
        </div>`,
    });
  } catch {
    // Best-effort. The escalation is already recorded in
    // support_escalations, which is the queue that actually gets worked.
  }
}

// The question is user input and goes straight into an HTML email.
function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
