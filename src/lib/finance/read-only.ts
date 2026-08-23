import "server-only";

/**
 * RULE 1: READ-ONLY, WITHOUT EXCEPTION — as something that fails.
 *
 * The schema already has no column that could carry a payment
 * instruction, which is the real guarantee. This file is the second one:
 * it is the only place a bank or crypto provider may be called from, and
 * it refuses to make a request that is not a read.
 *
 * WHY BOTH. The schema stops a payment being STORED. This stops one being
 * SENT — a route could construct a transfer inline and never persist it,
 * and the schema would have nothing to say about that. Two barriers of
 * different kinds, because the failure being guarded against is
 * irreversible and somebody else's money.
 *
 * THE ALLOW-LIST IS OF METHODS AND PATH SHAPES, not of providers. A new
 * aggregator does not get to bring its own idea of what read-only means.
 */

/** The only HTTP methods a financial provider is ever called with.
 *  POST is on the list because several read APIs (Plaid's especially)
 *  take their query in a POST body — but only for paths that pass the
 *  path check below. */
export const READ_ONLY_METHODS = ["GET", "POST"] as const;
export type ReadOnlyMethod = (typeof READ_ONLY_METHODS)[number];

/**
 * Path fragments that mean the request would MOVE money or change an
 * arrangement. Any of them, anywhere in the path, is refused.
 *
 * Deliberately broad. A false positive here means a read endpoint we have
 * to name an exception for, in a reviewed change. A false negative means
 * a transfer.
 */
const FORBIDDEN_PATH_FRAGMENTS = [
  "payment",
  "payout",
  "transfer",
  "withdraw",
  "deposit",
  "send",
  "order",
  "trade",
  "swap",
  "sign",
  "authorize",
  "authorise",
  "mandate",
  "standing-order",
  "direct-debit",
  // STEMS, NOT WHOLE WORDS. "beneficiaries" does not contain
  // "beneficiary" — the plural is spelled differently, and the first
  // version of this list missed the endpoint every aggregator actually
  // names. Each entry below is the longest fragment shared by the
  // singular and the plural.
  "beneficiar",
  "payee",
  "recipient",
];

export type ReadOnlyCheck = { ok: true } | { ok: false; reason: string };

export function checkReadOnly(method: string, url: string): ReadOnlyCheck {
  const upper = String(method ?? "").toUpperCase();
  if (!(READ_ONLY_METHODS as readonly string[]).includes(upper)) {
    return { ok: false, reason: `method ${upper || "(none)"} is not a read` };
  }
  let path: string;
  try {
    path = new URL(url).pathname.toLowerCase();
  } catch {
    return { ok: false, reason: "the URL could not be parsed" };
  }
  const hit = FORBIDDEN_PATH_FRAGMENTS.find((fragment) => path.includes(fragment));
  return hit ? { ok: false, reason: `the path contains "${hit}"` } : { ok: true };
}

export class WriteAttemptError extends Error {
  constructor(reason: string) {
    // NO URL, NO BODY, NO TOKEN in the message. This reaches a log, and
    // a log line naming a financial endpoint and the request that hit it
    // is the credential-adjacent detail rule 6 exists to keep out.
    super(`Refused a non-read request to a financial provider: ${reason}.`);
    this.name = "WriteAttemptError";
  }
}

/**
 * The only way this codebase talks to a bank or a chain explorer.
 *
 * Returns the Response untouched. It does not read the body, does not
 * log, and does not retry — everything it could do with a response is
 * something that belongs to the caller, and a helper that quietly
 * inspected financial data would be a second place for it to leak.
 */
export async function readOnlyFetch(
  url: string,
  init: { method?: string; headers?: Record<string, string>; body?: string; signal?: AbortSignal } = {}
): Promise<Response> {
  const method = init.method ?? "GET";
  const check = checkReadOnly(method, url);
  if (!check.ok) throw new WriteAttemptError(check.reason);
  return fetch(url, {
    method,
    headers: init.headers,
    body: init.body,
    signal: init.signal,
  });
}
