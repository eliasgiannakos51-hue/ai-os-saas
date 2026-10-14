"use client";

import { creditOutcomeForStatus, isTimedLimitCode, retryTime, type CreditOutcome, type ErrorCode } from "./error-codes";

/*
 * The three sentences of a failure, as a plain function of a translator —
 * what lib/errors/use-error-text.ts hands the screens, kept apart from the
 * hooks so scripts/tests/limit-texts.test.mjs can run it against the real
 * messages/*.json. Marked as client code because only the screens use it,
 * and so scripts/tests/message-slices.test.mjs still counts its
 * template-literal keys (`codes.${code}.what`) where they are read, as it
 * did while they sat in use-error-text.ts.
 */

export type FailureText = {
  /** What happened, in the reader's language. */
  what: string;
  /** What they can do about it. Never "try again" unless retrying is the fix. */
  next: string;
  /** Whether they were charged. Always answered. */
  credits: string;
  /** Whether to offer the credit-history link alongside `credits`. */
  showCreditHistory: boolean;
  /** The three joined, for a toast or any other single-line surface. */
  text: string;
};

type Translate = (key: string, values?: Record<string, string>) => string;

/**
 * The three sentences, from a code and a status.
 *
 * THE SHAPE IS FIXED, and it is fixed because the old messages failed the
 * same way every time. "Something went wrong. Please try again." tells the
 * reader nothing they did not already know — not what broke, not whether
 * retrying is even the right move, and not the thing they actually want to
 * know, which is whether that failed run just cost them money.
 *
 *   1. WHAT HAPPENED   — specific enough to differ from every other error.
 *   2. WHAT YOU CAN DO — an action, not a shrug.
 *   3. YOUR CREDITS    — answered on every single error, including the ones
 *                        that never touched credits, because an unanswered
 *                        "did that cost me anything" reads as "yes".
 */
export function failureParts(
  t: Translate,
  code: ErrorCode,
  status: number,
  creditsRefunded: boolean | undefined,
  retryAt?: string,
  locale?: string
): FailureText {
  const outcome: CreditOutcome = creditOutcomeForStatus(status, creditsRefunded);
  const what = t(`codes.${code}.what`);
  // A limit that knows when it opens again says that time; without it, its
  // own sentence names the window (an hour, a day), never «a minute».
  const opens = isTimedLimitCode(code) && retryAt && locale ? retryTime(retryAt, locale) : null;
  const next = opens ? t("retryAt", opens) : t(`codes.${code}.next`);
  const credits = t(`credits.${outcome}`);

  return {
    what,
    next,
    credits,
    showCreditHistory: outcome === "unverified" || outcome === "charged",
    text: `${what} ${next} ${credits}`,
  };
}

