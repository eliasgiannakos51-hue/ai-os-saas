import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { checkAndUnlockAchievements } from "@/lib/achievements";
import { logApiError } from "@/lib/log-error";

export const dynamic = "force-dynamic";

/**
 * Reconcile achievements — OFF the page's critical path.
 *
 * WHAT THIS MOVED, and why the move is the fix. This app has no cron for
 * gamification, so achievements were reconciled inside dashboard/layout.tsx:
 * every dashboard page load awaited checkAndUnlockAchievements before it
 * could render anything. For an account that has not unlocked everything
 * yet — which is every account, for months — that is one read of
 * user_achievements followed by a fan-out of ~20 counted reads plus two
 * streak scans across all 14 classifier modules. Measured against a mock
 * database with a 25ms round trip, that fan-out was the largest single
 * block of server time on every navigation, and it produced a visible
 * result on almost none of them.
 *
 * The work still has to happen; it does not have to happen BEFORE the
 * page. The bridge component asks for it once the page is interactive and
 * shows the toast when something is actually unlocked — the same outcome,
 * a page load later at worst, off the path the user is waiting on.
 *
 * POST, not GET: it inserts rows.
 */
export async function POST() {
  try {
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ ok: false, error: "unauthorised" }, { status: 401 });
    }
    const unlocked = await checkAndUnlockAchievements(supabase, user.id);
    return NextResponse.json({ ok: true, unlocked });
  } catch (err) {
    logApiError("/api/achievements/check", err);
    // Never an error the user has to read: nothing they did failed, and
    // the next call reconciles whatever this one missed.
    return NextResponse.json({ ok: true, unlocked: [] });
  }
}
