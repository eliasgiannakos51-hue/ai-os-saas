import "server-only";
import { checkRateLimit, countRateLimitHits, recordRateLimitHit } from "@/lib/rate-limit";
import { sendLoginFailureAlertEmail } from "@/lib/email/login-failure-alert";
import { LOGIN_FAILURE_ALERT, accountKey, alertsFor, maskEmail } from "@/lib/auth/login-failure-policy";

// Counting and sending. What to count, the thresholds and the decision are
// in lib/auth/login-failure-policy.ts, which has no server dependency.

/**
 * Counts one failed sign-in site-wide and against its account, and emails
 * the owner when either count crosses its threshold. Never throws: a sign-in
 * must never fail because the alert could not be counted or sent.
 */
export async function noteLoginFailure(email: string): Promise<void> {
  const c = LOGIN_FAILURE_ALERT;
  try {
    const account = accountKey(email);
    await Promise.all([
      recordRateLimitHit({ scope: c.globalScope, identifier: "all" }),
      recordRateLimitHit({ scope: c.accountScope, identifier: account }),
    ]);
    const [global, perAccount] = await Promise.all([
      countRateLimitHits({ scope: c.globalScope, identifier: "all", windowMinutes: c.windowMinutes }),
      countRateLimitHits({ scope: c.accountScope, identifier: account, windowMinutes: c.windowMinutes }),
    ]);

    const due = alertsFor({ global: global.ok ? global.count : null, account: perAccount.ok ? perAccount.count : null });
    if (due.includes("global")) {
      const slot = await checkRateLimit({ scope: c.alertScope, identifier: "global", maxAttempts: 1, windowMinutes: c.alertEveryMinutes });
      if (slot.allowed) {
        await sendLoginFailureAlertEmail({ kind: "global", failures: global.count, windowMinutes: c.windowMinutes });
      }
    }
    if (due.includes("account")) {
      const slot = await checkRateLimit({ scope: c.alertScope, identifier: `account:${account}`, maxAttempts: 1, windowMinutes: c.alertEveryMinutes });
      if (slot.allowed) {
        await sendLoginFailureAlertEmail({
          kind: "account",
          failures: perAccount.count,
          windowMinutes: c.windowMinutes,
          account: maskEmail(email),
        });
      }
    }
  } catch (err) {
    console.error("[login-failure-alert] could not count or alert:", err instanceof Error ? err.message : String(err));
  }
}
