/**
 * WHAT A FLAGGED SITE'S STORED MESSAGE MAY PUT ON A SCREEN.
 *
 * The generation worker (src/app/api/websites/generate/process/route.ts)
 * stores one English sentence in user_websites.error_message when the
 * safety review holds a site: what the review found, then what to do next.
 * Until 2026-10-05 the second half read "You can regenerate it once at no
 * extra charge", and the regeneration was charged like any other
 * (docs/BUGS.md ΛΘ-7, docs/SECURITY-AUDIT.md ΑΣ-4.10). The worker stopped
 * writing that, but rows written before still hold it, and the screen
 * showed the stored sentence word for word — beside a button that says its
 * price, and in English on a Greek screen.
 *
 * So a screen shows only the FINDINGS from the stored sentence, and says
 * everything else in the reader's language from messages/*.json
 * (dashboard.websiteBuilder.flaggedBody). A stored message in a shape this
 * file does not know shows nothing at all, rather than whatever it holds.
 */

const FLAGGED_PREFIX = "This website was flagged by our safety review and can't be published as-is: ";
const FLAGGED_SUFFIX = ". You can regenerate it; the button shows what that costs.";

/** The sentence the worker stores for a flagged site. One definition, so
 *  the reader below cannot drift from the writer. */
export function flaggedMessage(findings: string): string {
  return `${FLAGGED_PREFIX}${findings}${FLAGGED_SUFFIX}`;
}

/** The findings in a stored flagged message, or null. Both the current
 *  sentence and the one written before 2026-10-05 are read; their promise
 *  never is. */
export function flaggedFindings(stored: string | null | undefined): string | null {
  if (typeof stored !== "string" || !stored.startsWith(FLAGGED_PREFIX)) return null;
  const rest = stored.slice(FLAGGED_PREFIX.length);
  const end = rest.search(/\. You can regenerate it\b/);
  const findings = (end >= 0 ? rest.slice(0, end) : rest).trim();
  return findings.length > 0 ? findings : null;
}
