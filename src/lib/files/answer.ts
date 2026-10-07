export type WorkspaceFile = {
  id: string;
  filename: string;
  file_type: string;
  size_bytes: number;
  page_count: number | null;
  char_count: number;
  processing_status: "pending" | "processing" | "ready" | "failed";
  error: string | null;
  uploaded_at: string;
};

export type WorkspaceCollection = {
  id: string;
  name: string;
  description: string | null;
  fileIds: string[];
};

export type Citation = { filename: string; label: string };

/**
 * What "copy the answer" puts on the clipboard.
 *
 * The answer plus its sources, not the answer alone. Every claim in the
 * text carries an inline [file, page] reference that was CHECKED against
 * the pages the model was shown; pasting the prose without the list
 * behind it turns a verifiable answer into an assertion, and the person
 * it is pasted to has no way back to the document.
 */
export function answerForClipboard(answer: Answer): string {
  if (answer.citations.length === 0) return answer.text;
  const sources = answer.citations.map((c) => `- ${c.filename} — ${c.label}`).join("\n");
  return `${answer.text}\n\n${sources}`;
}

export type Answer = {
  text: string;
  fromDocuments: boolean;
  citations: Citation[];
  removedCitations: number;
  skippedFiles: string[];
  truncated: boolean;
  /** How many passes the documents took to read. 1 for almost every
   *  question; more means the answer was combined from parts. */
  parts: number;
  credits: number;
  disclosure: string;
  /** The job that produced it, carried so the answer can report itself
   *  seen. An answer the user has read must not be offered back to them
   *  on the next visit as if it were new. */
  jobId: string | null;
};

/**
 * One answer, built the same way whether it arrived on this page or is
 * being picked back up from a job that finished while the user was
 * elsewhere.
 *
 * Shared because the resumed path is the one that matters and the one
 * nobody looks at: if it drifted from the inline path, the answer a user
 * came back for would be missing its citations or its "not in your
 * documents" warning — quietly, and only for people who navigated away.
 */
export function answerFromResult(
  result: Record<string, unknown>,
  credits: number,
  jobId: string | null
): Answer {
  return {
    text: String(result.answer ?? ""),
    fromDocuments: Boolean(result.answeredFromDocuments),
    citations: (result.citations ?? []) as Citation[],
    removedCitations: Number(result.removedCitations ?? 0),
    skippedFiles: (result.skippedFiles ?? []) as string[],
    truncated: Boolean(result.truncated),
    // The multi-pass ask stitches an answer out of N passes and says so.
    // Here rather than at the inline call site, or a resumed answer would
    // silently claim to have read the whole document in one go.
    parts: Number(result.parts ?? 1),
    credits,
    disclosure: String(result.disclosure ?? ""),
    jobId,
  };
}
