import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { logApiError } from "@/lib/log-error";
import { getSiteUrl } from "@/lib/site-url";
import { recordClick } from "@/lib/notify/tracking";
import { safeNotificationUrl } from "@/lib/notifications/store";

export const dynamic = "force-dynamic";

/**
 * RULE 5: ONE CLICK GOES TO THE RELEVANT PLACE.
 *
 * Every link in every notification — email, Telegram, Discord, the bell —
 * points here rather than straight at the destination, for two reasons
 * that are really one:
 *
 *   The click is the only honest measure of whether a notification type
 *   is worth sending. Email opens are not (a prefetched pixel is not a
 *   human — see lib/notify/engagement.ts), so if the click is not
 *   recorded there is nothing left to measure, and "if the click rate is
 *   under 10% the type is not worth sending" becomes an opinion.
 *
 *   And going through one route means the destination is resolved from
 *   the notification row rather than from the URL, so a link that has
 *   been sitting in an inbox for a month still lands somewhere that
 *   exists.
 *
 * AUTHENTICATION IS REQUIRED and is not a formality here. The click is
 * recorded against the signed-in user and the row is looked up by
 * (id, user_id) — so following somebody else's link records nothing,
 * reveals nothing, and lands on the dashboard. Unauthenticated, it
 * redirects to login WITHOUT recording anything: a click by somebody who
 * turns out not to be the owner is not a click.
 */
export async function GET(_request: Request, { params }: { params: { id: string } }) {
  const site = getSiteUrl();
  const fallback = `${site}/dashboard`;

  // Rejected before any database work. A path segment that is not a uuid
  // is either a scanner or a mangled link, and neither should reach a
  // query.
  const id = params.id;
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) {
    return NextResponse.redirect(fallback, { status: 302 });
  }

  try {
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      // `next` so the click completes after login instead of dumping the
      // user on a dashboard with no idea what they were told about.
      return NextResponse.redirect(`${site}/login?next=${encodeURIComponent(`/api/n/${id}`)}`, { status: 302 });
    }

    const { url } = await recordClick({ notificationId: id, userId: user.id });
    // Re-checked on the way out even though it was checked on the way in.
    // The destination is the one piece of a notification that could have
    // been written by an older version of the app, and a redirect is the
    // one place an absolute URL would take somebody off the product.
    const safe = safeNotificationUrl(url);
    return NextResponse.redirect(safe ? `${site}${safe}` : fallback, { status: 302 });
  } catch (err) {
    logApiError("api:notification-click", err, { id });
    return NextResponse.redirect(fallback, { status: 302 });
  }
}
