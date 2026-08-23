import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { logApiError } from "@/lib/log-error";

/**
 * In-app notifications — the thing the bell in the top bar was pretending
 * to have.
 *
 * It rendered "No notifications" from a hard-coded string. There was no
 * table, no query, and no way for anything in the product to ever put
 * something in it: a control that can only give one answer, shaped exactly
 * like one that gives several. This is the store behind it, and the
 * destination for an agent result that the user does not want leaving the
 * product at all.
 *
 * WRITES ARE SERVICE-ROLE ONLY, by policy as well as by convention: a user
 * who could insert could write themselves a notification with our styling,
 * our voice and a link of their choosing — and then send someone else a
 * screenshot of it.
 */

export const NOTIFICATION_LIMITS = {
  title: 120,
  body: 4_000,
  /** How many the bell shows. More than fits on a phone screen is a list
   *  nobody scrolls, not a feature. */
  list: 20,
} as const;

export type UserNotification = {
  id: string;
  source: string;
  title: string;
  body: string;
  url: string | null;
  readAt: string | null;
  createdAt: string;
};

/**
 * A link a notification is allowed to carry.
 *
 * Relative, in-app paths only. A notification is the one place in the
 * product where we invite the user to click something they did not go
 * looking for, so an absolute URL — even ours — is refused rather than
 * sanitised: there is no legitimate reason for one, and `//evil.example`
 * is a protocol-relative absolute URL that reads like a path.
 */
export function safeNotificationUrl(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed.startsWith("/") || trimmed.startsWith("//")) return null;
  return trimmed.slice(0, 300);
}

/**
 * THE ONE WRITER for public.user_notifications.
 *
 * dispatch.ts calls this after the worth-sending rule, the per-type
 * channel preference and quiet hours have all had their say; the older
 * agent-delivery path calls it with just a title and a body. Keeping both
 * on one function is what stops the typed columns added by the V4 #18
 * migration from being set by one caller and quietly left null by the
 * other.
 *
 * Returns the row id so the caller can attach engagement events to it —
 * null when the insert failed, which callers treat as "not delivered
 * in-app" rather than throwing.
 */
export async function createNotification(params: {
  userId: string;
  source?: string;
  title: string;
  body?: string;
  url?: string | null;
  /** One of NOTIFICATION_TYPES. Absent for the legacy agent path. */
  type?: string | null;
  groupKey?: string | null;
  /** How many real events this one row stands for (rule 2). */
  groupCount?: number;
  /** When the interrupting channels may fire. The row itself is visible
   *  in the bell immediately whatever this says — a bell filling up
   *  overnight interrupts nobody. */
  deliverAt?: Date | null;
}): Promise<string | null> {
  try {
    const admin = createAdminClient();
    const { data, error } = await admin
      .from("user_notifications")
      .insert({
        user_id: params.userId,
        source: (params.source ?? "agent").slice(0, 40),
        title: params.title.trim().slice(0, NOTIFICATION_LIMITS.title),
        body: (params.body ?? "").trim().slice(0, NOTIFICATION_LIMITS.body),
        url: safeNotificationUrl(params.url),
        type: params.type ?? null,
        group_key: params.groupKey ?? null,
        // The CHECK on the column is >= 1, so a caller passing 0 would
        // fail the insert rather than write a nonsense count.
        group_count: Math.max(1, Math.trunc(params.groupCount ?? 1)),
        deliver_at: params.deliverAt ? params.deliverAt.toISOString() : null,
      })
      .select("id")
      .single();
    if (error) throw error;
    return data ? String(data.id) : null;
  } catch (err) {
    logApiError("notifications:create", err, { userId: params.userId, source: params.source });
    return null;
  }
}

/** Read through the CALLER'S OWN client, so RLS scopes it — this is one
 *  of the few reads where passing an admin client would be a way to hand
 *  somebody another user's notifications. */
export async function listNotifications(
  supabase: { from: (table: string) => any },
  limit = NOTIFICATION_LIMITS.list
): Promise<UserNotification[]> {
  const { data, error } = await supabase
    .from("user_notifications")
    .select("id, source, title, body, url, read_at, created_at")
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return (data ?? []).map((row: Record<string, unknown>) => ({
    id: String(row.id),
    source: String(row.source ?? "agent"),
    title: String(row.title ?? ""),
    body: String(row.body ?? ""),
    url: (row.url as string | null) ?? null,
    readAt: (row.read_at as string | null) ?? null,
    createdAt: String(row.created_at ?? ""),
  }));
}
