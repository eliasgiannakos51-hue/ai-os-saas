import type { MetadataRoute } from "next";

const BASE_URL = process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000";

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
