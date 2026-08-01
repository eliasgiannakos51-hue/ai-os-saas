import "server-only";

// Resolves this app's own absolute base URL — used everywhere an outbound
// link needs to point back at the site itself: Stripe Checkout
// success_url/cancel_url and the billing portal return_url, email
// confirmation/reset links, sitemap.xml/robots.txt, and the root layout's
// metadataBase (OG image URLs).
//
// NEXT_PUBLIC_SITE_URL is the explicit override (set it to your real
// custom domain in Vercel's Production env vars). Without it, every one of
// those call sites used to fall straight through to "http://localhost:3000"
// — harmless locally, but on a real deployment that means Stripe redirects
// a paying customer's browser to their own machine after checkout (which
// is exactly what happened: ERR_CONNECTION_REFUSED after a successful
// payment, because success_url pointed at localhost). Falling back to
// Vercel's own automatically-injected VERCEL_PROJECT_PRODUCTION_URL /
// VERCEL_URL first means every link self-heals to a real, reachable URL
// on Vercel even if NEXT_PUBLIC_SITE_URL is never configured — it only
// really matters once a custom domain is in use instead of the assigned
// *.vercel.app one.
export function getSiteUrl(): string {
  if (process.env.NEXT_PUBLIC_SITE_URL) return process.env.NEXT_PUBLIC_SITE_URL;

  const vercelHost = process.env.VERCEL_PROJECT_PRODUCTION_URL || process.env.VERCEL_URL;
  if (vercelHost) return `https://${vercelHost}`;

  return "http://localhost:3000";
}
