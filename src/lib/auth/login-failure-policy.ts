import { createHash } from "node:crypto";

// THE OWNER HEARS ABOUT A WAVE OF FAILED SIGN-INS (ΑΣ-8.5).
//
// api/auth/login already blocks one address hammering it (8 failures in 15
// minutes, per IP). What it could not see is the two shapes that block
// misses: many addresses at once, and one account tried from many
// addresses. Both are counted here, in rate_limit_log, the same table and
// the same helpers the per-IP block uses.
//
// THE ACCOUNT IS KEPT AS A HASH, never as the address: a log table holds
// no personal data, and a hash is enough to count repeats of one account.
// The alert names the account only by its masked address, built here from
// the address the request carried and never stored.
//
// ONE EMAIL PER CAUSE PER HOUR. The alert scope is consumed with
// checkRateLimit, so a wave that lasts all night sends once an hour, not
// once a failure.
export const LOGIN_FAILURE_ALERT = {
  globalScope: "login_failed_global",
  accountScope: "login_failed_account",
  alertScope: "login_failure_alert",
  windowMinutes: 15,
  globalThreshold: 50,
  accountThreshold: 20,
  alertEveryMinutes: 60,
} as const;

export function accountKey(email: string): string {
  return createHash("sha256").update(email.trim().toLowerCase()).digest("hex");
}

export function maskEmail(email: string): string {
  const [local, domain] = email.trim().toLowerCase().split("@");
  if (!local || !domain) return "(unreadable address)";
  return `${local.slice(0, 1)}***@${domain}`;
}

/** Which alerts the two counts call for. Pure, so the gate can run it. */
export function alertsFor(counts: { global: number | null; account: number | null }): Array<"global" | "account"> {
  const c = LOGIN_FAILURE_ALERT;
  const due: Array<"global" | "account"> = [];
  if (counts.global !== null && counts.global >= c.globalThreshold) due.push("global");
  if (counts.account !== null && counts.account >= c.accountThreshold) due.push("account");
  return due;
}
