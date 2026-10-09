"use client";

import { useMemo } from "react";
import { useTranslations } from "next-intl";
import { askFailure } from "@/lib/files/ask-failure";
import { unreadableReason, type UploadRefusal } from "@/lib/files/refusal-words";
import { MAX_FILE_BYTES, formatBytes } from "@/lib/files/file-types";

/**
 * WHAT GOES WRONG IN FILES, IN THE READER'S LANGUAGE (the package check of
 * 2026-10-08), for the Files shell and the Files page alike: a question
 * that got no answer (lib/files/ask-failure.ts), an upload that was refused
 * and a file that could not be read (lib/files/refusal-words.ts). Every
 * key is written out, so each sentence is one the messages files hold.
 */
export function useFilesFailureWords() {
  const t = useTranslations("dashboard.files");
  return useMemo(() => ({
    ask(outcome: { code: string | null; jobId?: string | null }): string {
      switch (askFailure(outcome)) {
        case "askStillRunning":
          return t("askStillRunning");
        case "askStalled":
          return t("askStalled");
        case "askNoCredits":
          return t("askNoCredits");
        case "askRateLimited":
          return t("askRateLimited");
        case "askFailed":
          return t("askFailed");
        default:
          return t("askError");
      }
    },
    refused(refusal: UploadRefusal, name: string): string {
      switch (refusal) {
        case "uploadFileCap":
          return t("uploadFileCap");
        case "uploadStorageCap":
          return t("uploadStorageCap");
        case "uploadRateLimited":
          return t("uploadRateLimited");
        case "unsupportedType":
          return t("unsupportedType", { name });
        case "emptyFile":
          return t("emptyFile", { name });
        case "tooLarge":
          return t("tooLarge", { name, max: formatBytes(MAX_FILE_BYTES) });
        case "tooLargeForTransfer":
          return t("tooLargeForTransfer");
        default:
          return t("uploadError");
      }
    },
    /** A stored file's reason, or the screen's own sentence when it gives none we know. */
    unreadable(error: string | null | undefined, fallback: string): string {
      switch (unreadableReason(error)) {
        case "scan":
          return t("unreadable.scan");
        case "encoding":
          return t("unreadable.encoding");
        case "locked":
          return t("unreadable.locked");
        case "empty":
          return t("unreadable.empty");
        default:
          return fallback;
      }
    },
  }), [t]);
}
