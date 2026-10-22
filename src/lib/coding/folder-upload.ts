/**
 * "ΑΝΕΒΑΣΜΑ ΦΑΚΕΛΟΥ" — THE BUDGET A LOCAL UPLOAD SPENDS ON ITS OWN.
 *
 * The owner's message right after #332, 2026-10-22, part 1α: a button
 * beside the GitHub ones that reads a folder of local files straight
 * into the conversation, no GitHub App required (this is File.text() in
 * the browser, not a repository).
 *
 * BINARY FILES ARE SKIPPED BY EXTENSION, not sniffed — a heuristic that
 * reads every file's first bytes to guess text-vs-binary is exactly the
 * kind of probe this codebase's own CLAUDE.md warns against (a check
 * that is usually right looks identical to one that is reliably right).
 * A denylist of the common binary kinds a repo folder actually contains
 * is the honest version: wrong only for an unusual extension, and wrong
 * by SKIPPING it, never by feeding binary bytes into a prompt.
 *
 * THE CAP IS HALF of MAX_INPUT_CHARS (lib/coding/operations.ts), not all
 * of it — a folder with nothing left over to combine with the next
 * remark is a folder that fails the very first edit a person tries,
 * which is a worse result than trimming the upload itself and saying so.
 */
import { MAX_INPUT_CHARS } from "@/lib/coding/operations";

export const FOLDER_UPLOAD_CHAR_BUDGET = Math.floor(MAX_INPUT_CHARS / 2);
export const FOLDER_UPLOAD_MAX_FILES = 60;
/** Per file; a single huge generated file is as useless to paste as a binary one. */
export const FOLDER_UPLOAD_MAX_FILE_BYTES = 200_000;

const SKIPPED_EXTENSIONS = new Set([
  "png", "jpg", "jpeg", "gif", "webp", "avif", "ico", "bmp", "svg",
  "mp3", "mp4", "mov", "webm", "wav", "ogg",
  "woff", "woff2", "ttf", "otf", "eot",
  "zip", "tar", "gz", "rar", "7z",
  "pdf", "doc", "docx", "xls", "xlsx", "ppt", "pptx",
  "exe", "dll", "so", "dylib", "bin", "wasm",
  "pyc", "class", "o", "a",
  "lock",
]);

/** The directories no reading of a real repo's source wants dragged in. */
const SKIPPED_PATH_SEGMENTS = new Set(["node_modules", ".git", ".next", "dist", "build", "__pycache__", "vendor"]);

export type UploadedFile = { path: string; text: string };

export function isSkippedPath(path: string): boolean {
  const segments = path.split("/");
  if (segments.some((segment) => SKIPPED_PATH_SEGMENTS.has(segment))) return true;
  const last = segments[segments.length - 1] ?? "";
  const dot = last.lastIndexOf(".");
  if (dot <= 0) return false;
  return SKIPPED_EXTENSIONS.has(last.slice(dot + 1).toLowerCase());
}

/**
 * Folds a set of already-read files into one block for the next turn,
 * truncated to the budget. Pure — the caller does the actual file
 * reading (File.text() has no synchronous, testable equivalent here).
 */
export function foldUploadedFiles(files: readonly UploadedFile[]): { text: string; includedCount: number; truncated: boolean } {
  const included = files.slice(0, FOLDER_UPLOAD_MAX_FILES);
  const truncatedByCount = files.length > included.length;

  let remaining = FOLDER_UPLOAD_CHAR_BUDGET;
  const parts: string[] = [];
  let includedCount = 0;
  let truncatedByBudget = false;
  for (const file of included) {
    const block = `// FILE: ${file.path}\n${file.text}`;
    if (block.length > remaining) {
      truncatedByBudget = true;
      break;
    }
    parts.push(block);
    remaining -= block.length;
    includedCount += 1;
  }

  return { text: parts.join("\n\n"), includedCount, truncated: truncatedByCount || truncatedByBudget };
}

/**
 * READS THE BROWSER'S FileList INTO TEXT, skipping anything binary or
 * oversized by the rules above. Not unit-testable (File.text() has no
 * synchronous equivalent in Node) — coding.test.mjs covers the pure half,
 * foldUploadedFiles, with hand-built UploadedFile objects instead.
 */
export async function readUploadedFolder(fileList: FileList): Promise<UploadedFile[]> {
  const files: UploadedFile[] = [];
  for (const file of Array.from(fileList)) {
    const relativePath = (file as File & { webkitRelativePath?: string }).webkitRelativePath || file.name;
    if (isSkippedPath(relativePath)) continue;
    if (file.size > FOLDER_UPLOAD_MAX_FILE_BYTES) continue;
    try {
      const text = await file.text();
      if (text.includes("\u0000")) continue; // a binary file an extension did not catch
      files.push({ path: relativePath, text });
    } catch {
      // unreadable; skipped rather than failing the whole upload
    }
  }
  return files;
}
