import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { logApiError } from "@/lib/log-error";
import {
  NOTIFICATION_TYPES,
  type NotificationChannel,
  type NotificationType,
} from "@/lib/notify/types";
import {
  engagementReport,
  type ChannelCounts,
  type TypeCounts,
  type TypeEngagement,
} from "@/lib/notify/engagement";

/**
 * THE DENOMINATOR.
 *
 * "If the click rate is under 10%, the type is not worth sending" is only
 * a decision if the refusals are counted too — a type that is suppressed
 * nine times out of ten and clicked every time it survives is not a type
 * with a 100% click rate, it is a type that barely fires. So every
 * outcome is recorded, including the ones where nothing was sent:
 *
 *   sent        — handed to a channel and it accepted
 *   opened      — the in-app row was read (email opens are NOT recorded;
 *                 see engagement.ts for why a prefetched pixel is not a
 *                 human)
 *   clicked     — somebody followed the link (rule 5's measurement)
 *   suppressed  — with the reason: not worth sending, opted out, grouped,
 *                 channel unavailable, provider refused
 *
 * Append-only, service-role only. A user who could insert here could
 * inflate the click rate of a type and change what the product decides is
 * worth sending.
 */

export type NotificationEvent = "sent" | "opened" | "clicked" | "suppressed";

export async function recordNotificationEvent(params: {
  userId: string;
  notificationId?: string | null;
  type: NotificationType | string;
  channel: NotificationChannel;
  event: NotificationEvent;
  reason?: string | null;
}): Promise<void> {
  try {
    const admin = createAdminClient();
    const { error } = await admin.from("notification_events").insert({
      user_id: params.userId,
      notification_id: params.notificationId ?? null,
      type: String(params.type).slice(0, 60),
      channel: params.channel,
      event: params.event,
      reason: params.reason ? params.reason.slice(0, 200) : null,
    });
    if (error) throw error;
  } catch (err) {
    // Never throws. Measurement failing must not stop a notification the
    // user is waiting for — the whole point of this module is that it
    // sits beside the delivery path, not in it.
    logApiError("notify:tracking", err, { stage: "record", event: params.event, type: params.type });
  }
}

/**
 * Records the click and hands back where to go — the two halves of rule 5
 * ("one click goes to the relevant place") in one call, so no route can
 * do the redirect without the measurement.
 */
export async function recordClick(params: {
  notificationId: string;
  userId: string;
}): Promise<{ url: string | null }> {
  try {
    const admin = createAdminClient();
    const { data, error } = await admin
      .from("user_notifications")
      .select("id, url, type, clicked_at")
      .eq("id", params.notificationId)
      // SCOPED TO THE OWNER even though this is the service-role client,
      // which bypasses RLS. A notification id in a URL is a guessable-ish
      // handle, and without this line clicking somebody else's id would
      // both record their click and reveal their destination.
      .eq("user_id", params.userId)
      .maybeSingle();
    if (error) throw error;
    if (!data) return { url: null };

    const nowIso = new Date().toISOString();
    // read_at as well: following the link is unambiguously having seen it.
    const patch: Record<string, string> = { read_at: nowIso };
    // FIRST CLICK ONLY for clicked_at, so a user who opens the same
    // notification twice does not become two clicks in the rate.
    if (!data.clicked_at) patch.clicked_at = nowIso;

    await admin.from("user_notifications").update(patch).eq("id", params.notificationId).eq("user_id", params.userId);

    if (!data.clicked_at) {
      await recordNotificationEvent({
        userId: params.userId,
        notificationId: params.notificationId,
        type: String(data.type ?? "unknown"),
        channel: "in_app",
        event: "clicked",
      });
    }

    return { url: (data.url as string | null) ?? null };
  } catch (err) {
    logApiError("notify:tracking", err, { stage: "click" });
    return { url: null };
  }
}

const EMPTY: ChannelCounts = { sent: 0, opened: 0, clicked: 0, suppressed: 0 };

/**
 * Counts the last `days` of events into the shape engagement.ts reads.
 *
 * Deliberately a full scan of the window rather than a materialised
 * counter: the row count here is one per notification per channel, which
 * for this product is thousands per month, not millions, and a counter
 * that can drift is worse than a query that is slightly slow once a week.
 */
export async function engagementSince(days = 30, userId?: string): Promise<TypeEngagement[]> {
  const byType: Partial<Record<NotificationType, TypeCounts>> = {};
  try {
    const admin = createAdminClient();
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
    let query = admin.from("notification_events").select("type, channel, event").gte("at", since).limit(50_000);
    if (userId) query = query.eq("user_id", userId);
    const { data, error } = await query;
    if (error) throw error;

    for (const row of data ?? []) {
      const type = String(row.type) as NotificationType;
      if (!(NOTIFICATION_TYPES as readonly string[]).includes(type)) continue;
      const channel = String(row.channel) as NotificationChannel;
      const event = String(row.event) as NotificationEvent;
      const counts = (byType[type] ??= {});
      const bucket = (counts[channel] ??= { ...EMPTY });
      bucket[event] += 1;
    }
  } catch (err) {
    logApiError("notify:tracking", err, { stage: "engagement" });
  }
  return engagementReport(byType);
}
