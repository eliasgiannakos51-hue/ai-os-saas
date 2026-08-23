"use client";

import { useCallback } from "react";
import { useTranslations } from "next-intl";

/**
 * WHAT A GREEK TRADER SEES WHEN A RULE WILL NOT SAVE.
 *
 * The routes answer with a stable `code` AND an English sentence. The
 * sentence is the API's own answer — useful in a log, in a curl, in a bug
 * report — and it is not what somebody reading the app in Japanese should
 * be shown. So the code is what the UI translates, and the prose is the
 * fallback for a code this build has no word for.
 *
 * Same shape as components/voice/use-voice-error-text.ts, and the same
 * reason: a new code shipped by a newer server against an older client
 * degrades to a specific English sentence rather than a generic one.
 */
export function useTradingErrorText() {
  const t = useTranslations("dashboard.trading.errors");
  return useCallback(
    (data: { code?: unknown; error?: unknown } | null | undefined): string => {
      const code = typeof data?.code === "string" ? data.code : null;
      if (code && t.has(code)) return t(code);
      const prose = typeof data?.error === "string" ? data.error.trim() : "";
      return prose || t("failed");
    },
    [t]
  );
}
