import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { diagLog } from "@/lib/diag";
import { NextResponse, type NextRequest } from "next/server";

export async function middleware(request: NextRequest) {
  let response = NextResponse.next({
    request: { headers: request.headers },
  });

  // TEMPORARY diagnostic logging for the "Mission Control/Timeline data
  // disappears on refresh" investigation — logs whether this request's
  // session cookie needed a refresh (session/auth-token-expiry hypothesis
  // from that investigation). Only fires for /dashboard routes so it
  // doesn't spam every asset/API request. Safe to remove once confirmed
  // live; see dashboard/mission/page.tsx and next.config.mjs for the rest
  // of this investigation's logging + the staleTimes fix.
  const isDashboardPath = request.nextUrl.pathname.startsWith("/dashboard");
  let cookieRefreshHappened = false;

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet: { name: string; value: string; options: CookieOptions }[]) {
          cookieRefreshHappened = true;
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request: { headers: request.headers } });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  const {
    data: { user },
    error: middlewareUserError,
  } = await supabase.auth.getUser();

  if (isDashboardPath) {
    diagLog(`[middleware-diag] ${request.nextUrl.pathname} at ${new Date().toISOString()} -> user=${
        user?.id ?? "null"
      } error=${middlewareUserError?.message ?? "none"} cookieRefreshed=${cookieRefreshHappened}`);
  }

  const isAuthRoute =
    request.nextUrl.pathname.startsWith("/login") ||
    request.nextUrl.pathname.startsWith("/signup");
  const isDashboardRoute = request.nextUrl.pathname.startsWith("/dashboard");

  // DEFECT 1 (fixed here): both redirects below used to return a FRESH
  // NextResponse.redirect(), which does not carry the cookies that
  // setAll() wrote onto `response` moments earlier.
  //
  // Why that loses data rather than just logging someone out: Supabase
  // ROTATES refresh tokens. When getUser() above refreshes an expired
  // access token, the old refresh token is spent server-side and a new
  // pair is written to `response`. If the request then redirects, that
  // response is discarded and the browser keeps the OLD, now-spent
  // cookies. The next request presents a refresh token Supabase has
  // already retired, the refresh fails, and the session silently
  // degrades to anonymous — at which point every RLS-scoped query
  // returns ZERO ROWS WITH NO ERROR, which is exactly what "my missions
  // disappeared" looks like from the outside.
  //
  // Copying the cookies onto the redirect keeps the rotation chain
  // intact across every response path, not just the pass-through one.
  function withRefreshedCookies(redirect: NextResponse): NextResponse {
    response.cookies.getAll().forEach((cookie) => redirect.cookies.set(cookie));
    return redirect;
  }

  if (!user && isDashboardRoute) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    return withRefreshedCookies(NextResponse.redirect(url));
  }

  if (user && isAuthRoute) {
    const url = request.nextUrl.clone();
    url.pathname = "/dashboard/overview";
    return withRefreshedCookies(NextResponse.redirect(url));
  }

  return response;
}

export const config = {
  matcher: [
    // Every request that isn't a static asset runs the auth check above,
    // which includes a Supabase getUser() round trip. Anything that is
    // fetched by a browser or an email client rather than navigated to
    // belongs in this exclusion list — .webmanifest was missing, so the
    // manifest fetch (which Next serves with crossorigin=use-credentials,
    // i.e. WITH cookies) paid for a full auth round trip on every cold
    // load. The same omission is what made the old extensionless
    // /email-logo route run middleware on every image fetch from every
    // inbox; that route is gone and its replacement is a real .png.
    // `s/` — published sites (V3 Task 2). These are served to the public
    // web with no session at all: the route reads through the service-role
    // client and never touches a cookie. Running the auth middleware on
    // them would add a Supabase getUser() round trip to every page view by
    // every anonymous visitor of every customer's site — the single
    // highest-traffic path in the product paying for a session lookup
    // whose result is discarded. Excluded for that reason, not to skip a
    // check: there is no check to skip.
    "/((?!_next/static|_next/image|favicon.ico|manifest.webmanifest|s/|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|webmanifest)$).*)",
  ],
};
