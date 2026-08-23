import { createAdminClient } from "@/lib/supabase/admin";
import { logApiError } from "@/lib/log-error";
import { validateSubdomain, publishedSiteUrl } from "@/lib/publishing/subdomain";
import { normalisePages } from "@/lib/publishing/website-pages";
import { getSiteUrl } from "@/lib/site-url";
import { buildSitemapXml, siteSitemapEntries } from "@/lib/seo/sitemap";
import { notFoundHeaders, publicRequestAllowed } from "@/lib/publishing/public-serving";

export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";
export const revalidate = 0;

/**
 * One published site's sitemap.
 *
 * The address the owner submits to Google Search Console for their own
 * site. It lists the home page and every page published WITH it — read
 * from published_sites, not from the draft, because the sitemap has to
 * agree with what is actually being served or it advertises URLs that
 * 404.
 *
 * "sitemap.xml" is a RESERVED slug (lib/publishing/website-pages.ts), so
 * a page can never be published at this address and shadow it. The route
 * segment is a literal, which takes precedence over [page] regardless.
 *
 * Same posture as the page routes: admin client, no session, rate
 * limited, and a site that is not live is a 404 rather than an empty
 * sitemap — an empty one reads to a crawler as "this site has no pages".
 */
export async function GET(request: Request, { params }: { params: { subdomain: string } }) {
  try {
    if (!publicRequestAllowed(request)) {
      return new Response("Too many requests.", {
        status: 429,
        headers: { "Content-Type": "text/plain; charset=utf-8", "Retry-After": "60" },
      });
    }

    const check = validateSubdomain(params.subdomain);
    if (!check.ok) return notFound();

    const admin = createAdminClient();
    const { data: site, error } = await admin
      .from("published_sites")
      .select("pages, status, is_active, updated_at")
      .eq("subdomain", check.subdomain)
      .maybeSingle();

    if (error) {
      logApiError("/s/[subdomain]/sitemap.xml", error, { stage: "load_site" });
      return new Response("Temporarily unavailable.", {
        status: 503,
        headers: { "Content-Type": "text/plain; charset=utf-8", "Retry-After": "30" },
      });
    }
    if (!site || site.status !== "live" || site.is_active !== true) return notFound();

    const { pages } = normalisePages(site.pages);
    const url = publishedSiteUrl(check.subdomain, getSiteUrl(), process.env.PUBLISHED_SITE_DOMAIN);
    const xml = buildSitemapXml(
      siteSitemapEntries(
        url,
        pages.map((pg) => pg.slug),
        site.updated_at
      )
    );

    return new Response(xml, {
      status: 200,
      headers: {
        "Content-Type": "application/xml; charset=utf-8",
        // A sitemap is meant to be fetched repeatedly by crawlers; an
        // hour of cache is the difference between a polite crawl and a
        // database read per bot per page.
        "Cache-Control": "public, max-age=3600",
        "X-Content-Type-Options": "nosniff",
        "X-Robots-Tag": "noindex",
      },
    });
  } catch (err) {
    logApiError("/s/[subdomain]/sitemap.xml", err);
    return new Response("Temporarily unavailable.", {
      status: 503,
      headers: { "Content-Type": "text/plain; charset=utf-8", "Retry-After": "30" },
    });
  }
}

function notFound(): Response {
  return new Response("Not found.", {
    status: 404,
    headers: { ...notFoundHeaders(), "Content-Type": "text/plain; charset=utf-8" },
  });
}
