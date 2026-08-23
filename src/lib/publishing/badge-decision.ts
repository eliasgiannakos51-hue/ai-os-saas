import "server-only";
import { logApiError } from "@/lib/log-error";

/**
 * DOES THIS SITE SHOW THE BADGE, RIGHT NOW — one round trip.
 *
 * ON THE HOTTEST PATH IN THE PRODUCT: every public page view of every
 * published site. Before credit-based removal existed the serve path
 * asked one question (what plan is the owner on?) through
 * account_tier(). Adding a second query per view would have doubled that
 * path for every visitor of every site, so the whole decision moved into
 * public.site_shows_badge(), which answers it in one call.
 *
 * IT TAKES A SITE ID AND RETURNS A BOOLEAN. The visitor is anonymous and
 * the answer is about somebody else's account, so nothing else may come
 * back: no tier, no user id, no balance, and no way to enumerate.
 *
 * FAILS TOWARDS THE BADGE. A hiccup that shows the badge on a paying
 * customer's site is visible to somebody who can tell us. One that hides
 * it on a free site costs us the upsell on every view, silently, until
 * somebody happens to look.
 *
 * THIS REPLACED lib/publishing/owner-tier.ts, which asked account_tier()
 * for a plan slug and left the caller to decide. Two decision paths for
 * one question is one of them going stale, so the old one was deleted
 * rather than left beside this.
 *
 * THE BADGE IS STILL NEVER STORED. This is read at serve time from the
 * current state — the plan and the current month's purchase — so an
 * upgrade removes it immediately, a lapse restores it immediately, and
 * the stored HTML has never contained it.
 */
type RpcClient = {
  rpc: (fn: string, args: Record<string, unknown>) => PromiseLike<{ data: unknown; error: unknown }>;
};

export async function readSiteShowsBadge(admin: RpcClient, siteId: string): Promise<boolean> {
  try {
    const { data, error } = await admin.rpc("site_shows_badge", { p_site_id: siteId });
    if (error) throw error;
    // A NON-BOOLEAN IS NOT A FALSE. Postgres returns a real boolean here;
    // anything else means the call did not do what this function thinks
    // it did, and the safe reading of "I do not know" is "show it".
    return typeof data === "boolean" ? data : true;
  } catch (err) {
    logApiError("publishing:badge-decision", err, { siteId });
    return true;
  }
}
