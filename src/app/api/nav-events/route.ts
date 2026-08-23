import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { checkRateLimit } from "@/lib/rate-limit";
import { logApiError } from "@/lib/log-error";
import { hasOptedOutOfNavAnalytics, isRecordableHref } from "@/lib/nav-analytics";

export const dynamic = "force-dynamic";

/**
 * Record one navigation: this user, this path, now.
 *
 * WHY THE USER-SCOPED CLIENT AND NOT THE ADMIN ONE. Every other write in
 * this app that goes through createAdminClient does so because it needs
 * to touch a row the caller does not own. This one never does — a person
 * records their own navigation and nobody else's — so RLS
 * (nav_events_insert_own) is the enforcement, and `user_id` comes from
 * the verified session rather than from the body. There is no shape of
 * request that writes a row attributed to someone else.
 *
 * WHAT THIS ROUTE REFUSES, and returns 204 for anyway:
 *   - an account that has opted out (checked HERE, not only in the
 *     client: a preference the browser is trusted to honour is not a
 *     preference)
 *   - an href that is not a bare same-origin page path — see
 *     lib/nav-analytics.ts's isRecordableHref for the three ways a
 *     search term or a record id would otherwise reach this table
 *
 * 204 rather than 400 for all of them, deliberately. This endpoint is
 * fire-and-forget from a click handler; a rejection is not something the
 * user did wrong and not something the UI can act on. Failing loudly
 * here would put an error toast in front of somebody for the crime of
 * clicking a link. The rejection still happens — the row is simply not
 * written.
 */
export async function POST(request: Request) {
  try {
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    // 401 HERE, 204 EVERYWHERE ELSE, and the difference is the point:
    // 401 means "I do not know who you are"; 204 means "I do know, and I
    // am deliberately not recording this". Collapsing the first into the
    // second would make an unauthenticated caller indistinguishable from
    // an opted-out one in the logs, and it breaks the convention every
    // other authenticated route in this app follows (asserted by
    // scripts/tests/security-posture.test.mjs).
    //
    // NO BODY, deliberately. Every other route pairs its 401 with
    // {error: "Not authenticated."}, and that English sentence is real
    // untranslated prose the i18n ratchet counts. Here it would be prose
    // nobody can ever read: this endpoint is called fire-and-forget from
    // a click handler and lib/nav-analytics-client.ts discards the
    // response without looking at it. The status code is the entire
    // message, so shipping a string to go with it would grow the
    // untranslated-English count to say something to no one.
    if (!user) return new NextResponse(null, { status: 401 });

    if (hasOptedOutOfNavAnalytics(user.user_metadata)) {
      return new NextResponse(null, { status: 204 });
    }

    // A ceiling, not a throttle. Real navigation is a handful of clicks a
    // minute; 300/hour is far above anything a person does and far below
    // what a stuck retry loop or a held-down key could write. Silent
    // (204) for the same reason as everything else here.
    const limited = await checkRateLimit({
      scope: "nav_event",
      identifier: user.id,
      maxAttempts: 300,
      windowMinutes: 60,
    });
    if (!limited.allowed) return new NextResponse(null, { status: 204 });

    const body = await request.json().catch(() => null);
    const href = body?.href;
    if (!isRecordableHref(href)) return new NextResponse(null, { status: 204 });

    // `at` is left to the column default (now()) rather than taken from
    // the client: a timestamp a browser supplies is a timestamp a browser
    // can be wrong about, and every question this table answers is about
    // ordering and elapsed time.
    const { error } = await supabase.from("nav_events").insert({ user_id: user.id, href });

    if (error) {
      // Logged, not surfaced. Losing one navigation row degrades a
      // statistic; it must never degrade the click that produced it.
      logApiError("/api/nav-events", error, { stage: "insert" });
    }

    return new NextResponse(null, { status: 204 });
  } catch (err) {
    logApiError("/api/nav-events", err);
    return new NextResponse(null, { status: 204 });
  }
}
