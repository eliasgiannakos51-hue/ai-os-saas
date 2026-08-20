/**
 * How alike are two generated sites, structurally?
 *
 * THE FIFTH REPORT was "the sites still feel like the same template", and
 * every previous answer to it was a judgement — someone looked at two pages
 * and said they felt similar, or said they did not. A judgement cannot tell
 * you whether a change helped. This can: it reduces a page to the sequence
 * of structural things a visitor meets going down it, and compares two
 * sequences as sequences.
 *
 * WHAT IT MEASURES, exactly: the ORDER and COMPOSITION of a page's
 * landmarks — header, nav, headings by level, sections, lists, tables,
 * forms, images, embedded maps, footer — as they appear in the document.
 * Two pages built from the same section order score high even in different
 * colours, because colour is not structure. Two pages that put different
 * things first score low even in the same palette. That is the axis the
 * report is about.
 *
 * WHAT IT CANNOT MEASURE, said plainly rather than implied: palette, type,
 * spacing, motion, copy, or whether the page is any GOOD. A site can be
 * structurally distinct and still look like a sibling; the other five
 * variation axes exist for that and are not visible here.
 *
 * THE SCORE is 1 minus the normalised edit distance between the two token
 * sequences: 1.0 for identical structure, 0.0 for no shared structure at
 * all. It is deliberately weight-free — there is no knob to turn until the
 * number looks good.
 */

/** The landmarks a visitor actually meets, in document order. */
const STRUCTURAL_TAGS = new Set([
  "header",
  "nav",
  "main",
  "section",
  "article",
  "aside",
  "footer",
  "form",
  "table",
  "ul",
  "ol",
  "figure",
  "iframe",
  "video",
  "img",
  "button",
  "h1",
  "h2",
  "h3",
  "h4",
  "h5",
  "h6",
]);

/**
 * The page as a sequence of structural tokens.
 *
 * Opening tags only — a closing tag adds no information the opening one
 * did not already carry, and counting both doubles every token, which
 * makes every page look more like every other page.
 */
export function structuralSignature(html: string): string[] {
  const withoutInert = html
    .replace(/<(script|style|noscript|template|svg)\b[^>]*>[\s\S]*?<\/\1>/gi, " ")
    .replace(/<!--[\s\S]*?-->/g, " ");
  const tokens: string[] = [];
  for (const match of withoutInert.matchAll(/<([a-zA-Z][a-zA-Z0-9]*)\b/g)) {
    const tag = match[1].toLowerCase();
    if (STRUCTURAL_TAGS.has(tag)) tokens.push(tag);
  }
  return tokens;
}

/** Levenshtein distance over two token sequences. */
function editDistance(a: string[], b: string[]): number {
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;
  let previous = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const current = [i];
    for (let j = 1; j <= b.length; j++) {
      current[j] = Math.min(
        previous[j] + 1,
        current[j - 1] + 1,
        previous[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)
      );
    }
    previous = current;
  }
  return previous[b.length];
}

export type StructuralComparison = {
  /** 1.0 identical structure, 0.0 nothing in common. */
  similarity: number;
  /** How much of the score is "the same things", ignoring their order —
   *  reported separately because two pages can share every ingredient and
   *  still read as two pages if they serve them in a different order. */
  composition: number;
  tokensA: number;
  tokensB: number;
};

/** Compare two token sequences directly — used by the HTML comparison, and
 *  by tests that build sequences from the section orders themselves. */
export function compareTokenSequences(a: string[], b: string[]): StructuralComparison {
  const longest = Math.max(a.length, b.length);
  if (longest === 0) {
    return { similarity: 1, composition: 1, tokensA: 0, tokensB: 0 };
  }
  const similarity = 1 - editDistance(a, b) / longest;

  // Composition: how much of the multiset of tokens is shared.
  const countOf = (tokens: string[]) => {
    const counts = new Map<string, number>();
    for (const t of tokens) counts.set(t, (counts.get(t) ?? 0) + 1);
    return counts;
  };
  const ca = countOf(a);
  const cb = countOf(b);
  let shared = 0;
  for (const [token, n] of ca) shared += Math.min(n, cb.get(token) ?? 0);
  const composition = (2 * shared) / (a.length + b.length);

  return { similarity, composition, tokensA: a.length, tokensB: b.length };
}

export function compareStructure(htmlA: string, htmlB: string): StructuralComparison {
  return compareTokenSequences(structuralSignature(htmlA), structuralSignature(htmlB));
}

/** The mean of every pair in a corpus — the one number that answers "do my
 *  sites all look the same?" for a set of sites rather than for two. */
export function averagePairwiseSimilarity(pages: string[][]): number {
  if (pages.length < 2) return 1;
  let total = 0;
  let pairs = 0;
  for (let i = 0; i < pages.length; i++) {
    for (let j = i + 1; j < pages.length; j++) {
      total += compareTokenSequences(pages[i], pages[j]).similarity;
      pairs++;
    }
  }
  return total / pairs;
}
