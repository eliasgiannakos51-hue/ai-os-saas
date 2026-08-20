"use client";

import { useCallback } from "react";
import { useTranslations } from "next-intl";
import { isApiError } from "./api-error";
import { codeForStatus, creditOutcomeForStatus, type CreditOutcome, type ErrorCode } from "./error-codes";

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

type Translate = (key: string) => string;

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
function failureParts(
  t: Translate,
  code: ErrorCode,
  status: number,
  creditsRefunded: boolean | undefined
): FailureText {
  const outcome: CreditOutcome = creditOutcomeForStatus(status, creditsRefunded);
  const what = t(`codes.${code}.what`);
  const next = t(`codes.${code}.next`);
  const credits = t(`credits.${outcome}`);

  return {
    what,
    next,
    credits,
    showCreditHistory: outcome === "unverified" || outcome === "charged",
    text: `${what} ${next} ${credits}`,
  };
}

/** Turn whatever a catch block caught into the three sentences. */
// STABLE ACROSS RENDERS, on purpose. Callers put `describe` inside effects
// that report a failed query, and a function rebuilt on every render makes
// every such effect re-run on every render — or, worse, gets left out of
// the dependency array to stop that, which is how an effect ends up holding
// a stale closure. It depends on nothing but the translator.
export function useErrorText() {
  const t = useTranslations("errors");

  return useCallback(
    function describe(error: unknown): FailureText {
      if (isApiError(error)) {
        return failureParts(t, error.code, error.status, error.creditsRefunded);
      }
      // Anything that is not an ApiError never reached — or never came back
      // from — a route: a thrown TypeError from fetch, a rejected promise, a
      // bug in a handler. Status 0 keeps the credit answer honest, because
      // a request that never arrived cannot have been charged.
      return failureParts(t, "offline", 0, undefined);
    },
    [t]
  );
}

/**
 * The same mapping for the call sites that have a status number rather than
 * a thrown ApiError — a `if (!res.ok)` branch that has not been migrated to
 * requestJson yet.
 */
export function useErrorTextForStatus() {
  const t = useTranslations("errors");
  return useCallback(
    (status: number, creditsRefunded?: boolean): FailureText =>
      failureParts(t, codeForStatus(status), status, creditsRefunded),
    [t]
  );
}
