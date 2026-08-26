import "server-only";
import { createResendClient } from "@/lib/resend";
import { ADMIN_EMAILS } from "@/lib/auth/admin-emails";

const FROM_ADDRESS = process.env.RESEND_FROM_EMAIL || "Ionexa AI <onboarding@resend.dev>";

/**
 * Emails the owner when an error crosses an alert threshold.
 *
 * Deliberately NOT routed through lib/email/email-gate.ts: that gate
 * implements per-user notification preferences and a daily cap, both of
 * which are correct for product emails and wrong for an outage alert.
 * The rate limiting that matters here is the per-fingerprint cooldown in
 * the RPC, which stops a persistent error from sending on every request.
 *
 * Never throws — this runs inside logApiError.
 */
export async function sendErrorAlertEmail(params: {
  message: string;
  route: string;
  occurrenceCount: number;
  affectedUsers: number;
  recentCount: number;
}): Promise<void> {
  const recipients = ADMIN_EMAILS;
  if (recipients.length === 0) return;

  try {
    const resend = createResendClient();
    const reason =
      params.affectedUsers >= 2
        ? `${params.affectedUsers} different users affected`
        : `${params.recentCount} occurrences in a short window`;

    await resend.emails.send({
      from: FROM_ADDRESS,
      to: recipients,
      subject: `[Ionexa] ${params.route} is failing — ${reason}`,
      html: `
        <div style="font-family:system-ui,-apple-system,sans-serif;max-width:560px">
          <h2 style="margin:0 0 4px">Production error</h2>
          <p style="color:#666;margin:0 0 16px">${escapeHtml(reason)}</p>
          <table style="width:100%;border-collapse:collapse;font-size:14px">
            <tr><td style="padding:6px 0;color:#666">Route</td><td><code>${escapeHtml(params.route)}</code></td></tr>
            <tr><td style="padding:6px 0;color:#666">Message</td><td>${escapeHtml(params.message)}</td></tr>
            <tr><td style="padding:6px 0;color:#666">Total occurrences</td><td>${params.occurrenceCount}</td></tr>
            <tr><td style="padding:6px 0;color:#666">Users affected</td><td>${params.affectedUsers}</td></tr>
          </table>
          <p style="margin-top:20px">
            <a href="${process.env.NEXT_PUBLIC_SITE_URL ?? ""}/dashboard/system-health"
               style="background:#f97316;color:#000;padding:10px 16px;border-radius:8px;text-decoration:none;font-weight:600">
              Open System Health
            </a>
          </p>
        </div>`,
    });
  } catch {
    // Best-effort. An alert that fails must not become a second error.
  }
}

// The message comes from a thrown exception, which can contain anything.
function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
