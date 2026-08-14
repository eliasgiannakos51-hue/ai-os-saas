/**
 * What went wrong, as a value rather than as an English sentence.
 *
 * THE BUG THIS EXISTS TO FIX. Routes answer with prose — `{ error: "Not
 * authenticated." }` — and the client renders it through
 * `getErrorMessage(err, t("uploadError"))`. That reads as though the
 * translated fallback is what a Greek user sees. It is not: getErrorMessage
 * PREFERS the server's message and only falls back when there isn't one. So
 * the fallback was reached on a dropped connection and essentially never
 * otherwise, and every real failure — the ones that actually happen — put
 * an English sentence in a Greek UI. There are 518 such strings; the
 * i18n-coverage test counts them and has been raised six times.
 *
 * NO 60-ROUTE REWRITE. The fix people kept deferring was "routes return
 * stable codes the client looks up", which means editing every route in the
 * app at once. It turns out most of that work is already done: the routes
 * already answer with meaningful, consistent HTTP STATUS CODES — 401 for
 * signed out, 403 for a plan cap, 413 for too big, 415 for the wrong type,
 * 429 for too fast, 402 for out of credits. A status is a code. So the
 * client can translate every route in the app today by reading the status,
 * and `code` below is the override for the cases a status cannot express
 * (which of two different 403s this is).
 *
 * Adding `code` to a route is therefore an improvement, not a prerequisite.
 */

export const ERROR_CODES = [
  "notAuthenticated",
  "forbidden",
  "notFound",
  "invalidInput",
  "rateLimited",
  "insufficientCredits",
  "planLimit",
  "fileTooLarge",
  "unsupportedType",
  "conflict",
  "upstreamUnavailable",
  "serverError",
  "offline",
  "unknown",
] as const;

export type ErrorCode = (typeof ERROR_CODES)[number];

export function isErrorCode(value: unknown): value is ErrorCode {
  return typeof value === "string" && (ERROR_CODES as readonly string[]).includes(value);
}

/** The JSON shape every route already returns, plus the two optional fields. */
export type ApiErrorPayload = {
  ok?: boolean;
  /** The server's own English prose. Kept for logs; never the primary UI text. */
  error?: string;
  code?: ErrorCode;
  /**
   * Whether the credits this action reserved went back.
   *
   * Deliberately tri-state. `true`/`false` are answers; `undefined` means
   * the route did not say, and the UI must NOT guess — see
   * creditOutcomeForStatus, which turns "did not say" into an honest
   * "check your history" rather than a comforting "you were not charged"
   * that might be false.
   */
  creditsRefunded?: boolean;
};

/**
 * The code a response carries when it did not name one.
 *
 * 402 is the one worth reading twice: it means the balance was CHECKED and
 * found short, so nothing was spent. That is a different message from a 500
 * halfway through a model call, and it is why status alone gets this right
 * far more often than a single generic fallback ever did.
 */
export function codeForStatus(status: number): ErrorCode {
  if (status === 401) return "notAuthenticated";
  if (status === 402) return "insufficientCredits";
  if (status === 403) return "forbidden";
  if (status === 404) return "notFound";
  if (status === 409) return "conflict";
  if (status === 413) return "fileTooLarge";
  if (status === 415) return "unsupportedType";
  if (status === 429) return "rateLimited";
  if (status === 400 || status === 422) return "invalidInput";
  if (status === 502 || status === 503 || status === 504) return "upstreamUnavailable";
  if (status >= 500) return "serverError";
  if (status === 0) return "offline";
  return "unknown";
}

/** Which of the three credit sentences to show. */
export type CreditOutcome = "refunded" | "notCharged" | "charged" | "unverified";

/**
 * Was the user charged?
 *
 * Every error message in this app has to answer this, because "did that
 * cost me anything" is the first thing a person thinks when an AI action
 * fails, and leaving it unanswered is what makes a failure feel expensive.
 *
 * The rule is honest before it is reassuring:
 *
 *   - the route said so             -> say what it said
 *   - the request was rejected      -> nothing ran, nothing was charged
 *     BEFORE any work started
 *   - the request failed DURING     -> we genuinely do not know from here.
 *     the work, and the route            Say so, and send them to the
 *     did not say                        credit history rather than assert
 *                                        something that might be wrong.
 */
export function creditOutcomeForStatus(
  status: number,
  creditsRefunded: boolean | undefined
): CreditOutcome {
  if (creditsRefunded === true) return "refunded";
  if (creditsRefunded === false) return "charged";
  // A 4xx is a rejection: the route stopped before spending anything. The
  // one exception that ISN'T is 409, which can be raised after a partial
  // write, so it is treated as unverified along with the 5xx family.
  if (status >= 400 && status < 500 && status !== 409) return "notCharged";
  if (status === 0) return "notCharged"; // never reached the server
  return "unverified";
}
