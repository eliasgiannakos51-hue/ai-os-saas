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
      disallow: ["/dashboard", "/api", "/login", "/forgot-password", "/reset-password"],
    },
    sitemap: `${BASE_URL}/sitemap.xml`,
  };
}
