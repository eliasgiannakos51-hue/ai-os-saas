/**
 * "MADE WITH IONEXA" — ON FREE SITES, AT SERVE TIME.
 *
 * WHY IT IS NOT BAKED INTO html_content, which is the obvious way and the
 * wrong one. Three failures, all of them silent:
 *
 *   AN UPGRADE WOULD NOT REMOVE IT. The badge would sit in the stored
 *   HTML of every page generated while the account was free, so somebody
 *   who pays to remove it keeps it until they regenerate every page —
 *   which is the one thing they paid not to have to do.
 *
 *   A DOWNGRADE WOULD NOT ADD IT. The reverse, and worse for us: an
 *   account that cancels keeps a badge-free site forever.
 *
 *   THE OWNER COULD DELETE IT. The Website Builder lets them edit their
 *   HTML. A badge in that HTML is a badge with a delete key next to it.
 *
 * Injected here instead, from the owner's CURRENT plan, every time a
 * visitor is served. The stored HTML never contains it, so the plan is
 * the only thing that decides.
 *
 * Pure — string in, string out — so the build gate exercises every branch
 * without serving anything.
 */

/** Plans that carry the badge. Free only: the brief's "αφαιρείται σε
 *  Starter+", written as the positive list so a NEW free-ish tier has to
 *  be added deliberately rather than inheriting silence. */
export const BADGED_PLANS = new Set(["free"]);

export function planShowsBadge(planSlug: string | null | undefined): boolean {
  // NO PLAN MEANS FREE. An account whose tier could not be read is not a
  // paying one — treating "unknown" as paid would quietly give away the
  // upsell to anybody whose metadata failed to load.
  return BADGED_PLANS.has((planSlug ?? "free").trim().toLowerCase() || "free");
}

/**
 * The badge markup.
 *
 * DISCREET, BOTTOM RIGHT, AND A REAL LINK. Everything about it is
 * defensive, because it is injected into HTML a language model wrote for
 * somebody else:
 *
 *   INLINE STYLES ONLY, and `all: initial` first. The site's own
 *   stylesheet does not know this element exists, and a `a { display:
 *   block; width: 100% }` rule somewhere in it would otherwise stretch
 *   the badge across the page.
 *
 *   A HIGH z-index, because a generated site frequently has a fixed
 *   footer or a cookie bar of its own.
 *
 *   rel="noopener" — the link opens in a new tab, and without it the
 *   opened page can navigate the site that opened it.
 *
 *   NOTHING INTERPOLATED. The markup is a constant. There is no field of
 *   the site, the owner or the request in it, so there is nothing here to
 *   escape and nothing that could carry an injection.
 */
export const BADGE_HREF = "https://ionexa.ai/?ref=badge";

const BADGE_HTML = `<a href="${BADGE_HREF}" target="_blank" rel="noopener noreferrer" style="all:initial;position:fixed;right:12px;bottom:12px;z-index:2147483000;display:inline-flex;align-items:center;gap:6px;padding:6px 10px;border-radius:999px;background:rgba(17,17,17,0.82);color:#f5f5f5;font-family:ui-sans-serif,system-ui,-apple-system,'Segoe UI',sans-serif;font-size:11px;line-height:1;text-decoration:none;box-shadow:0 2px 8px rgba(0,0,0,0.18);backdrop-filter:blur(6px);cursor:pointer;">
<span style="all:initial;display:inline-block;width:6px;height:6px;border-radius:999px;background:#f97316;"></span>
<span style="all:initial;font-family:inherit;font-size:11px;color:#f5f5f5;">Made with Ionexa</span>
</a>`;

/** A marker so a page cannot end up with two badges — if a future path
 *  ever injects before this one runs, the second is a no-op rather than a
 *  duplicate. */
export const BADGE_MARKER = "data-ionexa-badge";
const MARKED_BADGE = BADGE_HTML.replace("<a ", `<a ${BADGE_MARKER}="1" `);

export function injectBadge(html: string, options: { planSlug: string | null | undefined }): string {
  if (!planShowsBadge(options.planSlug)) return html;
  if (typeof html !== "string" || html.trim() === "") return html;
  if (html.includes(BADGE_MARKER)) return html;

  // BEFORE </body>, so the badge is inside the document and after
  // everything that might otherwise cover it. Matched case-insensitively
  // and on the LAST occurrence: a generated page can contain the literal
  // text "</body>" inside a code sample, and appending to the first match
  // would put the badge in the middle of the page.
  const lower = html.toLowerCase();
  const bodyClose = lower.lastIndexOf("</body>");
  if (bodyClose !== -1) {
    return `${html.slice(0, bodyClose)}${MARKED_BADGE}${html.slice(bodyClose)}`;
  }

  const htmlClose = lower.lastIndexOf("</html>");
  if (htmlClose !== -1) {
    return `${html.slice(0, htmlClose)}${MARKED_BADGE}${html.slice(htmlClose)}`;
  }

  // A FRAGMENT WITH NO CLOSING TAG still gets one. Some generated pages
  // are partials, and refusing to badge them would make "free sites carry
  // the badge" quietly untrue for a subset nobody would think to check.
  return `${html}${MARKED_BADGE}`;
}
