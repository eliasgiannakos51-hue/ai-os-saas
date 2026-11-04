import { createAdminClient } from "@/lib/supabase/admin";
import { logApiError } from "@/lib/log-error";
import { validateSubdomain } from "@/lib/publishing/subdomain";
import { checkAppHtml } from "@/lib/rebuild/rebuild-html";
import { publishedSiteHeaders, notFoundHeaders, publicRequestAllowed } from "@/lib/publishing/public-serving";

export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";
export const revalidate = 0;

// THE PUBLIC WEB FOR A REBUILD APP (Κομμάτι 4's third piece) — the same
// boundary /s/[subdomain]/route.ts already is for sites, at its own
// address and with its own gate:
//
//   1. NO SESSION IS READ. Admin client, columns a stranger needs only —
//      there is no public RLS policy on rebuild_projects (the migration
//      deliberately leaves none), so a visitor cannot read the table at
//      all, only receive one app's html for a live subdomain.
//   2. THE HEADERS ARE THE SAME SANDBOX: publishedSiteHeaders' CSP
//      already permits the inline script/style one generated document
//      needs and nothing past it — this is one more document served
//      under it, not a new policy to maintain.
//   3. RATE LIMITED the same way, in memory (lib/publishing/public-
//      serving.ts) — not DB-backed, so a spike cannot make the limiter
//      itself the outage.
//   4. CHECKED AGAIN, FAIL-CLOSED, RIGHT HERE: checkAppHtml already ran
//      once before the row could be written (rebuild-call.ts's safe()
//      wrapper — forbidden network calls, the self-test's dead-button
//      check), but this is the moment the HTML stops being a sandboxed
//      preview inside the account's own session and starts being served
//      from our origin to a stranger with no session at all. Re-running
//      the same static check here is the Site publish route's own
//      stated reason for its pre-publish scan, applied at read time
//      instead of write time because there is no separate publish step
//      that could run it first — Rebuild apps are built once and stay
//      exactly the bytes they were built as.
//
// No view counting, unlike published_sites: Rebuild has no per-app
// analytics table and this round did not ask for one.
export async function GET(request: Request, props: { params: Promise<{ subdomain: string }> }) {
  const params = await props.params;
  try {
    if (!publicRequestAllowed(request)) {
      return new Response("Too many requests.", {
        status: 429,
        headers: { "Content-Type": "text/plain; charset=utf-8", "Retry-After": "60" },
      });
    }

    const check = validateSubdomain(params.subdomain);
    if (!check.ok) return notFoundResponse();

    const admin = createAdminClient();
    const { data: app, error } = await admin
      .from("rebuild_projects")
      .select("id, html, is_active, updated_at")
      .eq("subdomain", check.subdomain)
      .maybeSingle();

    if (error) {
      logApiError("/a/[subdomain]", error, { stage: "load_app" });
      return new Response(SERVICE_UNAVAILABLE_HTML, {
        status: 503,
        headers: { ...notFoundHeaders(), "Retry-After": "30" },
      });
    }

    if (!app || app.is_active !== true || typeof app.html !== "string") return notFoundResponse();

    const safe = checkAppHtml(app.html);
    if (!safe.ok) {
      // A row that passed the check once and would not pass it again
      // (the check itself changed since) is served as absent rather
      // than as whatever it is — never the one surface with no session
      // to catch it on.
      logApiError("/a/[subdomain]", new Error(`stored app failed re-check: ${safe.reason}`), { stage: "recheck" });
      return notFoundResponse();
    }

    return new Response(safe.html, {
      status: 200,
      headers: {
        ...publishedSiteHeaders(),
        "Last-Modified": new Date(app.updated_at).toUTCString(),
      },
    });
  } catch (err) {
    logApiError("/a/[subdomain]", err);
    return new Response(SERVICE_UNAVAILABLE_HTML, {
      status: 503,
      headers: { ...notFoundHeaders(), "Retry-After": "30" },
    });
  }
}

function notFoundResponse(): Response {
  return new Response(NOT_FOUND_HTML, { status: 404, headers: notFoundHeaders() });
}

// Deliberately self-contained and tiny, same reasoning as the sites
// route's own: served under default-src 'none', must still read as
// deliberate, and must never say whether an address was never taken or
// was withdrawn.
const NOT_FOUND_HTML = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>App not found</title>
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
  <h1>This app isn't available</h1>
  <p>The address you followed doesn't point to a published app.</p>
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
  <p>This app is live — we just couldn't reach it this second. Please try again shortly.</p>
</main>
</body>
</html>`;
