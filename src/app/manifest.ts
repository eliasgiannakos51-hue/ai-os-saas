import type { MetadataRoute } from "next";

/**
 * The web app manifest — the file a mobile browser reads to decide what
 * to call this site.
 *
 * It did not exist before, and that is the whole of the "my site is
 * called Vercel on my phone" bug. With no manifest and no
 * apple-mobile-web-app-title, Chrome and Safari fall back to whatever
 * they can scrape — and on a *.vercel.app deployment the most
 * name-shaped thing available is the host, which reads as Vercel. Adding
 * a manifest with an explicit name is the fix; nothing else can override
 * that fallback.
 *
 * `short_name` is what actually appears under the home-screen icon, and
 * it is what gets truncated first, so it is the bare brand rather than
 * the full tagline title.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Ionexa AI",
    short_name: "Ionexa AI",
    description:
      "Your business, organized — with AI that actually helps. Ideas, research, finance, trading and product planning in one workspace.",
    start_url: "/dashboard/overview",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#0a0a0a",
    theme_color: "#0a0a0a",
    categories: ["productivity", "business"],
    icons: [
      // Served by the Next.js file conventions in this same directory —
      // src/app/icon.svg and src/app/apple-icon.tsx.
      {
        src: "/icon.svg",
        sizes: "any",
        type: "image/svg+xml",
        purpose: "any",
      },
      {
        src: "/apple-icon",
        sizes: "180x180",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/ionexa-email-logo.png",
        sizes: "256x256",
        type: "image/png",
        purpose: "any",
      },
    ],
  };
}
