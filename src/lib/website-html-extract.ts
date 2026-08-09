// Pulls the HTML document out of whatever the model actually returned.
//
// WHY THIS EXISTS — the "generation was interrupted" bug.
//
// lib/website-builder.ts asks for "ONE complete HTML document, nothing
// else". That instruction holds well for a plain generation. It stops
// holding as soon as the model uses the web_search tool, because a
// search-using turn naturally opens with a sentence about what it is
// about to look up, and the searched facts arrive between text blocks:
//
//   "Let me check what's around that area first."   <- text block
//   [server_tool_use] [web_search_tool_result]
//   "<!DOCTYPE html> ... </html>"                    <- text block
//
// The streaming accumulator joins EVERY text block, so `combined` starts
// with prose. Two separate checks then failed on that, both silently:
//
//   1. looksLikeCompleteHtmlDocument() requires the string to START with
//      <!doctype/<html — a perfectly finished document preceded by one
//      sentence reads as incomplete.
//   2. The continuation gate ("did a document actually start?") tested the
//      same prefix, so it refused to continue a document that HAD started.
//
// The result was assertCompleteHtmlResponse throwing
//   "The website generation was interrupted before the generated page was
//    finished."
// on a generation that had in fact produced a complete page — and the more
// research the model did, the more likely it was to happen. That is the
// exact string users reported, and it is why the failure looked random:
// it tracked whether the model narrated, not whether it finished.
//
// stripCodeFence (the previous, narrower cleanup) could not cover this: it
// only matches when the WHOLE trimmed response is one fenced block, so
// "prose\n```html\n<!DOCTYPE...```" defeated it too.
//
// Deliberately dependency-free (no "server-only") so both the server and
// the unit tests can import it, same split as lib/html-document-check.ts.

/** Where a real HTML document starts, or -1. */
function documentStartIndex(text: string): number {
  const doctype = text.search(/<!doctype\s+html/i);
  const htmlTag = text.search(/<html[\s>]/i);
  if (doctype === -1) return htmlTag;
  if (htmlTag === -1) return doctype;
  return Math.min(doctype, htmlTag);
}

/** True when a document has begun anywhere in the text — the continuation
 *  gate's real question. Asking "does it start with a doctype" instead is
 *  what made a narrated generation unresumable. */
export function containsHtmlDocumentStart(text: string): boolean {
  return documentStartIndex(text) !== -1;
}

/**
 * The HTML document inside `raw`, with any surrounding prose, markdown
 * fences or trailing commentary removed.
 *
 * Returns the trimmed input unchanged when no document start is present —
 * the caller still needs to see that text so its own completeness check can
 * fail honestly rather than on an empty string.
 */
export function extractHtmlDocument(raw: string): string {
  const text = raw.trim();
  if (!text) return "";

  const start = documentStartIndex(text);
  if (start === -1) {
    // No document at all. Strip a wrapping fence anyway so a fenced blob of
    // something-that-is-not-HTML is reported on its own terms.
    const fenced = text.match(/^```(?:html)?\s*\n([\s\S]*?)\n?```$/);
    return fenced ? fenced[1].trim() : text;
  }

  let doc = text.slice(start);

  // Everything after the LAST </html> is commentary ("Let me know if you
  // want me to change anything") or a closing fence. Both belong outside
  // the file the user downloads.
  const closing = doc.toLowerCase().lastIndexOf("</html>");
  if (closing !== -1) doc = doc.slice(0, closing + "</html>".length);

  return doc.trim();
}
