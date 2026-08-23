/**
 * SITEMAPS AND robots FOR PUBLISHED SITES.
 *
 * Pure builders, separate from the routes that serve them, so the XML
 * can be tested without a database — and because an XML document
 * assembled by string concatenation is exactly the kind of thing that
 * needs a test more than it needs a framework.
 *
 * WHERE robots.txt IS ACTUALLY READ, stated plainly because it changes
 * what these are worth. A crawler reads robots.txt from the HOST ROOT
 * and nowhere else. Published sites live at /s/<subdomain> today, so the
 * file that governs them is this app's own /robots.txt — which is why
 * that one names /s/ explicitly (see app/robots.ts). The per-site file
 * built here is correct and serves two real purposes: it is what a site
 * owner points Google Search Console at, and it is already right for the
 * day a wildcard domain puts each site on its own host, where it WILL be
 * the file at the root. It is not doing crawler-facing work before then,
 * and saying otherwise would be the kind of claim that quietly never
 * gets checked.
 */

export type SitemapEntry = {
  /** Absolute URL. */
  loc: string;
  lastModified?: string | Date | null;
  /** 0..1. Omitted rather than defaulted — a sitemap where every page
   *  claims priority 0.5 has said nothing. */
  priority?: number | null;
};

const escapeXml = (s: string) =>
  s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");

/** The sitemaps.org cap. Beyond it a sitemap must be split, and a file
 *  over the cap is rejected whole rather than truncated by the reader. */
export const MAX_SITEMAP_URLS = 50000;

function isoDate(value: string | Date | null | undefined): string | null {
  if (!value) return null;
  const d = value instanceof Date ? value : new Date(value);
  // An invalid date must not become "Invalid Date" inside a <lastmod>,
  // which invalidates the whole document rather than one entry.
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString();
}

export function buildSitemapXml(entries: SitemapEntry[]): string {
  const urls = entries
    .filter((e) => typeof e.loc === "string" && /^https?:\/\//i.test(e.loc))
    .slice(0, MAX_SITEMAP_URLS)
    .map((e) => {
      const lastmod = isoDate(e.lastModified);
      const priority =
        typeof e.priority === "number" && e.priority >= 0 && e.priority <= 1
          ? e.priority.toFixed(1)
          : null;
      return [
        "  <url>",
        `    <loc>${escapeXml(e.loc)}</loc>`,
        lastmod ? `    <lastmod>${lastmod}</lastmod>` : null,
        priority ? `    <priority>${priority}</priority>` : null,
        "  </url>",
      ]
        .filter(Boolean)
        .join("\n");
    })
    .join("\n");
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`;
}

/**
 * The URLs of one published site: its home page and each of its pages.
 *
 * The home page carries priority 1.0 and the rest 0.8 — the one
 * relationship a small site's sitemap can honestly state.
 */
export function siteSitemapEntries(
  siteUrl: string,
  pageSlugs: string[],
  lastModified: string | Date | null
): SitemapEntry[] {
  const base = siteUrl.replace(/\/+$/, "");
  return [
    { loc: base, lastModified, priority: 1 },
    ...pageSlugs.map((slug) => ({
      loc: `${base}/${encodeURIComponent(slug)}`,
      lastModified,
      priority: 0.8,
    })),
  ];
}

export function buildRobotsTxt(siteUrl: string): string {
  const base = siteUrl.replace(/\/+$/, "");
  let path: string;
  try {
    path = new URL(base).pathname.replace(/\/+$/, "") || "/";
  } catch {
    path = "/";
  }
  return [
    "User-agent: *",
    `Allow: ${path}`,
    "",
    `Sitemap: ${base}/sitemap.xml`,
    "",
  ].join("\n");
}
