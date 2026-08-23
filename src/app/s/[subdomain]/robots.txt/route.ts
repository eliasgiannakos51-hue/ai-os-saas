import { createAdminClient } from "@/lib/supabase/admin";
import { logApiError } from "@/lib/log-error";
import { validateSubdomain, publishedSiteUrl } from "@/lib/publishing/subdomain";
import { getSiteUrl } from "@/lib/site-url";
import { buildRobotsTxt } from "@/lib/seo/sitemap";
import { notFoundHeaders, publicRequestAllowed } from "@/lib/publishing/public-serving";

export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";
export const revalidate = 0;

/**
 * One published site's robots.txt.
 *
 * WHAT THIS DOES AND DOES NOT DO, because the difference matters and is
 * invisible. A crawler reads robots.txt from the HOST ROOT. Published
 * sites are served at /s/<subdomain> today, so the file that actually
 * governs crawling of a customer's site is this app's own /robots.txt —
 * which names /s/ explicitly and points at the root sitemap. This file
 * is what a site owner hands to Search Console alongside their sitemap,
 * and it is already correct for the day a wildcard domain puts each site
 * on its own host and this becomes the file at that host's root.
 *
 * It exists rather than 404ing because a missing robots.txt is a thing
 * owners ask about, and because publishing one that is WRONG later is
 * harder than publishing the right one now.
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
      .select("status, is_active")
      .eq("subdomain", check.subdomain)
      .maybeSingle();

    if (error) {
      logApiError("/s/[subdomain]/robots.txt", error, { stage: "load_site" });
      return new Response("Temporarily unavailable.", {
        status: 503,
        headers: { "Content-Type": "text/plain; charset=utf-8", "Retry-After": "30" },
      });
    }
    if (!site || site.status !== "live" || site.is_active !== true) return notFound();

    const url = publishedSiteUrl(check.subdomain, getSiteUrl(), process.env.PUBLISHED_SITE_DOMAIN);
    return new Response(buildRobotsTxt(url), {
      status: 200,
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "Cache-Control": "public, max-age=3600",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (err) {
    logApiError("/s/[subdomain]/robots.txt", err);
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
