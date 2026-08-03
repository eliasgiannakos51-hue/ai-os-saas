// Pure, dependency-free find-and-replace logic for Website Builder's
// cheap-edit-patch cost optimization (lib/website-builder.ts's
// tryApplySimpleEdit) — extracted into its own file, without a
// "server-only" guard, so the actual safety logic (exactly-once-match
// requirement) is directly unit-testable without a live Anthropic call,
// same split as lib/website-image-placeholders.ts and
// lib/clarification-client.ts earlier this pass.

// Returns the patched string, or null if the patch should NOT be
// applied: findText is empty/whitespace-only, or doesn't occur in html
// EXACTLY once. An ambiguous (2+ matches) or missing (0 matches) patch
// is never guessed at — the caller falls back to full regeneration in
// either case, since silently applying a possibly-wrong patch would be
// worse than paying for a full, correct regeneration.
export function applyExactReplace(html: string, findText: string, replaceText: string): string | null {
  if (!findText.trim()) return null;
  const occurrences = html.split(findText).length - 1;
  if (occurrences !== 1) return null;
  return html.split(findText).join(replaceText);
}
