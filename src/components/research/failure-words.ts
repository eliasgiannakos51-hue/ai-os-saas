"use client";

import { useMemo } from "react";
import { useTranslations } from "next-intl";
import { isStoppedMessage } from "@/lib/stop-message";
import { researchFailure, researchRefusal } from "@/lib/research/failure";
import { ApiError } from "@/lib/errors/api-error";
import { isTimedLimitCode, type ApiErrorPayload } from "@/lib/errors/error-codes";
import { useErrorText } from "@/lib/errors/use-error-text";

/**
 * WHAT GOES WRONG IN RESEARCH, IN THE READER'S LANGUAGE (the package check
 * of 2026-10-08), for the Research shell and the Research page alike: a
 * plan or a start that was refused, and a report that failed
 * (lib/research/failure.ts). Every key is written out, so each sentence is
 * one the messages files hold.
 */
export function useResearchFailureWords() {
  const t = useTranslations("dashboard.deepResearch");
  const tSteps = useTranslations("aiSteps");
  const describe = useErrorText();
  // One object per translator, so an effect that lists it does not re-run
  // on every render (the Research poll does).
  return useMemo(() => ({
    /** A refused plan (`fallback` "plan") or start ("run"). */
    refused(body: { insufficientCredits?: unknown; limitReached?: unknown; code?: unknown; retryAt?: unknown } | null, status: number, fallback: "plan" | "run"): string {
      switch (researchRefusal(body, status)) {
        case "noCredits":
          return t("refused.noCredits");
        case "capReached":
          return t("capReached");
        case "rateLimited":
          // An AI limit by its own name and the time it opens again, when
          // the route sends them (lib/ai-circuit-breaker.ts, 2026-10-14).
          return isTimedLimitCode(body?.code)
            ? describe(new ApiError(429, body as ApiErrorPayload)).text
            : t("refused.rateLimited");
        case "unavailable":
          return t("refused.unavailable");
        default:
          return fallback === "plan" ? t("planError") : t("runError");
      }
    },
    /** A failed report's stored reason, or the screen's own sentence when it gives none we know. */
    failed(error: string | null | undefined): string {
      if (isStoppedMessage(error)) return tSteps("stopped");
      switch (researchFailure(error)) {
        case "noFindings":
          return t("failed.noFindings");
        case "unavailable":
          return t("failed.unavailable");
        case "notWritten":
          return t("failed.notWritten");
        case "interrupted":
          return t("failed.interrupted");
        case "notStarted":
          return t("failed.notStarted");
        case "noCredits":
          return t("failed.noCredits");
        default:
          return t("runError");
      }
    },
  }), [t, tSteps, describe]);
}
