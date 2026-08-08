import "server-only";
import webpush from "web-push";
import { createAdminClient } from "@/lib/supabase/admin";
import { logApiError } from "@/lib/log-error";
import { getSiteUrl } from "@/lib/site-url";

// Web Push delivery.
//
// Every send goes through here rather than each feature calling webpush
// directly, for the same reason lib/email/email-gate.ts exists: the
// per-type opt-in and the dead-subscription cleanup are rules about the
// CHANNEL, and a feature that reached past them would silently break
// both.
//
// Configuration is deliberately soft: with no VAPID keys set, every send
// is a no-op that logs once. Push is an enhancement — a deployment
// without keys must behave exactly like one without the feature, never
// throw into an agent run or a cron sweep.

export const PUSH_TYPES = [
  "agent_results",
  "mission_reminders",
  "low_credits",
  "collaboration",
] as const;
export type PushType = (typeof PUSH_TYPES)[number];

/** The opt-in column backing each type (see the migration). */
const TYPE_COLUMN: Record<PushType, string> = {
  agent_results: "notify_agent_results",
  mission_reminders: "notify_mission_reminders",
  low_credits: "notify_low_credits",
  collaboration: "notify_collaboration",
};

export type PushPayload = {
  title: string;
  body: string;
  /** Where clicking the notification should land. Relative to the site. */
  url?: string;
  /** Collapses same-tag notifications instead of stacking duplicates. */
  tag?: string;
};

let configured: boolean | null = null;
let warnedUnconfigured = false;

/**
 * True when VAPID keys are present and webpush is configured.
 *
 * The public key is NEXT_PUBLIC_ because the browser needs it to create a
 * subscription at all; the private key is server-only and never leaves
 * this module.
 */
export function isPushConfigured(): boolean {
  if (configured !== null) return configured;
  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  if (!publicKey || !privateKey) {
    configured = false;
    if (!warnedUnconfigured) {
      warnedUnconfigured = true;
      // eslint-disable-next-line no-console
      console.warn(
        "[web-push] NEXT_PUBLIC_VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY are not set — push notifications are disabled. Generate a pair with: npx web-push generate-vapid-keys"
      );
    }
    return false;
  }
  // The subject must be a mailto: or https: URL identifying the sender —
  // push services reject a JWT without one.
  const subject = process.env.VAPID_SUBJECT || `mailto:${process.env.RESEND_FROM_EMAIL || "support@ionexa.ai"}`.replace(/^mailto:.*<(.+)>$/, "mailto:$1");
  webpush.setVapidDetails(subject.startsWith("http") || subject.startsWith("mailto:") ? subject : `mailto:${subject}`, publicKey, privateKey);
  configured = true;
  return true;
}

export type PushSendResult = {
  sent: number;
  failed: number;
  revoked: number;
  skipped: "unconfigured" | "opted_out" | "no_subscriptions" | null;
};

/**
 * Sends one notification to every live subscription a user has that has
 * opted in to `type`.
 *
 * Never throws. Callers are agent runs, cron sweeps and settlement paths
 * — a push failure must not turn a completed action into a failed one.
 */
export async function sendPushToUser(
  userId: string,
  type: PushType,
  payload: PushPayload
): Promise<PushSendResult> {
  const result: PushSendResult = { sent: 0, failed: 0, revoked: 0, skipped: null };
  if (!isPushConfigured()) {
    result.skipped = "unconfigured";
    return result;
  }

  try {
    const admin = createAdminClient();
    const column = TYPE_COLUMN[type];
    const { data, error } = await admin
      .from("push_subscriptions")
      .select("id, endpoint, p256dh, auth")
      .eq("user_id", userId)
      .is("revoked_at", null)
      .eq(column, true);

    if (error) {
      logApiError("push:sendPushToUser", error, { userId, type });
      result.failed = 1;
      return result;
    }
    if (!data || data.length === 0) {
      result.skipped = "no_subscriptions";
      return result;
    }

    const body = JSON.stringify({
      title: payload.title,
      body: payload.body,
      url: payload.url ? new URL(payload.url, getSiteUrl()).toString() : getSiteUrl(),
      tag: payload.tag ?? type,
    });

    await Promise.all(
      data.map(async (row) => {
        try {
          await webpush.sendNotification(
            {
              endpoint: row.endpoint as string,
              keys: { p256dh: row.p256dh as string, auth: row.auth as string },
            },
            body,
            { TTL: 60 * 60 * 24 }
          );
          result.sent += 1;
        } catch (err) {
          // 404/410 mean the browser threw the subscription away — the
          // endpoint is dead forever, so mark it revoked instead of
          // retrying it on every future send.
          const status = (err as { statusCode?: number })?.statusCode;
          if (status === 404 || status === 410) {
            result.revoked += 1;
            await admin
              .from("push_subscriptions")
              .update({ revoked_at: new Date().toISOString() })
              .eq("id", row.id as string);
            return;
          }
          result.failed += 1;
          logApiError("push:sendNotification", err, { userId, type, status: status ?? null });
        }
      })
    );
  } catch (err) {
    logApiError("push:sendPushToUser", err, { userId, type, stage: "unhandled" });
    result.failed += 1;
  }

  return result;
}
