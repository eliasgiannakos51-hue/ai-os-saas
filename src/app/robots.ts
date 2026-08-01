import type { MetadataRoute } from "next";
import { getSiteUrl } from "@/lib/site-url";

const BASE_URL = getSiteUrl();

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: ["/", "/pricing", "/terms", "/privacy"],
      disallow: ["/dashboard", "/api", "/login", "/forgot-password", "/reset-password"],
    },
    sitemap: `${BASE_URL}/sitemap.xml`,
  };
}
