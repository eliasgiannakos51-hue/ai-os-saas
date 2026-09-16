import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { checkCronAuth } from "@/lib/cron-auth";
import { logApiError } from "@/lib/log-error";
import { NAV_RETENTION_DAYS } from "@/lib/nav/nav-path";

export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";
// The sweep is one indexed DELETE (nav_events_created_at_idx). It is
// seconds on a normal day and can be minutes the first time it runs
// against a table that has been accumulating without one — which is
// exactly the run that must not be killed halfway. 300 with the marker
// scripts/tests/function-limits.test.mjs requires, so the number is
// declared rather than inherited from whatever tier this deploys to.
export const maxDuration = 300; // @function-limit 300

/**
 * Ninety days of navigation history, and not a day more.
 *
 * WHY A CRON ROUTE AND NOT pg_cron. Nothing in this schema uses pg_cron —
 * the eight other recurring jobs are all Vercel Cron entries in
 * vercel.json calling a route like this one, and a retention sweep that
 * lives somewhere no other scheduled job lives is a retention sweep
 * nobody remembers to check when it stops running.
 *
 * WHY IT CANNOT SIMPLY SEND A DELETE. No role has DELETE on nav_events:
 * see the migration's section 3, which is what makes the table
 * append-only from the app's side. The deletion happens inside
 * public.prune_nav_events(), a security-definer function granted to
 * service_role alone, whose day count is clamped to at least 1 so that a
 * bad argument can never widen the sweep to "everything up to now".
 *
 * REPORTS THE COUNT. A retention job that returns `{ok: true}` and
 * nothing else cannot be distinguished from one that has been deleting
 * zero rows for six months because the function was dropped. The number
 * is the evidence.
 *
 * Auth: CRON_SECRET, fail-closed, same as every other cron route.
 */
export async function GET(request: Request) {
  const auth = checkCronAuth(request);
  if (!auth.ok) return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });

  try {
    const admin = createAdminClient();
    const { data, error } = await admin.rpc("prune_nav_events", {
      p_days: NAV_RETENTION_DAYS,
    });
    if (error) throw error;

    // THE SECOND APPEND-ONLY LOG, SWEPT BY THE SAME JOB AND ON THE SAME
    // WINDOW. transition_suggestions records what the product offered
    // somebody and what they did about it (20260927000000); it is the
    // same shape of data, kept for the same ninety days, and giving it a
    // cron of its own would mean two schedules that can drift apart in
    // vercel.json — and one of them silently not running is exactly how
    // retention stops working without anybody noticing.
    //
    // COUNTED SEPARATELY. Two numbers in the body rather than a sum,
    // because a total of zero cannot tell you which of the two functions
    // was dropped.
    const { data: suggestionsData, error: suggestionsError } = await admin.rpc(
      "prune_transition_suggestions",
      { p_days: NAV_RETENTION_DAYS }
    );
    if (suggestionsError) throw suggestionsError;

    // THE THIRD SWEEP, AND THE ONE NOTHING WAS RUNNING.
    //
    // public.prune_orphan_project_links() was written in 20261001 as the
    // safety net beside the AFTER DELETE trigger on public.projects: the
    // trigger removes an in_project edge when a project goes, and this
    // removes edges "written before this migration ran, or by any path
    // that removed a project without going through the trigger". No
    // application code ever called it — found on 2026-09-16 by listing
    // every prune_* function against its callers, where it was the only
    // one with none.
    //
    // NOT ITS OWN CRON, for the reason the paragraph above gives about
    // transition_suggestions: two schedules drift, and one of them
    // silently not running is how retention stops working without anybody
    // noticing.
    //
    // IT TAKES NO DAY COUNT. The other two sweep by age; this one deletes
    // only edges whose project is ALREADY GONE, so there is nothing to
    // keep for ninety days — an orphan edge is wrong the moment it exists.
    const { data: orphanData, error: orphanError } = await admin.rpc("prune_orphan_project_links");
    if (orphanError) throw orphanError;

    const deleted = typeof data === "number" ? data : 0;
    const deletedSuggestions = typeof suggestionsData === "number" ? suggestionsData : 0;
    // COUNTED SEPARATELY, like the other two: a total cannot tell you
    // which of the three functions was dropped.
    const deletedOrphanLinks = typeof orphanData === "number" ? orphanData : 0;
    return NextResponse.json({
      ok: true,
      deleted,
      deletedSuggestions,
      deletedOrphanLinks,
      retentionDays: NAV_RETENTION_DAYS,
    });
  } catch (err) {
    logApiError("/api/cron/nav-retention", err);
    // The reason is in logApiError above, where an operator reads it;
    // repeating it as English in a body nothing renders would add an
    // untranslated string to a server route for no reader.
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}
