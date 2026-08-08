import { createAdminClient } from "@/lib/supabase/admin";
import { logApiError } from "@/lib/log-error";
import { validateSubdomain } from "@/lib/publishing/subdomain";
import {
  publishedSiteHeaders,
  notFoundHeaders,
  isLikelyNewVisitor,
  publicRequestAllowed,
  withAiContentMarking,
} from "@/lib/publishing/public-serving";

export const dynamic = "force-dynamic";
// force-no-store is NOT redundant next to force-dynamic, and finding that
// out cost a confusing hour.
//
// Next patches global fetch with its Data Cache, and @supabase/supabase-js
// reads through that same fetch. The cache is written to .next/cache and
// PERSISTS ACROSS BUILDS AND RESTARTS. In
// scripts/tests/published-site.prodtest.mjs the first run hit the database
// stub and every later run served the identical page having made ZERO
// requests to it — the stub recorded no calls at all while the route
// happily returned 200 with the right bytes.
//
// In production that is: a live edit that never appears, and a view
// counter that stops moving, both silently and both looking like "the
// site is fine". force-dynamic governs the ROUTE's own caching; this
// governs the fetches the route makes.
export const fetchCache = "force-no-store";
export const revalidate = 0;

// The public web.
//
// This is the only route in the application that serves a stranger, with
// no session, whatever HTML another user's AI generated. Four things
// follow from that and none of them are optional:
//
//   1. NO SESSION IS READ. It uses the admin client and selects only the
//      columns a visitor needs. There is deliberately no public RLS policy
//      on published_sites (see the migration): a visitor must not be able
//      to read the table at all, only to receive one site's HTML.
//   2. THE HEADERS ARE THE SANDBOX. lib/publishing/public-serving.ts sets
//      a CSP that permits the inline CSS/JS a single-file generated site
//      needs and nothing else — no external script host, form-action
//      'self', frame-ancestors 'none', base-uri 'none'.
//   3. IT IS RATE LIMITED IN MEMORY, not through the database — a DB write
//      per page view would make the limiter the outage under a spike.
//   4. IT IS SERVED AS A ROUTE HANDLER, not a page. A React page would
//      have to inject the HTML with dangerouslySetInnerHTML into our own
//      document, inheriting our <head>, our scripts and our origin's
//      React runtime. Returning the bytes as their own document is both
//      safer and exactly what the user published.
//
// Path-based (/s/acme) until there is a wildcard domain to serve
// acme.ionexa.ai from — see publishedSiteUrl().
export async function GET(request: Request, { params }: { params: { subdomain: string } }) {
  try {
    if (!publicRequestAllowed(request)) {
      return new Response("Too many requests.", {
        status: 429,
        headers: { "Content-Type": "text/plain; charset=utf-8", "Retry-After": "60" },
      });
    }

    // Validated, not just trimmed: this string goes into a query, and a
    // subdomain that could never have been stored is a 404 without a
    // database round trip.
    const check = validateSubdomain(params.subdomain);
    if (!check.ok) return notFoundResponse();

    const admin = createAdminClient();
    const { data: site, error } = await admin
      .from("published_sites")
      .select("id, user_id, html_content, status, is_active, updated_at")
      .eq("subdomain", check.subdomain)
      .maybeSingle();

    if (error) {
      logApiError("/s/[subdomain]", error, { stage: "load_site" });
      // A database hiccup is not "this site does not exist" — saying so
      // would tell search engines to drop a live customer's page.
      return new Response(SERVICE_UNAVAILABLE_HTML, {
        status: 503,
        headers: { ...notFoundHeaders(), "Retry-After": "30" },
      });
    }

    if (!site || site.status !== "live" || site.is_active !== true) {
      return notFoundResponse();
    }

    // AWAITED, not fire-and-forget.
    //
    // `void recordView(...)` reads as the cheaper option and is wrong here:
    // a serverless function is frozen the moment its response is returned,
    // so work scheduled after that point runs sometimes, on a warm
    // instance, and silently never on a cold one. Views would go missing at
    // a rate nobody could explain from either the code or the numbers —
    // caught by scripts/tests/published-site.prodtest.mjs, which counted
    // the RPC and saw zero on some runs and one on others.
    //
    // recordView never throws and never rejects (it swallows and logs), so
    // awaiting it cannot fail the page — it only makes the write actually
    // happen. One indexed upsert against the site's own row is a
    // sub-millisecond cost on a response that already did a select.
    await recordView(admin, site.id, site.user_id, isLikelyNewVisitor(request, String(site.id)));

    return new Response(withAiContentMarking(site.html_content), {
      status: 200,
      headers: {
        ...publishedSiteHeaders(),
        // Lets a CDN and a browser skip the body entirely on a repeat
        // visit to an unchanged page.
        "Last-Modified": new Date(site.updated_at).toUTCString(),
      },
    });
  } catch (err) {
    logApiError("/s/[subdomain]", err);
    return new Response(SERVICE_UNAVAILABLE_HTML, {
      status: 503,
      headers: { ...notFoundHeaders(), "Retry-After": "30" },
    });
  }
}

async function recordView(
  admin: ReturnType<typeof createAdminClient>,
  siteId: string,
  userId: string,
  isUnique: boolean
): Promise<void> {
  try {
    // One atomic RPC: read-then-write from here would lose counts under
    // exactly the concurrency a popular page has.
    const { error } = await admin.rpc("record_site_view", {
      p_site_id: siteId,
      p_user_id: userId,
      p_is_unique: isUnique,
    });
    if (error) logApiError("/s/[subdomain]", error, { stage: "record_view" });
  } catch (err) {
    logApiError("/s/[subdomain]", err, { stage: "record_view_unhandled" });
  }
}

function notFoundResponse(): Response {
  return new Response(NOT_FOUND_HTML, { status: 404, headers: notFoundHeaders() });
}

// Deliberately self-contained and tiny: it is served under a CSP of
// `default-src 'none'`, so it cannot load a stylesheet, a font or an
// image, and it must still look deliberate rather than broken. It also
// must not say whether the address was never taken or was withdrawn —
// that would turn this page into a way to enumerate customers.
const NOT_FOUND_HTML = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Site not found</title>
<style>
  body { margin:0; min-height:100vh; display:flex; align-items:center; justify-content:center;
         background:#090909; color:#f5f5f5;
         font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif; }
  main { text-align:center; padding:32px; max-width:28rem; }
  h1 { font-size:20px; margin:0 0 10px; font-weight:600; }
  p { margin:0; color:#a3a3a3; font-size:14px; line-height:1.6; }
</style>
</head>
<body>
<main>
  <h1>This site isn't available</h1>
  <p>The address you followed doesn't point to a published site.</p>
</main>
</body>
</html>`;

const SERVICE_UNAVAILABLE_HTML = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Temporarily unavailable</title>
<style>
  body { margin:0; min-height:100vh; display:flex; align-items:center; justify-content:center;
         background:#090909; color:#f5f5f5;
         font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif; }
  main { text-align:center; padding:32px; max-width:28rem; }
  h1 { font-size:20px; margin:0 0 10px; font-weight:600; }
  p { margin:0; color:#a3a3a3; font-size:14px; line-height:1.6; }
</style>
</head>
<body>
<main>
  <h1>Temporarily unavailable</h1>
  <p>This site is live — we just couldn't reach it this second. Please try again shortly.</p>
</main>
</body>
</html>`;
