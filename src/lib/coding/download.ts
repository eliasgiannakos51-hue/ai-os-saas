/**
 * «ΛΗΨΗ» NEXT TO «ΑΝΤΙΓΡΑΦΗ» (the owner's critical message, 2026-10-22):
 * the same Blob-and-anchor trick every other download button in this
 * product already uses (dashboard/images, dashboard/documents' PDF),
 * applied to plain text instead of a binary file.
 */
const EXTENSION_FOR_LANGUAGE: Record<string, string> = {
  typescript: "ts", javascript: "js", python: "py", go: "go", rust: "rs",
  php: "php", sql: "sql", json: "json", bash: "sh", html: "html",
  css: "css", markdown: "md", yaml: "yml",
};

/** A sensible download name when the file has none of its own (a
 *  generated answer, a paste) — the detected language's own extension,
 *  or a bare ".txt" when nothing was detected. */
export function suggestedFileName(path: string | null, language: string | null): string {
  if (path) return path.split("/").pop() || "code.txt";
  const ext = (language && EXTENSION_FOR_LANGUAGE[language]) || "txt";
  return `code.${ext}`;
}

export function downloadTextFile(content: string, fileName: string): void {
  const blob = new Blob([content], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  a.click();
  // Deferred: Safari has dropped a revoke called in the same tick before
  // the click's own navigation reads the URL.
  setTimeout(() => URL.revokeObjectURL(url), 0);
}
