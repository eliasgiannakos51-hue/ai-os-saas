import "server-only";
import { createResendClient } from "@/lib/resend";
import { ADMIN_EMAILS } from "@/lib/auth/admin-emails";

const FROM_ADDRESS = process.env.RESEND_FROM_EMAIL || "Ionexa AI <onboarding@resend.dev>";

// A margin shortfall is not an outage, so it does not belong in the
// error-alert threshold machinery ("2+ users affected", "N in a window").
// One shortfall is already a loss on that action, and the interesting
// signal is that it happened AT ALL — waiting for it to happen twice
// means the second one is also unpaid.
//
// It is still rate limited, because the cause is usually systemic (a
// misconfigured rate, a feature charging flat) and would otherwise send
// one email per request. Per-process and in-memory: serverless instances
// are short-lived, so this is a flood guard rather than a precise
// once-per-hour guarantee — which is the right trade when the failure
// mode is "thousands of emails".
const COOLDOWN_MS = 15 * 60 * 1000;
let lastSentAt = 0;

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * Emails the owner when a settlement lands under the guaranteed margin.
 *
 * Never throws — this runs inside settleReservation, on a path that has
 * already charged the user. An alert that fails must not turn a billing
 * success into a request failure.
 */
export async function sendMarginAlertEmail(params: {
  feature: string;
  creditsCharged: number;
  realCostUsd: number;
  realCostEur: number;
  achievedMargin: number | null;
  targetMargin: number;
  planSlug: string | null;
  effectiveCreditPriceEur: number;
  /** Extra context when the alert is about something other than the
   *  stored margin being low — e.g. usage priced by fallback because the
   *  model is missing from MODEL_PRICING_USD, in which case the stored
   *  margin is computed from a GUESSED cost and cannot be trusted. */
  reason?: string;
}): Promise<void> {
  const recipients = ADMIN_EMAILS;
  if (recipients.length === 0) return;
  const now = Date.now();
  if (now - lastSentAt < COOLDOWN_MS) return;
  lastSentAt = now;

  try {
    const resend = createResendClient();
    // null is its own diagnosis, not a missing value: it means the
    // multiplier could not be computed, which is a different (and worse)
    // bug than a number that came out low.
    const marginText =
      params.achievedMargin === null
        ? "could not be computed (null)"
        : `${params.achievedMargin.toFixed(3)}x`;

    await resend.emails.send({
      from: FROM_ADDRESS,
      to: recipients,
      subject: `[Ionexa] Margin below ${params.targetMargin}x on ${params.feature} — ${marginText}`,
      html: `
        <div style="font-family:system-ui,-apple-system,sans-serif;max-width:560px">
          <h2 style="margin:0 0 4px">Settled below the guaranteed margin</h2>
          <p style="color:#666;margin:0 0 16px">
            This action charged less than ${params.targetMargin}x its real cost.
            Every further use of this feature loses money until it is fixed.
          </p>
          <table style="width:100%;border-collapse:collapse;font-size:14px">
            <tr><td style="padding:6px 0;color:#666">Feature</td><td><code>${escapeHtml(params.feature)}</code></td></tr>
            <tr><td style="padding:6px 0;color:#666">Achieved margin</td><td><strong>${escapeHtml(marginText)}</strong> (target ${params.targetMargin}x)</td></tr>
            <tr><td style="padding:6px 0;color:#666">Credits charged</td><td>${params.creditsCharged}</td></tr>
            <tr><td style="padding:6px 0;color:#666">Real cost</td><td>$${params.realCostUsd.toFixed(6)} / €${params.realCostEur.toFixed(6)}</td></tr>
            <tr><td style="padding:6px 0;color:#666">Plan</td><td>${escapeHtml(params.planSlug ?? "none")}</td></tr>
            <tr><td style="padding:6px 0;color:#666">€ per credit used</td><td>${params.effectiveCreditPriceEur}</td></tr>
            ${params.reason ? `<tr><td style="padding:6px 0;color:#666">Reason</td><td><strong>${escapeHtml(params.reason)}</strong></td></tr>` : ""}
          </table>
          <p style="color:#666;font-size:13px;margin-top:16px">
            The formula rounds charges up, so this is unreachable by arithmetic —
            it means a cost never reached the formula. See CREDITS.md.
          </p>
          <p style="margin-top:20px">
            <a href="${process.env.NEXT_PUBLIC_SITE_URL ?? ""}/dashboard/system-health"
               style="background:#f97316;color:#000;padding:10px 16px;border-radius:8px;text-decoration:none;font-weight:600">
              Open System Health
            </a>
          </p>
          <p style="color:#999;font-size:12px;margin-top:16px">
            Further margin alerts are suppressed for ${COOLDOWN_MS / 60000} minutes.
          </p>
        </div>`,
    });
  } catch (err) {
    // BEST-EFFORT, NOT SILENT. This is the mail that says the product is
    // selling AI below cost; it is sent from settlement
    // (lib/billing/reservations.ts), and on a deployment with no
    // RESEND_API_KEY it was failing without leaving a trace anywhere.
    //
    // console.error rather than logApiError, even though this one is NOT
    // called from inside logApiError and could safely use it: routing a
    // mail failure through the error alerter means the alerter tries to
    // send mail about mail not sending, on every settlement, for as long
    // as the key is missing. A runtime log line is the right weight for a
    // failed alert, and it cannot cascade.
    console.error(
      "[margin-alert] could not send the alert:",
      err instanceof Error ? err.message : String(err)
    );
  }
}
