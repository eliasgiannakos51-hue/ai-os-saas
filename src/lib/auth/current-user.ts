import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import type { AuthError, User } from "@supabase/supabase-js";

/**
 * The signed-in user, fetched once per request instead of once per file.
 *
 * THREE ROUND TRIPS PER NAVIGATION, MEASURED BY COUNTING THEM:
 *
 *   1. middleware.ts        supabase.auth.getUser()
 *   2. dashboard/layout.tsx supabase.auth.getUser()
 *   3. the page itself      supabase.auth.getUser()
 *
 * Every one is a call to the Supabase auth server that validates the same
 * JWT from the same cookie and returns the same answer, and 2 and 3 happen
 * inside ONE React render of ONE request.
 *
 * React's `cache()` is exactly the tool for that: it memoises per request
 * render, so the layout and the page share a single call, and two
 * different people's requests never share anything. Nothing about what is
 * validated changes — this is the same getUser(), asked once.
 *
 * WHAT THIS DELIBERATELY DOES NOT DO is collapse the middleware's call
 * into the other two. That one runs in a separate runtime, before the
 * render, so `cache()` cannot reach it; the only way across is for the
 * middleware to write the user into a request header and the render to
 * TRUST it. That is a change to an authentication boundary — get the
 * header-stripping wrong, or let one page route fall outside the
 * middleware matcher, and a browser can name whichever user it likes. It
 * is worth doing, and it is not worth doing without being able to run the
 * app and attack it, which is why it is written down here rather than
 * done.
 *
 * TWO CALLERS NEED THE ERROR, NOT JUST THE USER. Timeline and Mission log
 * it — they were the two pages where a degraded session looked exactly
 * like an empty account, and telling those apart is why the diagnostic
 * exists. So the cached function returns both, and `getCurrentUser` is
 * the common case spelled shortly. One call still, either way.
 */
export const getCurrentUserResult = cache(
  async (): Promise<{ user: User | null; error: AuthError | null }> => {
    const supabase = createClient();
    const { data, error } = await supabase.auth.getUser();
    return { user: data.user, error };
  },
);

export async function getCurrentUser(): Promise<User | null> {
  return (await getCurrentUserResult()).user;
}
