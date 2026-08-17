/**
 * The four failures a user is actually going to hit, as CODES.
 *
 * "Something went wrong." is in this codebase 20 times, and every one of
 * them is the same three failures of nerve: it does not say what happened,
 * it does not say what to do, and — the one that costs money — it does not
 * say whether the credits were taken. A user who ran out of credits, a
 * user whose wifi dropped and a user who hit a rate limit all read the
 * same sentence and all draw the same conclusion, which is that the
 * product is broken and their balance is gone.
 *
 * WHY CODES AND NOT SENTENCES. A route runs on the server and has no idea
 * what language the person reading it chose. i18n-coverage.test.mjs has
 * counted the consequence for a while — 521 lines of English error prose,
 * held at a baseline with the recorded fix being "stable error CODES
 * across all routes, translated client-side" and the recorded reason for
 * not starting being that it is a refactor of the whole API surface.
 *
 * This is not that refactor. It is the four failures that refactor exists
 * to fix, done properly, with the mechanism the rest can adopt one route
 * at a time. A route returns `{ ok: false, code, creditsRefunded }`; the
 * client renders three things from it, in the user's own language:
 *
 *   what   what happened, in one sentence, in terms of their action
 *   next   the thing they can do about it, which is never "try again"
 *          alone unless trying again is genuinely the answer
 *   money  whether they were charged, refunded, or never charged
 *
 * THE MONEY LINE IS NOT OPTIONAL. It is the question every one of these
 * failures raises and none of them answered. It is also cheap to answer
 * honestly, because the reserve/settle path already knows: work that
 * produced nothing gives the hold back (lib/jobs/job-types.ts's
 * creditOutcome), so the client is told which happened rather than left
 * to assume the worse one.
 */
export const PROBLEM_CODES = [
  /** The balance could not cover the action. Nothing was charged. */
  "out_of_credits",
  /** A per-hour cap for this action was reached. Nothing was charged. */
  "rate_limited",
  /** The work ran past its ceiling and was stopped. The hold is returned. */
  "timeout",
  /** The request never reached us, or the reply never came back. */
  "network",
] as const;

export type ProblemCode = (typeof PROBLEM_CODES)[number];

export function isProblemCode(value: unknown): value is ProblemCode {
  return typeof value === "string" && (PROBLEM_CODES as readonly string[]).includes(value);
}

/**
 * What happened to the money, as a fact rather than a guess.
 *
 * "untouched" and "refunded" are deliberately separate. They are the same
 * balance to the arithmetic and a completely different sentence to read:
 * "you were not charged" answers a user who is about to retry, while "the
 * credits have been returned" answers a user who watched them leave.
 * Collapsing them would save one string and lose the only part of the
 * message that is about their money.
 */
export type CreditOutcome = "untouched" | "refunded" | "charged";

/** The outcome each code always has, so a route cannot report the wrong one. */
export const CREDIT_OUTCOME_FOR: Record<ProblemCode, CreditOutcome> = {
  // Refused before anything was reserved — there was nothing to refund.
  out_of_credits: "untouched",
  // Refused before the model was called, for the same reason.
  rate_limited: "untouched",
  // Reserved, then stopped. run-job.ts hands the reservation back.
  timeout: "refunded",
  // The failure is between the browser and us; whether work happened at
  // all is unknown from here, so this is the one that must not claim.
  network: "untouched",
};

export type ProblemMessageKey = `problem.${string}`;

export function problemKey(code: ProblemCode, part: "what" | "next"): ProblemMessageKey {
  return `problem.${code}.${part}`;
}

export function creditOutcomeKey(outcome: CreditOutcome): ProblemMessageKey {
  return `problem.credits.${outcome}`;
}

/**
 * Read a code off whatever a fetch produced.
 *
 * Deliberately tolerant on the way in and strict on the way out: a route
 * that has not been converted yet returns no code, and the answer for
 * those is null — the caller keeps its existing message rather than being
 * handed a wrong one. Guessing a code from an English string is how
 * "Too many agents created" would end up telling somebody their credits
 * were refunded.
 */
export function problemCodeFrom(body: unknown): ProblemCode | null {
  if (!body || typeof body !== "object") return null;
  const code = (body as { code?: unknown }).code;
  return isProblemCode(code) ? code : null;
}

/**
 * The code for a failed fetch, from the browser's own error.
 *
 * A dropped connection and a request the browser aborted are the same
 * thing to the user — the reply never came — and neither reached a route,
 * so neither can carry a code from the server. This is the only place a
 * code is inferred rather than read, and it is inferred from the failure
 * of the transport, not from the text of a message.
 */
export function problemCodeForFetchFailure(error: unknown): ProblemCode {
  if (error instanceof DOMException && error.name === "TimeoutError") return "timeout";
  if (error instanceof Error && error.name === "AbortError") return "timeout";
  return "network";
}
