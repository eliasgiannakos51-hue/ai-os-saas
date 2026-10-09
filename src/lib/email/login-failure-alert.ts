import "server-only";
import { escapeHtml } from "@/lib/html-escape";
import { sendOwnerAlert } from "@/lib/email/owner-alert";

// The operator alert for a wave of failed sign-ins (lib/auth/
// login-failure-alert.ts decides when). English on purpose, like
// error-alert.ts and margin-alert.ts: the reader is the owner.
export async function sendLoginFailureAlertEmail(params: {
  kind: "global" | "account";
  failures: number;
  windowMinutes: number;
  account?: string;
}): Promise<void> {
  const what =
    params.kind === "global"
      ? `${params.failures} failed sign-ins across the site in ${params.windowMinutes} minutes`
      : `${params.failures} failed sign-ins on one account (${params.account ?? "unknown"}) in ${params.windowMinutes} minutes`;
  // Delivery, and saying so when Resend refuses: lib/email/owner-alert.ts.
  await sendOwnerAlert("login-failure-alert", {
    subject: `[Ionexa security] ${what}`,
    html: `
      <div style="font-family:system-ui,-apple-system,sans-serif;max-width:560px">
        <h2 style="margin:0 0 4px">Failed sign-ins</h2>
        <p style="margin:0 0 16px">${escapeHtml(what)}.</p>
        <p style="color:#666;margin:0">Each address is already blocked after 8 failures in 15 minutes. This alert repeats at most once an hour for the same cause.</p>
      </div>`,
  });
}
