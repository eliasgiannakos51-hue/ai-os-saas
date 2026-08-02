// Shared between the server (lib/website-builder.ts — rejects a
// truncated/incomplete AI response before ever saving it) and the client
// (website-builder-workspace.tsx — guards the iframe preview against
// rendering a blank/broken page for any row that somehow has incomplete
// content already saved). No "server-only" here, both sides need it.
//
// A real single-file website generation can legitimately run long (a lot
// of inline CSS + copy), so a very long detailed description can push the
// model's output right up against — or past — its token limit. When that
// happens mid-document, the response gets cut off before its closing
// </html>, and browsers render that as a mostly-blank page rather than a
// clear error, which is the bug this file exists to prevent.
export function looksLikeCompleteHtmlDocument(html: string): boolean {
  const trimmed = html.trim();
  if (trimmed.length < 100) return false;
  const startsOk = /^<!doctype html/i.test(trimmed) || /^<html[\s>]/i.test(trimmed);
  const endsOk = /<\/html>\s*$/i.test(trimmed);
  return startsOk && endsOk;
}
