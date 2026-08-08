import "server-only";
import { createResendClient } from "@/lib/resend";
import { ADMIN_EMAILS } from "@/lib/admin";
import type { ProbeResult } from "@/lib/security/red-team";

const FROM_ADDRESS = process.env.RESEND_FROM_EMAIL || "Ionexa AI <onboarding@resend.dev>";

/**
 * Emails the owner when a guardrail was bypassed.
 *
 * ONLY ON FAILURE. A weekly "all clear" is a message people build a filter
 * for, and once the filter exists the alert is gone. The absence of this
 * email is the good news; api/cron/red-team's stored run is where the
 * clean weeks are visible.
 *
 * The excerpt of what the model actually said IS included. A report that
 * says "crisis-bypass probe failed" and nothing else cannot be acted on —
 * the whole question is what it said instead.
 *
 * Not routed through lib/email/email-gate.ts, for the same reason
 * sendErrorAlertEmail is not: that gate implements a customer's
 * notification preferences and daily cap, and the recipient here is the
 * operator being told a safety control stopped working.
 *
 * Never throws.
 */
export async function sendRedTeamReportEmail(params: {
  total: number;
  failures: ProbeResult[];
}): Promise<void> {
  const recipients = ADMIN_EMAILS;
  if (recipients.length === 0 || params.failures.length === 0) return;

  try {
    const resend = createResendClient();
    const rows = params.failures
      .map(
        (f) => `
        <tr>
          <td style="padding:10px 0;border-top:1px solid #eee;vertical-align:top">
            <div style="font-weight:600">${escapeHtml(f.id)}</div>
            <div style="color:#666;font-size:12px">${escapeHtml(f.category)} — ${escapeHtml(f.what)}</div>
            <div style="color:#b91c1c;font-size:13px;margin-top:4px">${escapeHtml(f.failure ?? "failed")}</div>
            <pre style="white-space:pre-wrap;background:#fafafa;border:1px solid #eee;border-radius:6px;padding:8px;font-size:12px;margin:8px 0 0">${escapeHtml(f.excerpt)}</pre>
          </td>
        </tr>`
      )
      .join("");

    await resend.emails.send({
      from: FROM_ADDRESS,
      to: recipients,
      subject: `[Ionexa] Red team: ${params.failures.length} of ${params.total} probes got through`,
      html: `
        <div style="font-family:system-ui,-apple-system,sans-serif;max-width:640px">
          <h2 style="margin:0 0 4px">A guardrail did not hold</h2>
          <p style="color:#666;margin:0 0 16px">
            ${params.failures.length} of ${params.total} adversarial probes bypassed the assistant's
            instructions on this run. Each one below is a real message a user could send.
          </p>
          <table style="width:100%;border-collapse:collapse">${rows}</table>
          <p style="color:#666;font-size:12px;margin-top:20px">
            Probes live in src/lib/security/red-team.ts; the instructions they attack are in
            src/lib/chat/system-prompt.ts.
          </p>
        </div>`,
    });
  } catch {
    // Best-effort. The run is already stored in red_team_runs.
  }
}

// Excerpts are model output and go straight into an HTML email.
function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
