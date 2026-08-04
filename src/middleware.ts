import { createServerClient, type CookieOptions } from "@supabase/ssr";
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
    // eslint-disable-next-line no-console
    console.error(
      `[middleware-diag] ${request.nextUrl.pathname} at ${new Date().toISOString()} -> user=${
        user?.id ?? "null"
      } error=${middlewareUserError?.message ?? "none"} cookieRefreshed=${cookieRefreshHappened}`
    );
  }

  const isAuthRoute =
    request.nextUrl.pathname.startsWith("/login") ||
    request.nextUrl.pathname.startsWith("/signup");
  const isDashboardRoute = request.nextUrl.pathname.startsWith("/dashboard");

  if (!user && isDashboardRoute) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }

  if (user && isAuthRoute) {
    const url = request.nextUrl.clone();
    url.pathname = "/dashboard/overview";
    return NextResponse.redirect(url);
  }

  return response;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
