import { validatePageSlug, type WebsitePage } from "./website-pages";

/**
 * WHICH DOCUMENT AN EDIT TOUCHES, AND WHERE THE RESULT GOES BACK.
 *
 * A site is a home document (user_websites.html_content) plus an array
 * of other pages. An edit names one of them. Two things can go wrong,
 * and both render perfectly:
 *
 *   - the model is sent the HOME page and the result is saved onto a
 *     SUB-page, so /services quietly becomes a second copy of /;
 *   - the model is sent a sub-page and the result is saved onto
 *     html_content, so the front page becomes the services page.
 *
 * Neither throws, neither logs, and both look like "the edit worked" in
 * the preview the owner is currently on. This is the decision, extracted
 * from the route so it can be executed by a test rather than looked at.
 */
export type EditTarget =
  | { ok: true; index: number; slug: string | null; html: string }
  | { ok: false; reason: "invalid_slug" | "unknown_page" };

/** index -1 is the home document. */
export const HOME_INDEX = -1;

/**
 * "home" is a RESERVED slug — it is not a URL under /s/<subdomain>/ —
 * so it is matched literally rather than handed to validatePageSlug,
 * which correctly rejects it. An absent/empty slug means the same thing:
 * the home page, which is what every caller meant before pages existed.
 */
export function resolveEditTarget(
  homeHtml: string,
  pages: WebsitePage[],
  rawSlug: unknown
): EditTarget {
  const wanted = typeof rawSlug === "string" ? rawSlug.trim().toLowerCase() : "";
  if (!wanted || wanted === "home") {
    return { ok: true, index: HOME_INDEX, slug: null, html: homeHtml };
  }
  const check = validatePageSlug(wanted);
  if (!check.ok) return { ok: false, reason: "invalid_slug" };
  const index = pages.findIndex((pg) => pg.slug === check.slug);
  // NOT a fallback to the home page. An edit aimed at a page this site
  // does not have is a mistake worth reporting, not an edit silently
  // applied somewhere else.
  if (index < 0) return { ok: false, reason: "unknown_page" };
  return { ok: true, index, slug: check.slug, html: pages[index].html };
}

/**
 * The edited document written back where it came from — and nowhere
 * else. Every other page keeps its exact previous HTML, so an edit to
 * /services cannot disturb /contact.
 */
export function applyEditedDocument(
  homeHtml: string,
  pages: WebsitePage[],
  index: number,
  editedHtml: string
): { htmlContent: string; pages: WebsitePage[] } {
  if (index === HOME_INDEX) return { htmlContent: editedHtml, pages };
  return {
    htmlContent: homeHtml,
    pages: pages.map((pg, i) => (i === index ? { ...pg, html: editedHtml } : pg)),
  };
}
