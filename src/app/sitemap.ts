import type { MetadataRoute } from "next";
import { getSiteUrl } from "@/lib/site-url";

const BASE_URL = getSiteUrl();

// Only the public pages meant to be indexed — dashboard/auth routes are
// excluded (see robots.ts) since they require a session either way.
export default function sitemap(): MetadataRoute.Sitemap {
  const routes = ["", "/pricing", "/terms", "/privacy"];
  const lastModified = new Date();

  return routes.map((route) => ({
    url: `${BASE_URL}${route}`,
    lastModified,
  }));
}
