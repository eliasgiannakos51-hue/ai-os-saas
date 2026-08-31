// What may be uploaded, and how we decide.
//
// Client-safe: the upload widget needs the same list the server enforces,
// and two copies of an allowlist is how a "supported" file becomes a 400
// after the user waited for a 19MB upload.
//
// The single most important rule in this file: the browser's
// Content-Type is a HINT, and so is the extension. Both are supplied by
// whoever is uploading. `sniffFileType` decides from the first bytes, and
// the server trusts nothing else.

export type FileKind = "pdf" | "docx" | "xlsx" | "txt" | "csv" | "md";

export const FILE_KINDS: FileKind[] = ["pdf", "docx", "xlsx", "txt", "csv", "md"];

/** The PRIVATE bucket. Named once so no route can typo its way into a
 *  different, possibly public, one. Lives in this client-safe file (and is
 *  re-exported by the server-only store.ts) because the browser now writes
 *  to the bucket directly: routing 20MB through a serverless function
 *  never worked — the host refuses request bodies over ~4.5MB before the
 *  route runs — so the byte transfer has to happen client → storage. */
export const FILE_BUCKET = "user-files";

/** 20MB, as specified. Enforced before a single byte is written. */
export const MAX_FILE_BYTES = 20 * 1024 * 1024;

/** PDF pages we will extract. Beyond this the file uploads and stores
 *  fine, but only the first N pages become answerable text — and the UI
 *  says so rather than pretending the rest was read. */
export const MAX_PDF_PAGES = 50;

/** Longest filename we will store, after sanitising. */
export const MAX_FILENAME_LENGTH = 180;

/**
 * Extracted text we keep per file.
 *
 * Not a storage limit — it is a HONESTY limit. Anything past this cannot
 * be cited, so storing it would let the UI claim a 900-page manual is
 * "ready" while three-quarters of it is unreachable.
 */
export const MAX_EXTRACTED_CHARS = 600_000;

/** Files that may be selected for one "Ask my documents" question.
 *  Client-safe because the ask panel warns BEFORE the request when too
 *  many are ticked, and a limit the UI does not know is a limit the user
 *  only meets as a 400. */
export const MAX_FILES_PER_QUESTION = 20;

/** Longest question. Same reason as above — the textarea enforces it.
 *
 *  WAS 2,000, which is about 300 words. That is plenty for a question
 *  and nowhere near enough for the thing people actually paste in: a
 *  clause, a spec, a competitor's terms, followed by "how does this
 *  compare to what my documents say". Those were rejected outright with
 *  a 400 — the one shape of input a document-questioning tool has the
 *  least excuse for refusing.
 *
 *  20,000 characters is roughly 5,000 tokens, which is noise next to the
 *  400,000 characters of document text a single pass already carries. It
 *  is not free — it is charged like any other input — but the cost is the
 *  reason to SHOW it, not to refuse it. */
export const MAX_QUESTION_CHARS = 20_000;

/** Decompressed bytes we will accept out of a single DOCX/XLSX entry.
 *  A 20MB zip can expand to gigabytes; this is the ceiling that makes
 *  that a rejected upload instead of an out-of-memory crash. */
export const MAX_UNZIPPED_BYTES = 120 * 1024 * 1024;

export const ACCEPTED_EXTENSIONS: Record<FileKind, string[]> = {
  pdf: [".pdf"],
  docx: [".docx"],
  xlsx: [".xlsx"],
  txt: [".txt"],
  csv: [".csv"],
  md: [".md", ".markdown"],
};

/** The `accept` attribute for the file input — extensions only, because
 *  browsers disagree about the MIME type of .md and .csv. */
export const ACCEPT_ATTRIBUTE = Object.values(ACCEPTED_EXTENSIONS).flat().join(",");

export function extensionOf(filename: string): string {
  const dot = filename.lastIndexOf(".");
  return dot === -1 ? "" : filename.slice(dot).toLowerCase();
}

/** The kind an extension SUGGESTS. Advisory only — see sniffFileType. */
export function kindFromExtension(filename: string): FileKind | null {
  const ext = extensionOf(filename);
  for (const kind of FILE_KINDS) {
    if (ACCEPTED_EXTENSIONS[kind].includes(ext)) return kind;
  }
  return null;
}

/**
 * Strip a filename down to something safe to store and display.
 *
 * It is NEVER used to build a path — the storage path is
 * `<user_id>/<uuid>.<ext>` precisely so that no amount of creativity in a
 * filename can reach another user's folder. This function exists for the
 * other two risks: control characters that corrupt a log line, and a name
 * long enough to be a denial-of-service against a list view.
 */
export function sanitiseFilename(raw: string): string {
  // Path separators first: a name like "../../etc/passwd" is not going to
  // traverse anything here, but storing it invites a future reader to
  // assume it is safe to join.
  const base = raw.split(/[\\/]/).pop() ?? "";
  const cleaned = base
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u001f\u007f]/g, "")
    // An UNPAIRED surrogate half is as unstorable as NUL: JSON-serialised
    // it becomes an escape Postgres rejects (22P05) — the same crash the
    // extracted text needed guarding against, on the same insert.
    .replace(/[\uD800-\uDBFF](?![\uDC00-\uDFFF])/g, "")
    .replace(/(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/g, "")
    .replace(/\s+/g, " ")
    .trim();
  if (!cleaned) return "untitled";
  if (cleaned.length <= MAX_FILENAME_LENGTH) return cleaned;
  const ext = extensionOf(cleaned);
  return cleaned.slice(0, MAX_FILENAME_LENGTH - ext.length) + ext;
}

/**
 * Decide the kind from the CONTENT.
 *
 * PDF, DOCX and XLSX all have unambiguous magic numbers, so for those
 * three the answer is a fact rather than a claim. The plain-text kinds
 * have no magic number at all, which is exactly why they are the ones
 * where we fall back to the extension — and why a file that merely CLAIMS
 * to be .txt is still validated as UTF-8-decodable text before it is
 * accepted (see `looksLikeText`).
 *
 * Returning null means "not something we support", and the caller must
 * refuse rather than guess.
 */
export function sniffFileType(bytes: Uint8Array, filename: string): FileKind | null {
  // %PDF-
  if (bytes.length >= 5 && bytes[0] === 0x25 && bytes[1] === 0x50 && bytes[2] === 0x44 && bytes[3] === 0x46 && bytes[4] === 0x2d) {
    return "pdf";
  }

  // PK\x03\x04 — a ZIP. DOCX and XLSX are both ZIPs, and so is a JAR, an
  // APK and an ODT. The extension picks between the two we support; the
  // extractor then fails loudly if the expected part is not inside.
  if (bytes.length >= 4 && bytes[0] === 0x50 && bytes[1] === 0x4b && bytes[2] === 0x03 && bytes[3] === 0x04) {
    const suggested = kindFromExtension(filename);
    return suggested === "docx" || suggested === "xlsx" ? suggested : null;
  }

  const suggested = kindFromExtension(filename);
  if (suggested === "txt" || suggested === "csv" || suggested === "md") {
    return looksLikeText(bytes) ? suggested : null;
  }
  return null;
}

/**
 * Is this plausibly text?
 *
 * A NUL byte in the first few KB is the classic, cheap tell that somebody
 * renamed a binary to .txt. Not a security boundary on its own — the
 * extractors never execute anything — but it stops us storing a renamed
 * executable and calling it a document.
 */
export function looksLikeText(bytes: Uint8Array): boolean {
  const sample = bytes.subarray(0, 8192);
  for (let i = 0; i < sample.length; i++) {
    if (sample[i] === 0) return false;
  }
  return true;
}

export function formatBytes(n: number): string {
  // A DASH BEATS A NUMBER NOBODY MEASURED, and this function was the one
  // place in the product that broke that rule.
  //
  // Every comparison against NaN is false, so a non-finite input fell
  // through all three branches to the last one and rendered
  // `NaN.toFixed(2)` — the string "NaN GB", in the files list, for any
  // row whose size_bytes column is null. formatCurrency and formatNumber
  // in lib/format-number.ts both guard this; this did not, and nothing
  // called it at a boundary to find out.
  //
  // NEGATIVES ARE LEFT ALONE deliberately: website-builder passes a
  // remaining-quota figure that is meaningfully negative when an account
  // is over cap, and "-500 MB" is the honest rendering of that.
  if (!Number.isFinite(n)) return "—";
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  if (n < 1024 * 1024 * 1024) return `${(n / (1024 * 1024)).toFixed(1)} MB`;
  return `${(n / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}
