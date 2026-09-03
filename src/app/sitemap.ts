import type { MetadataRoute } from "next";
import { getSiteUrl } from "@/lib/site-url";
import { createAdminClient } from "@/lib/supabase/admin";
import { logApiError } from "@/lib/log-error";
import { publishedSiteUrl } from "@/lib/publishing/subdomain";
import { normalisePages } from "@/lib/publishing/website-pages";
import { MAX_SITEMAP_URLS } from "@/lib/seo/sitemap";
import { FOOTER_LINKS } from "@/lib/footer-links";

const BASE_URL = getSiteUrl();

// Re-generated hourly rather than on every request. This is the file
// crawlers fetch repeatedly and it now reads the database; an hour is
// fresh enough for a page that was published minutes ago to be found the
// same day, and it keeps a crawl from becoming a query per bot.
export const revalidate = 3600;

// Only the public pages meant to be indexed — dashboard/auth routes are
// excluded (see robots.ts) since they require a session either way.
//
// AND EVERY LIVE CUSTOMER SITE. This is the sitemap a crawler actually
// reads for anything served from this host, so a published site that is
// not listed here is a site nobody finds except by being sent the link.
// The per-site /s/<subdomain>/sitemap.xml is for the owner to submit to
// Search Console; this one is what does the discovery work today.
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  // FROM THE FOOTER'S OWN LIST, not a second copy of it.
  //
  // This was `["", "/pricing", "/help", "/terms", "/privacy"]`, written
  // by hand, and by hand it had gone stale: /cookies and /roadmap had
  // been linked from the landing footer for weeks and were in neither
  // this file nor robots.ts, so neither was in the index. Then
  // /acceptable-use, /ai-transparency and /contact were added and made
  // it five.
  //
  // Measured, not assumed: production's live sitemap.xml on 2026-09-02
  // listed five URLs for an app with eight public pages.
  //
  // lib/footer-links.ts is now the one list of what this app makes
  // public, so a page linked from the footer is in the index by
  // construction. scripts/tests/legal-pages.test.mjs asserts the two
  // agree.
  //
  // /help is not in the footer and is public on purpose (see
  // app/help/page.tsx): half the questions it answers are asked before
  // anyone signs up, so it is added explicitly alongside the home page,
  // which has no footer entry either.
  const routes = ["", "/help", ...FOOTER_LINKS.map((l) => l.href)];
  const lastModified = new Date();

  const own: MetadataRoute.Sitemap = routes.map((route) => ({
    url: `${BASE_URL}${route}`,
    lastModified,
  }));

  return [...own, ...(await publishedSiteEntries())];
}

/**
 * Every live published site, and every page of it.
 *
 * FAILS OPEN, not closed: a database hiccup returns the app's own pages
 * rather than throwing, because an empty or 500ing sitemap tells a
 * crawler far more confidently that there is nothing here than a short
 * one does.
 */
async function publishedSiteEntries(): Promise<MetadataRoute.Sitemap> {
  try {
    const admin = createAdminClient();
    const { data, error } = await admin
      .from("published_sites")
      .select("subdomain, pages, updated_at")
      .eq("status", "live")
      .eq("is_active", true)
      .order("updated_at", { ascending: false })
      .limit(5000);

    if (error) {
      logApiError("sitemap.xml", error, { stage: "load_published_sites" });
      return [];
    }

    const out: MetadataRoute.Sitemap = [];
    for (const site of data ?? []) {
      const subdomain = String(site.subdomain ?? "");
      if (!subdomain) continue;
      const url = publishedSiteUrl(subdomain, BASE_URL, process.env.PUBLISHED_SITE_DOMAIN);
      const lastModified = site.updated_at ? new Date(site.updated_at) : undefined;
      out.push({ url, lastModified, priority: 0.9 });
      const { pages } = normalisePages(site.pages);
      for (const page of pages) {
        out.push({ url: `${url}/${page.slug}`, lastModified, priority: 0.7 });
      }
      // The protocol's own ceiling. Past it the file is rejected whole,
      // so a site added today would cost every site in the file.
      if (out.length >= MAX_SITEMAP_URLS - routesHeadroom) break;
    }
    return out;
  } catch (err) {
    logApiError("sitemap.xml", err, { stage: "published_sites_unhandled" });
    return [];
  }
}

/** Room for this app's own pages inside the 50,000 URL ceiling. */
const routesHeadroom = 100;
