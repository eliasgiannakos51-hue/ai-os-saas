/**
 * MORE THAN ONE PAGE, WITHOUT MOVING THE ONE THAT ALREADY WORKS.
 *
 * A site is stored as a single `html_content` document and served from
 * /s/[subdomain]. Every site that exists today is that. So additional
 * pages are ADDITIVE: `html_content` stays exactly what it was — the home
 * page — and `pages` carries the rest. A row with no `pages` is a
 * single-page site and behaves identically to before, which is why this
 * needs no backfill and cannot break a published site by arriving.
 *
 * WHY REAL ROUTES AND NOT CLIENT-SIDE ROUTING. The published-site CSP
 * allows inline script, so a JS router would run. It would also give
 * every page one `<title>`, one meta description and one URL — so a
 * search engine, a link preview and a screen reader would all see a
 * single page. The brief asks for per-page SEO, and per-page SEO is not
 * something a router can fake.
 *
 * A SLUG IS A URL PATH, so it is validated with the same suspicion as a
 * subdomain rather than trusted because a model produced it. A model
 * asked for "Contact Us" can return "../admin", "index.html", a 400
 * character sentence, or the same slug twice.
 */

/** Kept short for the same reason a subdomain is: it is typed, read aloud
 *  and printed. */
export const PAGE_SLUG_MAX_LENGTH = 40;
/** MEASURED AGAINST THE CREDIT HOLD, not chosen for feel.
 *
 *  Generation reserves credits BEFORE the model runs (lib/billing/
 *  estimate.ts's websiteGenerate profile) and settles at the measured
 *  cost afterwards. The hold has to cover the settlement, or a balance
 *  is charged more than was ever held against it — the exact case that
 *  profile's own comment says it exists to prevent.
 *
 *  What the hold actually covers, priced with the same estimator and the
 *  same per-credit rate on both sides, is 86,500-116,000 characters of
 *  total output (the low end is a short brief on Ultimate, the high end
 *  a long brief on Free; every plan lands in that band because the hold
 *  and the charge scale with the same rate). At roughly 15,000
 *  characters per page that is between five and seven pages.
 *
 *  So the cap is FIVE, which is covered on every plan and every brief
 *  length — and is still the brief's own example (Home, Services, About,
 *  Contact) plus one. Eight was covered on a long brief and NOT on a
 *  short one, which is the worst kind of limit: correct in testing and
 *  wrong for the customer who wrote two sentences.
 *
 *  This number cannot be raised without re-measuring — see
 *  scripts/tests/multipage-websites.test.mjs section 9, which fails if
 *  a site at this cap would settle above its own hold. */
export const MAX_PAGES_PER_SITE = 5;

const SLUG_SHAPE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/**
 * Reserved because they collide with something real rather than because
 * they look odd. "index" is the home page, which is not in `pages`;
 * the others are paths the serving route or a browser treats specially.
 */
const RESERVED_SLUGS = new Set([
  "index",
  "home",
  "api",
  "s",
  "_next",
  "favicon.ico",
  "robots.txt",
  "sitemap.xml",
  "well-known",
]);

export type WebsitePage = {
  /** URL path under the site root: /s/<subdomain>/<slug>. */
  slug: string;
  /** What the navigation calls it, in the site's own language. */
  label: string;
  html: string;
};

export type SlugCheck =
  | { ok: true; slug: string }
  | { ok: false; reason: string };

export function validatePageSlug(raw: unknown): SlugCheck {
  const value = typeof raw === "string" ? raw.trim().toLowerCase() : "";
  if (!value) return { ok: false, reason: "empty" };
  if (value.length > PAGE_SLUG_MAX_LENGTH) return { ok: false, reason: "too_long" };
  // SHAPE FIRST, and the shape is what rejects traversal. `../admin`,
  // `a/b`, `%2e%2e` and a leading dot all fail this before anything has
  // to reason about path semantics — which is the only way to be sure,
  // since a check written as "does not contain .." is defeated by
  // encoding and a check on the decoded string is defeated by double
  // encoding.
  if (!SLUG_SHAPE.test(value)) return { ok: false, reason: "invalid_characters" };
  if (RESERVED_SLUGS.has(value)) return { ok: false, reason: "reserved" };
  return { ok: true, slug: value };
}

/**
 * Everything a model returned, reduced to what can actually be served.
 *
 * DROPS RATHER THAN THROWS. A generation that produced five good pages
 * and one with a bad slug should publish five pages, not fail. What it
 * must never do is publish the bad one.
 */
export function normalisePages(raw: unknown): { pages: WebsitePage[]; dropped: string[] } {
  if (!Array.isArray(raw)) return { pages: [], dropped: [] };
  const pages: WebsitePage[] = [];
  const dropped: string[] = [];
  const seen = new Set<string>();
  for (const entry of raw) {
    if (!entry || typeof entry !== "object") {
      dropped.push("not-an-object");
      continue;
    }
    const candidate = entry as Record<string, unknown>;
    const check = validatePageSlug(candidate.slug);
    if (!check.ok) {
      dropped.push(`${String(candidate.slug).slice(0, 40)}: ${check.reason}`);
      continue;
    }
    // A DUPLICATE IS NOT A MERGE. Two pages claiming /services means one
    // of them is unreachable, and silently keeping the last would make
    // which one arbitrary.
    if (seen.has(check.slug)) {
      dropped.push(`${check.slug}: duplicate`);
      continue;
    }
    const html = typeof candidate.html === "string" ? candidate.html : "";
    if (html.trim().length === 0) {
      dropped.push(`${check.slug}: empty`);
      continue;
    }
    const label =
      typeof candidate.label === "string" && candidate.label.trim()
        ? candidate.label.trim().slice(0, 60)
        : check.slug;
    seen.add(check.slug);
    pages.push({ slug: check.slug, label, html });
    if (pages.length >= MAX_PAGES_PER_SITE - 1) break; // -1: home is not in here
  }
  return { pages, dropped };
}

/** The home page's own entry, which is not stored in `pages` but IS in
 *  the navigation. Kept here so every caller builds the same nav. */
export function navigationFor(pages: WebsitePage[], homeLabel: string) {
  return [{ slug: "", label: homeLabel }, ...pages.map((p) => ({ slug: p.slug, label: p.label }))];
}

/**
 * The href a page's navigation entry points at.
 *
 * RELATIVE TO THE SITE ROOT, not absolute. A published site is served
 * from /s/<subdomain>/, and one day from a custom domain where that
 * prefix does not exist — so the link is built from the base the caller
 * knows rather than from a constant this module would have to guess.
 */
export function pageHref(base: string, slug: string): string {
  const root = base.endsWith("/") ? base.slice(0, -1) : base;
  return slug ? `${root}/${slug}` : root || "/";
}
