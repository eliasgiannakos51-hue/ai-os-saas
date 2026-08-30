/**
 * THE SECOND PASS OVER A RESEARCH REPORT'S CITATIONS.
 *
 * Deep research already gets the hard part right: the sources come from
 * Anthropic's own citation blocks, so the URLs are real pages the model
 * actually read rather than plausible-looking strings it composed. What
 * nothing checks is the OTHER half — whether the markers in the prose
 * point at any of them.
 *
 * Measured against the real renderer before this existed: a body reading
 * "the market grew 40% [2]. Analysts disagree [7]." with two sources
 * produces a document containing [1], [2] and [7]. The [7] is rendered,
 * looks exactly like the others, and points nowhere. A reader who
 * follows it finds nothing; a reader who does not follow it has counted
 * an unbacked claim as a cited one, which is worse.
 *
 * NO MODEL CALL. This is arithmetic on the text, which is the whole
 * argument for a verification layer: quality that does not cost a better
 * model. It runs in microseconds and cannot itself hallucinate.
 */

/** Which numbered list a marker belongs to. */
export type CitationNamespace = "web" | "entry";

export type CitationIssue =
  | { kind: "dangling"; namespace: CitationNamespace; marker: number; sourceCount: number }
  | { kind: "unused"; namespace: CitationNamespace; marker: number };

export type CitationCheck = {
  /** Every distinct [n] found in the prose, ascending. */
  markers: number[];
  /** Every distinct [En] found in the prose, ascending. */
  entryMarkers: number[];
  sourceCount: number;
  entryCount: number;
  issues: CitationIssue[];
  /** True when no marker of EITHER kind points past the end of its own
   *  list. An unused source is untidy; a dangling marker is a broken
   *  promise, so only the second decides this. */
  ok: boolean;
};

/**
 * Markers are read from the PROSE, not from the rendered document.
 *
 * The renderer emits "[1] Title" for each source in the list at the
 * bottom, so scanning the finished HTML would count the bibliography's
 * own numbering as citations and report every report as fully cited. The
 * markdown the model wrote is the only place a real marker appears.
 */
export function checkCitations(
  markdown: string,
  sourceCount: number,
  /** How many of the user's own entries were supplied as [E1..En].
   *  Defaults to zero so every existing caller keeps its behaviour. */
  entryCount = 0
): CitationCheck {
  // A fenced code block can legitimately contain [1] — an array index, a
  // regex, a footnote in quoted source. Stripping fences first stops a
  // report ABOUT code being reported as miscited.
  const prose = markdown.replace(/```[\s\S]*?```/g, "").replace(/`[^`\n]*`/g, "");

  const found = new Set<number>();
  for (const m of prose.matchAll(/\[(\d{1,3})\]/g)) {
    const n = Number(m[1]);
    // [0] is not a citation in a 1-based scheme; it is almost always an
    // array index that survived the fence strip.
    if (n >= 1) found.add(n);
  }
  const markers = [...found].sort((a, b) => a - b);

  // AN INVENTED [E99] IS EXACTLY AS SERIOUS AS AN INVENTED [7], and the
  // web-only regex could not see it: `\[(\d{1,3})\]` requires a digit
  // straight after the bracket, so `[E99]` matched nothing at all. It was
  // not passed and not failed — it was invisible, which is the worst of
  // the three. A reader following it lands nowhere, exactly as with a
  // dangling web marker, and the report looks fully cited either way.
  const foundEntries = new Set<number>();
  for (const m of prose.matchAll(/\[E(\d{1,3})\]/g)) {
    const n = Number(m[1]);
    if (n >= 1) foundEntries.add(n);
  }
  const entryMarkers = [...foundEntries].sort((a, b) => a - b);

  const issues: CitationIssue[] = [];
  for (const marker of markers) {
    if (marker > sourceCount) {
      issues.push({ kind: "dangling", namespace: "web", marker, sourceCount });
    }
  }
  for (const marker of entryMarkers) {
    if (marker > entryCount) {
      issues.push({ kind: "dangling", namespace: "entry", marker, sourceCount: entryCount });
    }
  }
  for (let i = 1; i <= sourceCount; i += 1) {
    if (!found.has(i)) issues.push({ kind: "unused", namespace: "web", marker: i });
  }
  for (let i = 1; i <= entryCount; i += 1) {
    if (!foundEntries.has(i)) issues.push({ kind: "unused", namespace: "entry", marker: i });
  }

  return {
    markers,
    entryMarkers,
    sourceCount,
    entryCount,
    issues,
    ok: !issues.some((i) => i.kind === "dangling"),
  };
}

/**
 * What to do about a dangling marker, and why it is not "delete it".
 *
 * Removing "[7]" would leave the sentence reading as the model's own
 * assertion — an unbacked claim now indistinguishable from an uncited
 * one, which is the failure mode this check exists to surface rather
 * than hide. Renumbering is worse: it would point the claim at whichever
 * source happens to sit at that index, inventing a provenance.
 *
 * So the marker is kept and MARKED. The reader sees that the report
 * claimed a source it did not have, which is the truth about the
 * document.
 */
export function annotateDanglingCitations(
  markdown: string,
  sourceCount: number,
  entryCount = 0
): string {
  // ONE PASS OVER BOTH SHAPES, and the ORDER of the alternation is the
  // whole correctness argument. `\[(\d{1,3})\]` cannot match "[E3]" —
  // there is a letter where it wants a digit — so the old single-shape
  // version left every entry marker alone, valid or not. That was the
  // right behaviour for valid ones and silence for invented ones.
  //
  // Matching `\[E?(\d{1,3})\]` in one expression is what makes the
  // capture group ambiguous, so the E is captured separately and each
  // marker is compared against ITS OWN list. A valid [E3] with three
  // entries is returned untouched; an [E99] is marked exactly as a
  // dangling [99] would be.
  return markdown.replace(/\[(E?)(\d{1,3})\]/g, (whole, prefix: string, digits: string) => {
    const n = Number(digits);
    const ceiling = prefix === "E" ? entryCount : sourceCount;
    if (n < 1 || n <= ceiling) return whole;
    return `${whole}⚠`;
  });
}
