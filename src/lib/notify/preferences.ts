import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { logApiError } from "@/lib/log-error";
import { decryptSecret, encryptSecret, encryptionAvailable, safeErrorDetail } from "@/lib/integrations/crypto";
import {
  NOTIFICATION_TYPES,
  isNotificationChannel,
  type NotificationChannel,
  type NotificationType,
} from "@/lib/notify/types";
import { NO_QUIET_HOURS, parseMinuteOfDay, type QuietHours } from "@/lib/notify/quiet-hours";
import { checkDiscordWebhook } from "@/lib/notify/channels/discord";
import { telegramConfigured } from "@/lib/notify/channels/telegram";

/**
 * WHAT THE USER HAS DECIDED, read once per dispatch.
 *
 * Three rows sets in one read: the quiet-hours window, the per-type
 * channel choices, and which chat targets actually exist. dispatch.ts
 * takes the whole thing and never queries again, so a single notification
 * is decided from one consistent snapshot rather than three reads that
 * could disagree with each other mid-flight.
 *
 * Everything here FAILS TOWARDS THE DEFAULTS, never towards silence: an
 * unreadable preferences table must not turn into "the user opted out of
 * everything", because the failure mode of that is a payment failure
 * nobody hears about.
 */

export type TypePreference = {
  /** Rule 4: the whole type is switched off. */
  enabled: boolean;
  /** null = never chosen, so NOTIFICATION_SPECS[type].defaultChannels apply.
   *  An empty ARRAY is a real choice and means "bell only". */
  channels: NotificationChannel[] | null;
};

export type ChatKind = "telegram" | "discord";

export type NotifyContext = {
  userId: string;
  quiet: QuietHours;
  preferences: Partial<Record<NotificationType, TypePreference>>;
  /** Which channels can physically be used right now. A Telegram
   *  preference with no connected chat is not an error, it just cannot
   *  deliver — resolveChannels() drops it. */
  available: NotificationChannel[];
};

/** AAD for the chat target ciphertext. Binds WHOSE target it is and WHICH
 *  service it points at, so a row copied between users fails to decrypt
 *  instead of quietly delivering somebody else's notifications. */
export function chatTargetContext(userId: string, kind: ChatKind): string {
  return `ionexa:notify:${kind}:${userId}`;
}

function parseChannels(value: unknown): NotificationChannel[] | null {
  if (!Array.isArray(value)) return null;
  return value.filter(isNotificationChannel);
}

export async function loadNotifyContext(userId: string): Promise<NotifyContext> {
  const context: NotifyContext = {
    userId,
    quiet: NO_QUIET_HOURS,
    preferences: {},
    available: ["in_app", "email"],
  };

  try {
    const admin = createAdminClient();

    const [settings, prefs, channels] = await Promise.all([
      admin
        .from("notification_settings")
        .select("quiet_start_minute, quiet_end_minute, utc_offset_minutes")
        .eq("user_id", userId)
        .maybeSingle(),
      admin.from("notification_preferences").select("type, enabled, channels").eq("user_id", userId),
      // The TARGET is never selected here. Whether a channel is connected
      // is a different question from what its credential is, and only the
      // send path needs the second one.
      admin.from("notification_channels").select("kind, verified_at").eq("user_id", userId),
    ]);

    if (settings.data) {
      const start = parseMinuteOfDay(settings.data.quiet_start_minute);
      const end = parseMinuteOfDay(settings.data.quiet_end_minute);
      context.quiet = {
        // Both or neither — the column CHECK says so, and reading one
        // half as a window would invent the other end.
        startMinute: start !== null && end !== null ? start : null,
        endMinute: start !== null && end !== null ? end : null,
        utcOffsetMinutes: Number(settings.data.utc_offset_minutes ?? 0) || 0,
      };
    }

    for (const row of prefs.data ?? []) {
      const type = String(row.type) as NotificationType;
      if (!(NOTIFICATION_TYPES as readonly string[]).includes(type)) continue;
      context.preferences[type] = {
        enabled: row.enabled !== false,
        channels: parseChannels(row.channels),
      };
    }

    for (const row of channels.data ?? []) {
      const kind = String(row.kind);
      if (kind !== "telegram" && kind !== "discord") continue;
      // UNVERIFIED IS NOT CONNECTED. A row exists from the moment the
      // test message is attempted; only one that actually arrived counts,
      // otherwise a typo'd chat id silently swallows notifications.
      if (!row.verified_at) continue;
      // Telegram needs a bot token on the server as well as a chat id on
      // the row. Without the token there is nothing to send WITH, so the
      // channel is unavailable however the preference reads.
      if (kind === "telegram" && !telegramConfigured()) continue;
      context.available.push(kind);
    }
  } catch (err) {
    logApiError("notify:preferences", err, { stage: "load", userId });
    // Deliberately returns the defaults rather than rethrowing. See the
    // header: silence is the worse failure.
  }

  return context;
}

/** The decrypted target, read only at send time. Never logged, never
 *  returned to a client, never put in an error message. */
export async function loadChatTarget(userId: string, kind: ChatKind): Promise<string | null> {
  try {
    const admin = createAdminClient();
    const { data, error } = await admin
      .from("notification_channels")
      .select("target_encrypted, verified_at")
      .eq("user_id", userId)
      .eq("kind", kind)
      .maybeSingle();
    if (error) throw error;
    if (!data || !data.verified_at) return null;
    return decryptSecret(String(data.target_encrypted), chatTargetContext(userId, kind));
  } catch (err) {
    logApiError("notify:preferences", err, {
      stage: "load_target",
      userId,
      kind,
      // safeErrorDetail, not the error: a decryption failure message must
      // not carry any part of the ciphertext into a log line.
      detail: safeErrorDetail(err),
    });
    return null;
  }
}

export type ConnectResult = { ok: true } | { ok: false; reason: string };

/**
 * Stores a chat target. SERVICE-ROLE ONLY BY DESIGN — the table grants
 * the user select and delete but not insert, so this is the only way a
 * row appears, and it appears already validated.
 *
 * `verified` is passed by the caller AFTER a test message actually
 * arrived. Nothing in this function marks a target verified on its own.
 */
export async function saveChatTarget(params: {
  userId: string;
  kind: ChatKind;
  target: string;
  label?: string | null;
  verified: boolean;
}): Promise<ConnectResult> {
  const target = params.target.trim();
  if (!target) return { ok: false, reason: "empty target" };

  if (params.kind === "discord") {
    const check = checkDiscordWebhook(target);
    // Validated HERE as well as at send time. Two checks on one value is
    // not redundancy when one of them is the only thing standing between
    // a stored row and an SSRF against an internal host.
    if (!check.ok) return { ok: false, reason: check.reason };
  }
  if (params.kind === "telegram" && !/^-?\d{1,20}$/.test(target)) {
    return { ok: false, reason: "a Telegram chat id is a number" };
  }

  if (!encryptionAvailable()) {
    // Refuses rather than storing plaintext. A Discord webhook in a
    // plaintext column is a credential anybody with a database export can
    // post to that channel with, forever.
    return { ok: false, reason: "encryption key is not configured on the server" };
  }

  try {
    const admin = createAdminClient();
    const { error } = await admin.from("notification_channels").upsert(
      {
        user_id: params.userId,
        kind: params.kind,
        target_encrypted: encryptSecret(target, chatTargetContext(params.userId, params.kind)),
        label: (params.label ?? "").trim().slice(0, 80) || null,
        verified_at: params.verified ? new Date().toISOString() : null,
      },
      { onConflict: "user_id,kind" }
    );
    if (error) throw error;
    return { ok: true };
  } catch (err) {
    logApiError("notify:preferences", err, { stage: "save_target", kind: params.kind, detail: safeErrorDetail(err) });
    return { ok: false, reason: "could not save" };
  }
}
