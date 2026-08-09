import type { MetadataRoute } from "next";
import { getSiteUrl } from "@/lib/site-url";

const BASE_URL = getSiteUrl();

// Only the public pages meant to be indexed — dashboard/auth routes are
// excluded (see robots.ts) since they require a session either way.
export default function sitemap(): MetadataRoute.Sitemap {
  // /help is public on purpose (see app/help/page.tsx): half the questions
  // it answers are asked before anyone signs up, so it belongs in the
  // index alongside /pricing.
  const routes = ["", "/pricing", "/help", "/terms", "/privacy"];
  const lastModified = new Date();

  return routes.map((route) => ({
    url: `${BASE_URL}${route}`,
    lastModified,
  }));
}
