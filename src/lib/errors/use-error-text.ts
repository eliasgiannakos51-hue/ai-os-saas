"use client";

import { useCallback } from "react";
import { useLocale, useTranslations } from "next-intl";
import { ApiError, isApiError } from "./api-error";
import { codeForStatus, isTimedLimitCode } from "./error-codes";
import { failureParts, type FailureText } from "./failure-text";

export type { FailureText } from "./failure-text";

/** Turn whatever a catch block caught into the three sentences. */
// STABLE ACROSS RENDERS, on purpose. Callers put `describe` inside effects
// that report a failed query, and a function rebuilt on every render makes
// every such effect re-run on every render — or, worse, gets left out of
// the dependency array to stop that, which is how an effect ends up holding
// a stale closure. It depends on nothing but the translator.
export function useErrorText() {
  const t = useTranslations("errors");
  const locale = useLocale();

  return useCallback(
    function describe(error: unknown, options?: { spends?: boolean }): FailureText {
      const spends = options?.spends !== false;
      if (isApiError(error)) {
        return failureParts(t, error.code, error.status, error.creditsRefunded, error.retryAt, locale, spends);
      }
      // Anything that is not an ApiError never reached — or never came back
      // from — a route: a thrown TypeError from fetch, a rejected promise, a
      // bug in a handler. Status 0 keeps the credit answer honest, because
      // a request that never arrived cannot have been charged.
      return failureParts(t, "offline", 0, undefined, undefined, undefined, spends);
    },
    [t, locale]
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

/**
 * A LIMIT A ROUTE NAMED, SAID WITH ITS TIME — or null, for the screen to
 * say anything else its own way (2026-10-14).
 *
 * For the screens that read a refusal's body themselves: a route that
 * passes on what lib/ai-circuit-breaker.ts says (`code` one of
 * TIMED_LIMIT_CODES, and `retryAt`) is said here — the limit, its window or
 * the time it opens again, and that nothing was charged — instead of the
 * route's English `message`, which those screens showed as it came.
 */
export function useLimitText() {
  const describe = useErrorText();
  return useCallback(
    (body: unknown): string | null => {
      const value = body && typeof body === "object" ? (body as Record<string, unknown>) : null;
      if (!isTimedLimitCode(value?.code)) return null;
      return describe(new ApiError(429, { code: value.code, retryAt: typeof value.retryAt === "string" ? value.retryAt : undefined })).text;
    },
    [describe]
  );
}
