import "server-only";
import { escapeHtml } from "@/lib/html-escape";
import { sendOwnerAlert } from "@/lib/email/owner-alert";

// The From address, the recipients (ADMIN_EMAILS) and the delivery
// verdict all come from lib/email/owner-alert.ts, shared with the other
// three owner alerts and the test button on /dashboard/system-health.

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
  const reason =
    params.affectedUsers >= 2
      ? `${params.affectedUsers} different users affected`
      : `${params.recentCount} occurrences in a short window`;

  // BEST-EFFORT, BUT NOT SILENT, and never through logApiError: this
  // function runs INSIDE logApiError, so reporting its own failure that
  // way would re-enter the alert path on every request of a persistent
  // fault. lib/email/owner-alert.ts says a failure with console.error —
  // the same Vercel runtime log, and it re-enters nothing — including the
  // refusal Resend RETURNS rather than throws, which this file used to
  // read as delivered (ΑΣ-8.5, 2026-10-08).
  await sendOwnerAlert("error-alert", {
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
}

