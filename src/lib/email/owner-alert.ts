import "server-only";
import { createResendClient } from "@/lib/resend";
import { resendIsConfigured, senderAddress } from "@/lib/email/resend-config";
import { ADMIN_EMAILS } from "@/lib/auth/admin-emails";
import { scrubSecrets } from "@/lib/scrub-secrets";

/**
 * ONE WAY AN ALERT REACHES THE OWNER, AND IT SAYS WHETHER IT DID
 * (docs/SECURITY-AUDIT.md ΑΣ-8.5, 2026-10-08).
 *
 * The four owner alerts — errors (lib/email/error-alert.ts), cost
 * (lib/billing/cost-alert-delivery.ts), margin (lib/email/margin-alert.ts)
 * and failed sign-ins (lib/email/login-failure-alert.ts) — each called
 * `await resend.emails.send(...)` inside a try and treated reaching the
 * next line as delivered. The Resend SDK does not throw when Resend
 * refuses a message: it RETURNS `{ error }`, and in production it does not
 * log it either (node_modules/resend, `logError` is skipped when NODE_ENV
 * is production). So a refused alert — an unverified sender, a revoked
 * key — left no trace, and the cost alert marked itself delivered.
 * Every product email in src/ already read `{ error }`; the alerts were
 * the four that did not.
 *
 * Now they all come here, and so does the test button on
 * /dashboard/system-health (src/app/api/system-health/test-alert/route.ts):
 * pressing it runs exactly the path a real alert takes.
 *
 * THE FAILURE IS SAID WITH console.error, NEVER logApiError. The error
 * alert runs INSIDE logApiError; reporting its own failure that way would
 * re-enter the alert path on every request of a persistent fault.
 *
 * Never throws.
 */
export type OwnerAlertOutcome =
  | { ok: true; recipients: number }
  | { ok: false; reason: "no_recipients" | "not_configured" | "refused"; detail: string };

export async function sendOwnerAlert(
  tag: string,
  message: { subject: string; html: string }
): Promise<OwnerAlertOutcome> {
  // Nobody to tell is not a failure to log on every call: the system-health
  // page names it, and a deployment without ADMIN_EMAILS has no admin page.
  if (ADMIN_EMAILS.length === 0) return { ok: false, reason: "no_recipients", detail: "ADMIN_EMAILS is not set" };
  let outcome: OwnerAlertOutcome;
  if (!resendIsConfigured()) {
    outcome = { ok: false, reason: "not_configured", detail: "RESEND_API_KEY is not set" };
  } else {
    try {
      const { error } = await createResendClient().emails.send({
        from: senderAddress(),
        to: ADMIN_EMAILS,
        subject: message.subject,
        html: message.html,
      });
      outcome = error
        ? { ok: false, reason: "refused", detail: scrubSecrets(`${error.name ?? "error"}: ${error.message ?? ""}`).slice(0, 300) }
        : { ok: true, recipients: ADMIN_EMAILS.length };
    } catch (err) {
      outcome = { ok: false, reason: "refused", detail: scrubSecrets(err instanceof Error ? err.message : String(err)).slice(0, 300) };
    }
  }
  if (!outcome.ok) console.error(`[${tag}] could not send the alert:`, outcome.detail);
  return outcome;
}
