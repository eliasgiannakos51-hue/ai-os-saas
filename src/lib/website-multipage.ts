/**
 * SEVERAL PAGES OUT OF ONE GENERATION.
 *
 * WHY ONE CALL AND NOT ONE PER PAGE, measured rather than assumed. A
 * per-page approach would carry the home page's HTML into each
 * subsequent call so the design matches — and that input is what costs.
 * Priced with the same estimator the reservation uses: four pages in one
 * call is $0.3374; home plus three calls each carrying 8,000 characters
 * of context is $2.0676. That is 6.13x for a worse result, since pages
 * written in one turn share a design because they were written together
 * rather than because one was described to the next.
 *
 * THE MARKER IS AN HTML COMMENT because it has to survive being emitted
 * by a model that has just been told to output HTML and nothing else. A
 * fenced block, a JSON envelope or a bare separator all invite the model
 * to explain itself; a comment is something it already knows how to
 * write, and one that appears in the wrong place is invisible to a
 * browser rather than printed on the page.
 */
import { looksLikeCompleteHtmlDocument } from "@/lib/html-document-check";
import { normalisePages, type WebsitePage, MAX_PAGES_PER_SITE } from "@/lib/publishing/website-pages";

/** Written by the model before each document. Deliberately not
 *  configurable: a marker the prompt and the parser can disagree about is
 *  a marker that silently produces a one-page site. */
export const PAGE_MARKER_RE = /<!--\s*IONEXA:PAGE\s+slug="([^"]{1,60})"\s+label="([^"]{1,80})"\s*-->/gi;

export type SplitResult = {
  /** The home page. Always the first document, whatever it was labelled. */
  home: string;
  /** Everything after it, validated. */
  pages: WebsitePage[];
  /** Documents that were produced but could not be used, with the reason.
   *  Reported rather than swallowed: a generation that quietly lost two of
   *  its four pages looks like a model that ignored the brief. */
  dropped: string[];
};

/**
 * Splits a multi-page generation into its documents.
 *
 * A RESPONSE WITH NO MARKERS IS A ONE-PAGE SITE, not an error. That is
 * what every generation before this produced and what a small brief
 * should still produce, so the single-page path is the fallback rather
 * than a special case.
 */
export function splitGeneratedPages(raw: string): SplitResult {
  const markers = [...raw.matchAll(PAGE_MARKER_RE)];
  if (markers.length === 0) {
    return { home: raw.trim(), pages: [], dropped: [] };
  }

  const dropped: string[] = [];
  const segments: Array<{ slug: string; label: string; html: string }> = [];

  // ------------------------------------------------------------------
  // A COMPLETE DOCUMENT BEFORE THE FIRST MARKER IS THE HOME PAGE.
  // ------------------------------------------------------------------
  //
  // This used to drop everything before the first marker unconditionally,
  // on the reasoning that it was "preamble the model was told not to
  // write" — a stray sentence that would render above the header.
  //
  // MEASURED AGAINST THREE REAL GENERATIONS on 2026-09-02 — Greek,
  // English and Arabic, through the live model — that reasoning was
  // wrong on ALL THREE. What sat before the first marker was not a
  // sentence. It was the home page: 17,669 bytes on the first site, a
  // complete document, `<title>Γιαννακόπουλος | Υδραυλικές Εγκαταστάσεις
  // & Καυστήρες – Θεσσαλονίκη</title>`, with a nav linking to all five
  // pages the brief asked for.
  //
  // The prompt is why, and it reads perfectly reasonably: "The FIRST
  // document is the home page. Give it the marker slug='home'." The
  // model treats the first sentence as the instruction — write the home
  // page first — and the second as redundant labelling of something
  // already identified by position. Three for three.
  //
  // What the reader got: the SERVICES page served at the site root, a
  // nav one item short (link-safety correctly removed the link to
  // `services`, which was no longer a served slug), no way to reach the
  // real front page because it no longer existed, and four pages billed
  // as five.
  //
  // So the test is what the content IS, not where the model put a
  // comment. `looksLikeCompleteHtmlDocument` is the same predicate every
  // other segment is already judged by; a stray sentence still fails it
  // and is still dropped, which is the case the old comment was actually
  // worried about.
  //
  // A marked segment that ALSO claims slug="home" is not a second front
  // page: "home" is in RESERVED_SLUGS, so normalisePages rejects it and
  // says so in `dropped` rather than serving two.
  const preamble = raw.slice(0, markers[0].index ?? 0).trim();
  const preambleIsHome = preamble.length > 0 && looksLikeCompleteHtmlDocument(preamble);
  if (preamble && !preambleIsHome) dropped.push(`preamble: ${preamble.slice(0, 60)}`);

  for (let i = 0; i < markers.length; i += 1) {
    const start = (markers[i].index ?? 0) + markers[i][0].length;
    const end = i + 1 < markers.length ? markers[i + 1].index ?? raw.length : raw.length;
    segments.push({
      slug: markers[i][1].trim().toLowerCase(),
      label: markers[i][2].trim(),
      html: raw.slice(start, end).trim(),
    });
  }

  // THE FIRST DOCUMENT IS HOME, whatever slug it claims. The prompt asks
  // for it first; making the parser depend on the model getting the slug
  // right would turn a naming slip into a site with no front page.
  //
  // Unless an unmarked complete document already came before it, in
  // which case THAT is the front page and every marked segment is an
  // ordinary page — see the note above.
  const first = preambleIsHome ? undefined : segments.shift();
  const home = preambleIsHome ? preamble : (first?.html ?? "");

  // EVERY PAGE IS CHECKED FOR COMPLETENESS SEPARATELY. The existing
  // truncation guard asks whether THE RESPONSE ended cleanly, which for a
  // multi-page response only ever tells you about the last page. A run
  // that stopped in the middle of page three leaves pages one and two
  // whole and page three a fragment — and a fragment is exactly what
  // renders as a near-blank page.
  const complete = segments.filter((s) => {
    if (looksLikeCompleteHtmlDocument(s.html)) return true;
    dropped.push(`${s.slug}: incomplete document`);
    return false;
  });

  const { pages, dropped: rejected } = normalisePages(complete);
  return { home, pages, dropped: [...dropped, ...rejected] };
}

/**
 * The prompt section that asks for pages. Appended only when the brief
 * warrants more than one, so a request for a landing page is not talked
 * into four.
 */
export function multipageInstruction(): string {
  return `
MULTIPLE PAGES
- Decide from the description how many pages this site needs. A landing page or a personal site is usually ONE. A business offering distinct services usually wants a few — a home page, what they do, who they are, how to reach them. Do not pad: a page with nothing to say is worse than no page.
- Maximum ${MAX_PAGES_PER_SITE} pages including the home page.
- Write each page as its own COMPLETE HTML document, preceded by exactly this marker on its own line:
  <!--IONEXA:PAGE slug="about" label="About us"-->
- The FIRST document is the home page. Give it the marker slug="home" — it is served at the site root, and the slug is ignored for it.
- slug: lowercase letters, numbers and single hyphens only. It becomes the URL.
- label: what the navigation link says, in the same language as the site.
- EVERY page carries the SAME <style> block, the same header and the same footer. A visitor must not be able to tell that the pages were written separately.
- The navigation appears on every page, links to every page, and marks the current one. Links are relative: href="about", and href="." for home.
- The per-page <title> and <meta name="description"> under SEO are not optional here: repeating the home page's title on every page is the commonest way a multi-page site is built wrong.`;
}
