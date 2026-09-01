import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { logApiError } from "@/lib/log-error";
import { normaliseNavPath, normaliseNavReferrer } from "@/lib/nav/nav-path";

export const dynamic = "force-dynamic";

/**
 * Record one dashboard navigation.
 *
 * WHY THE NORMALISER RUNS HERE AND NOT IN THE BROWSER. The client sends
 * `window.location.pathname`, which is a value the client controls. If
 * lib/nav/nav-path.ts ran there, `path` would be whatever a hand-written
 * POST decided to send — and the whole argument for this table being safe
 * to keep is that it can only ever contain routes that exist in this app,
 * with no query strings and no identifiers. So the raw value crosses the
 * wire and is matched against the route list on this side.
 *
 * THROUGH THE CALLER'S OWN CLIENT, never createAdminClient. `user_id`
 * comes from auth.getUser() rather than from the body, and the row is
 * written under the caller's JWT so the insert policy
 * (`auth.uid() = user_id`) is what makes "a user may only record their
 * own navigation" true rather than merely intended.
 *
 * FAILS QUIET, ON PURPOSE. This runs on every screen change. A missed
 * navigation costs one row out of a ninety-day window; an error toast on
 * a page that rendered perfectly costs the reader's trust in the page.
 * The two cases that DO return non-200 are the ones a caller can act on:
 * no session (401) and a body that is not a dashboard path (400) — and
 * the second one is how scripts/tests/nav-events.itest.mjs can tell
 * "rejected" apart from "accepted and dropped".
 */
export async function POST(request: Request) {
  try {
    const body = (await request.json().catch(() => null)) as
      | { path?: unknown; referrer?: unknown }
      | null;

    const path = normaliseNavPath(body?.path);
    if (!path) {
      // NO PROSE IN ANY OF THESE. Nothing renders this body: the only
      // caller is NavTracker, which discards the response, and a status
      // code is what a log or a curl needs. An English sentence here
      // would be one more untranslated string on a server route, which
      // is exactly what i18n-coverage.test.mjs ratchets down.
      return NextResponse.json({ ok: false }, { status: 400 });
    }
    const referrer = normaliseNavReferrer(body?.referrer);

    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ ok: false }, { status: 401 });

    const { error } = await supabase
      .from("nav_events")
      .insert({ user_id: user.id, path, referrer });

    if (error) {
      logApiError("/api/nav/track", error, { stage: "insert" });
      return NextResponse.json({ ok: false }, { status: 200 });
    }
    return NextResponse.json({ ok: true, path });
  } catch (err) {
    logApiError("/api/nav/track", err);
    return NextResponse.json({ ok: false }, { status: 200 });
  }
}
