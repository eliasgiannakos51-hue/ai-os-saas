import type { MetadataRoute } from "next";
import { getSiteUrl } from "@/lib/site-url";
import { FOOTER_LINKS } from "@/lib/footer-links";

const BASE_URL = getSiteUrl();

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      // /s/ NAMED EXPLICITLY. It is already covered by "/", and being
      // covered by a wildcard is not the same as being stated: this is
      // the only robots.txt a crawler reads for a customer's published
      // site (the per-site /s/<subdomain>/robots.txt is not at a host
      // root, so nothing reads it as a directive), and a later tightening
      // of the rules here would take every customer site offline from
      // search without anyone connecting the two.
      //
      // THE PUBLIC PAGES COME FROM lib/footer-links.ts, for the reason
      // written out in sitemap.ts: this list was hand-kept and had
      // drifted, missing /cookies and /roadmap. "/" already permits all
      // of them, so the entries are documentation rather than
      // permission — but documentation that disagrees with the app is
      // worse than none, and it is what a person reads to learn which
      // pages are meant to be indexed.
      allow: ["/", ...FOOTER_LINKS.map((l) => l.href), "/s/"],
      // /shared/ (Projects Κομμάτι 7): each address is one project's own
      // secret, revocable link — "/" already permits it like every other
      // page, so without this a crawler that found one (pasted somewhere
      // public, say) would index and cache a project's content even
      // after the owner presses Revoke. The page's own noindex meta
      // (src/app/shared/[token]/page.tsx) is the second, independent
      // layer: this line stops the crawl, that one stops the index if
      // something crawls it anyway.
      disallow: ["/dashboard", "/api", "/login", "/forgot-password", "/reset-password", "/shared"],
    },
    sitemap: `${BASE_URL}/sitemap.xml`,
  };
}
