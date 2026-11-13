/**
 * WHY A SHARED FILE WAS REFUSED, AS A CODE (2026-11-05 review, A12).
 *
 * src/app/share/route.ts sends the phone's share sheet on to
 * /dashboard/files with the outcome in the query string. The reason used
 * to travel as the refusal's own sentence, and the page put whatever the
 * address said inside a notice the app draws as its own. An address can
 * be written by anybody, so the reason now travels as one of the refusal
 * STAGES the ingest already names (IngestStage, lib/files/ingest.ts), and
 * each screen says that stage's sentence from its own translations. Any
 * other value — free text included — is ignored.
 *
 * Read by components/files/files-workspace.tsx and
 * components/analyze/analyze-shell.tsx; scripts/tests/share-target.test.mjs
 * holds this list equal to IngestStage.
 */
export const SHARE_REASON_CODES = ["size", "type", "file_cap", "storage_cap", "storage_upload", "insert_row"] as const;

export type ShareReasonCode = (typeof SHARE_REASON_CODES)[number];

/** The four sentences a refusal can be told in (dashboard.files.sharedReasons.*). */
export type ShareReasonMessage = "size" | "type" | "limit" | "stored";

/** The sentence for a code from the address bar, or null for anything that is not one. */
export function shareReasonMessage(raw: string | null): ShareReasonMessage | null {
  switch (raw) {
    case "size":
      return "size";
    case "type":
      return "type";
    case "file_cap":
    case "storage_cap":
      return "limit";
    case "storage_upload":
    case "insert_row":
      return "stored";
    default:
      return null;
  }
}

/**
 * The sentence itself, from the caller's `dashboard.files` translator.
 * One literal key per message, so the page's message slice can see them.
 */
export function sharedReasonText(t: (key: string) => string, reason: ShareReasonMessage): string {
  switch (reason) {
    case "size":
      return t("sharedReasons.size");
    case "type":
      return t("sharedReasons.type");
    case "limit":
      return t("sharedReasons.limit");
    case "stored":
      return t("sharedReasons.stored");
  }
}
