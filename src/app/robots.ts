import type { MetadataRoute } from "next";
import { getSiteUrl } from "@/lib/site-url";

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
      allow: ["/", "/pricing", "/terms", "/privacy", "/s/"],
      disallow: ["/dashboard", "/api", "/login", "/forgot-password", "/reset-password"],
    },
    sitemap: `${BASE_URL}/sitemap.xml`,
  };
}
