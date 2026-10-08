import { annotateDanglingCitations } from "@/lib/verification/citations";

/**
 * EVERY [n] IN A RESEARCH REPORT OPENS ITS SOURCE (MASTER 16, package 11:
 * «έρευνα με αριθμημένες πηγές που ανοίγουν»), behind the switch
 * "research-slides".
 *
 * The report's text cites its sources as [1], [2] (lib/research/research.ts
 * numbers them once across the report, from the search tool's own citation
 * blocks), and until now the numbers were plain text: the list at the
 * bottom opened, the claim did not. Each valid [n] becomes a Markdown link
 * of its own, written inline — not a reference definition, because Markdown
 * reads "[1][2]" as ONE link (text "1", reference "2") and the claim would
 * open the wrong source. A number past the source list is marked ⚠ by the
 * same check the Documents copy uses (lib/verification/citations.ts) and is
 * never a link; [E3], the person's own entries, stays as it is. Only
 * http(s) addresses become links.
 *
 * Rendered by components/chat/message-content.tsx, which opens every link
 * in a new tab with noopener noreferrer. Held by
 * scripts/tests/research-slides.test.mjs.
 */

export type CitedSource = { title: string; url: string };

const safeUrl = (url: string): string | null => {
  try {
    const u = new URL(url);
    return u.protocol === "https:" || u.protocol === "http:" ? u.href : null;
  } catch {
    return null;
  }
};

export function linkCitations(body: string, sources: readonly CitedSource[], entryCount = 0): string {
  const marked = annotateDanglingCitations(body, sources.length, entryCount);
  // A marker already followed by "(" or "⚠" is left alone: the first is a
  // link the text wrote itself, the second a number with no source.
  return marked.replace(/\[(\d{1,3})\](?![(⚠])/g, (whole, digits: string) => {
    const source = sources[Number(digits) - 1];
    const href = source ? safeUrl(source.url) : null;
    if (!href) return whole;
    const title = source.title.replace(/["\\]/g, "'").slice(0, 200);
    return `[\\[${digits}\\]](<${href.replace(/[<>\s]/g, encodeURIComponent)}> "${title}")`;
  });
}
