"use client";

import { useCallback } from "react";
import { useTranslations } from "next-intl";

/**
 * WHAT A GREEK USER SEES WHEN VOICE REFUSES.
 *
 * The voice routes answer with BOTH a stable `code` and an English
 * sentence. The sentence is the API's own answer — useful in a log, in a
 * curl, in a bug report — and it is not what somebody reading the app in
 * Japanese should be shown. So the code is what the UI translates, and
 * the English prose is only the fallback for a code this build has no
 * word for yet.
 *
 * That ordering is deliberate: a NEW code shipped by a newer server
 * against an older client degrades to a specific English sentence rather
 * than to a generic one, which is the better of the two failures.
 */
export function useVoiceErrorText() {
  const t = useTranslations("voice.errors");
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
