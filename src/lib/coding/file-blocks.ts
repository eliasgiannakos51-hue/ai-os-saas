/**
 * THE SHAPE A CODING REPLY TAKES, PARSED OUT OF PLAIN TEXT.
 *
 * There is no tool-calling or structured-output path in this codebase's
 * AI layer (src/lib/ai/providers/complete.ts takes a system/user string
 * pair and returns a string back — see runCompletion). Rather than add
 * one for Coding alone, the model is told, in the system prompt
 * (coding-prompt.ts), to wrap each file it writes in a marker pair:
 *
 *   <<<IONEXA_FILE:path/to/file.ext>>>
 *   ...the file's full, new content...
 *   <<<IONEXA_END>>>
 *
 * and to write any explanation OUTSIDE those markers, as ordinary prose.
 * parseReply splits the two apart. The markers are deliberately
 * unlikely to occur inside real code or inside a paste of someone else's
 * marked-up text — `<<<` three times over is not a sequence any
 * mainstream language uses as syntax.
 *
 * WHAT THIS DOES NOT DO: trust the model to leave every OTHER file
 * alone. A scoped single-file edit (coding-prompt.ts's buildEditPrompt)
 * asks for exactly one block back, but the merge that turns a parsed
 * reply into the conversation's next file snapshot is the caller's job
 * (api/coding/send/route.ts) — it keeps every path this parser did NOT
 * return, and only the model's own path list decides what to call
 * "written", not whatever fraction of the file set the model repeated.
 *
 * Pure. scripts/tests/coding-file-blocks.test.mjs runs this directly.
 */

const OPEN = "<<<IONEXA_FILE:";
const OPEN_END = ">>>";
const CLOSE = "<<<IONEXA_END>>>";

export type ParsedFile = { path: string; content: string };
export type ParsedReply = { prose: string; files: ParsedFile[] };

/** A path the model wrote is used as-is only after this passes. Rejects
 *  the same shapes the rest of this app already refuses to store as a
 *  filename: empty, a bare `.` segment, a leading slash (this is a
 *  virtual file set with no root to escape), or a `..` segment — the
 *  model has no filesystem to read, so this is not a traversal defence,
 *  it is "do not let the file tabs render a path nobody can make sense
 *  of as a path." */
export function isValidFilePath(path: string): boolean {
  const trimmed = path.trim();
  if (!trimmed || trimmed.length > 300) return false;
  if (trimmed.startsWith("/") || trimmed.includes("\\")) return false;
  const segments = trimmed.split("/");
  return segments.every((s) => s.length > 0 && s !== "." && s !== "..");
}

export function parseReply(text: string): ParsedReply {
  const files: ParsedFile[] = [];
  const seen = new Set<string>();
  let prose = "";
  let i = 0;
  while (i < text.length) {
    const openAt = text.indexOf(OPEN, i);
    if (openAt === -1) {
      prose += text.slice(i);
      break;
    }
    prose += text.slice(i, openAt);
    const headerEnd = text.indexOf(OPEN_END, openAt + OPEN.length);
    if (headerEnd === -1) {
      // An opening marker with no closing `>>>` at all — not a block,
      // the rest is prose. A reply cut off mid-header (the model hit its
      // token ceiling) reads as an unfinished sentence rather than as a
      // file nobody can open.
      prose += text.slice(openAt);
      break;
    }
    const rawPath = text.slice(openAt + OPEN.length, headerEnd).trim();
    const closeAt = text.indexOf(CLOSE, headerEnd + OPEN_END.length);
    if (closeAt === -1) {
      // Opened but never closed — same reasoning: the partial block's
      // own text becomes prose rather than a file with no known end.
      prose += text.slice(openAt);
      break;
    }
    // THE ONE NEWLINE RIGHT AFTER THE HEADER IS THE MARKER'S OWN, NOT
    // THE FILE'S. Without this every file would start with a blank
    // line that was never actually in it.
    let contentStart = headerEnd + OPEN_END.length;
    if (text[contentStart] === "\n") contentStart++;
    else if (text[contentStart] === "\r" && text[contentStart + 1] === "\n") contentStart += 2;
    let content = text.slice(contentStart, closeAt);
    // AND THE NEWLINE RIGHT BEFORE THE CLOSING MARKER IS THE MARKER'S
    // OWN TOO, the one the model writes on its own line before
    // `<<<IONEXA_END>>>` so the marker is never glued to code.
    if (content.endsWith("\r\n")) content = content.slice(0, -2);
    else if (content.endsWith("\n")) content = content.slice(0, -1);

    if (isValidFilePath(rawPath) && !seen.has(rawPath)) {
      seen.add(rawPath);
      files.push({ path: rawPath, content });
    }
    i = closeAt + CLOSE.length;
  }
  return { prose: prose.trim(), files };
}

/** The other direction, used only by the stand-in model in tests — the
 *  real model is prompted in prose, never calls this. Kept here, next
 *  to the parser it has to round-trip through, rather than duplicated
 *  in test fixtures where it could drift from what parseReply expects. */
export function formatFileBlock(file: ParsedFile): string {
  return `${OPEN}${file.path}${OPEN_END}\n${file.content}\n${CLOSE}`;
}

/**
 * "WHAT EXISTS RIGHT NOW", from a conversation's turns.
 *
 * Each assistant turn's `files` is a PATCH (supabase/migrations/
 * 20261025000000_coding_conversations.sql explains why) — exactly what
 * that turn wrote or changed, nothing it left alone. This is the one
 * place that folds a sequence of patches into the current file set, so
 * the API route (building the next prompt) and the UI (drawing the file
 * tabs) read the same answer rather than two reimplementations that can
 * drift. Oldest first; the last write to a path wins.
 */
export function reduceFiles(turns: readonly { files: readonly ParsedFile[] | null }[]): ParsedFile[] {
  const byPath = new Map<string, string>();
  const order: string[] = [];
  for (const turn of turns) {
    for (const file of turn.files ?? []) {
      if (!byPath.has(file.path)) order.push(file.path);
      byPath.set(file.path, file.content);
    }
  }
  return order.map((path) => ({ path, content: byPath.get(path) ?? "" }));
}
