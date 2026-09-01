import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { logApiError } from "@/lib/log-error";
import { getSiteUrl } from "@/lib/site-url";
import { createNotification, safeNotificationUrl } from "@/lib/notifications/store";
import { createResendClient } from "@/lib/resend";
import { senderAddress, senderStatus } from "@/lib/email/resend-config";
import { notificationEmailHtml } from "@/lib/email/templates";
import { checkNotificationEmailAllowed, recordNotificationEmailSend } from "@/lib/email/email-gate";
import {
  NOTIFICATION_SPECS,
  resolveChannels,
  type NotificationChannel,
  type NotificationType,
} from "@/lib/notify/types";
import { deliverAt, wasDeferred } from "@/lib/notify/quiet-hours";
import { isWorthSending } from "@/lib/notify/worth-sending";
import { groupKeyFor } from "@/lib/notify/grouping";
import { loadChatTarget, loadNotifyContext, type NotifyContext } from "@/lib/notify/preferences";
import { recordNotificationEvent } from "@/lib/notify/tracking";
import { sendTelegram } from "@/lib/notify/channels/telegram";
import { sendDiscord } from "@/lib/notify/channels/discord";

/**
 * THE ONE SEND PATH.
 *
 * Everything the product wants to tell a user goes through here, and it
 * asks the five questions of the brief in this order, because each one
 * can only be answered once the previous one has been:
 *
 *   1. IS IT WORTH SENDING?      worth-sending.ts   (rule 1)
 *   2. WHERE DID THE USER SAY?   preferences + resolveChannels (rules 3, 4)
 *   3. IS IT THE MIDDLE OF THE NIGHT?  quiet-hours.ts (rule 3)
 *   4. IS THIS THE FIFTH ONE?    the open-group lookup below (rule 2)
 *   5. RECORD WHAT HAPPENED.     tracking.ts — including the refusals
 *
 * There is deliberately no "send anyway" flag. A caller that finds itself
 * wanting one has found a type this system does not model, and the fix is
 * a new entry in NOTIFICATION_SPECS, not a bypass — because a bypass is
 * how the first useless notification gets shipped.
 *
 * NEVER THROWS. A notification failing must not take down the agent run,
 * the payment webhook or the publish that raised it.
 */

// The From address, from ONE definition — see lib/email/resend-config.ts.
// This was one of fourteen copies of the same line — the constant AND
// its fallback, repeated per file. The fallback is the half that decides
// whether mail reaches anybody, so it now has one definition.

export type DispatchInput = {
  userId: string;
  type: NotificationType;
  title: string;
  body?: string;
  /** Overrides the type's default destination. Relative paths only —
   *  safeNotificationUrl refuses anything else. */
  url?: string | null;
  /** What worth-sending.ts reads to decide. */
  facts?: Record<string, unknown>;
  /** Saves a lookup when the caller already has it. */
  email?: string | null;
  /** Injectable for tests. Never passed in production. */
  now?: Date;
  /** Pre-loaded context, for a caller sending several to one user. */
  context?: NotifyContext;
};

export type Suppression = { channel: NotificationChannel | "all"; reason: string };

export type DispatchOutcome = {
  delivered: NotificationChannel[];
  suppressed: Suppression[];
  notificationId: string | null;
  /** ISO timestamp when quiet hours pushed the interrupting channels
   *  forward. The in-app row is always written immediately. */
  deferredUntil: string | null;
  /** Set when this folded into an existing notification (rule 2). */
  groupedInto: string | null;
};

function empty(reason: string): DispatchOutcome {
  return { delivered: [], suppressed: [{ channel: "all", reason }], notificationId: null, deferredUntil: null, groupedInto: null };
}

/**
 * Finds the notification this one should fold into: same user, same type,
 * same group key, raised inside the type's window, and STILL UNREAD.
 *
 * Unread is the condition that matters. A user who has already looked at
 * "your agent finished" has consumed that interruption, and the next one
 * is genuinely new information rather than a repeat — folding into a
 * notification they have already seen would make the count go up on
 * something they will never look at again.
 */
async function findOpenGroup(params: {
  userId: string;
  type: NotificationType;
  groupKey: string;
  windowMinutes: number;
  now: Date;
}): Promise<{ id: string; groupCount: number } | null> {
  if (params.windowMinutes <= 0) return null;
  try {
    const admin = createAdminClient();
    const since = new Date(params.now.getTime() - params.windowMinutes * 60_000).toISOString();
    const { data, error } = await admin
      .from("user_notifications")
      .select("id, group_count")
      .eq("user_id", params.userId)
      .eq("type", params.type)
      .eq("group_key", params.groupKey)
      .is("read_at", null)
      .gte("created_at", since)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) throw error;
    if (!data) return null;
    return { id: String(data.id), groupCount: Number(data.group_count ?? 1) };
  } catch (err) {
    logApiError("notify:dispatch", err, { stage: "find_group", type: params.type });
    // A failed lookup means "no group", which sends one extra
    // notification. The opposite failure — pretending a group exists —
    // would silently swallow one.
    return null;
  }
}

async function resolveEmail(userId: string, given?: string | null): Promise<string | null> {
  if (given && given.includes("@")) return given;
  try {
    const admin = createAdminClient();
    const { data } = await admin.auth.admin.getUserById(userId);
    return data?.user?.email ?? null;
  } catch (err) {
    logApiError("notify:dispatch", err, { stage: "resolve_email" });
    return null;
  }
}

export async function dispatchNotification(input: DispatchInput): Promise<DispatchOutcome> {
  const now = input.now ?? new Date();
  const spec = NOTIFICATION_SPECS[input.type];
  if (!spec) return empty(`unknown notification type: ${input.type}`);

  const title = input.title.trim();
  const body = (input.body ?? "").trim();

  // ---- 1. IS IT WORTH SENDING? ------------------------------------
  const verdict = isWorthSending({ type: input.type, title, body, facts: input.facts });
  if (!verdict.worth) {
    // Recorded, not just dropped. Rule 1 is only checkable if the
    // refusals are counted — see tracking.ts.
    await recordNotificationEvent({
      userId: input.userId,
      type: input.type,
      channel: "in_app",
      event: "suppressed",
      reason: verdict.reason,
    });
    return empty(verdict.reason);
  }

  const context = input.context ?? (await loadNotifyContext(input.userId));
  const preference = context.preferences[input.type];

  // ---- 2. WHERE DID THE USER SAY? ---------------------------------
  const channels = resolveChannels({
    type: input.type,
    chosen: preference?.channels ?? undefined,
    disabled: preference ? !preference.enabled : false,
    available: context.available,
  });

  if (channels.length === 0) {
    await recordNotificationEvent({
      userId: input.userId,
      type: input.type,
      channel: "in_app",
      event: "suppressed",
      reason: "the user turned this type off",
    });
    return empty("the user turned this type off");
  }

  // ---- 3. IS IT THE MIDDLE OF THE NIGHT? ---------------------------
  const due = deliverAt({ at: now, type: input.type, quiet: context.quiet });
  const deferred = wasDeferred(now, due);

  // ---- 4. IS THIS THE FIFTH ONE? -----------------------------------
  const groupKey = groupKeyFor(input.type);
  const open = await findOpenGroup({
    userId: input.userId,
    type: input.type,
    groupKey,
    windowMinutes: spec.groupWindowMinutes,
    now,
  });

  const delivered: NotificationChannel[] = [];
  const suppressed: Suppression[] = [];

  if (open) {
    // FIVE AGENTS ARE ONE NOTIFICATION. The count on the existing row
    // goes up and its title says so; nothing leaves the product a second
    // time, because the interruption already happened. This is the whole
    // of rule 2 and it is the reason the external channels are skipped
    // rather than re-sent with a bigger number.
    try {
      const admin = createAdminClient();
      const nextCount = open.groupCount + 1;
      // THE COUNT THE ROW HAD IS RE-ASSERTED, because absorbing a burst is
      // this function's whole job and a burst is by definition concurrent.
      // findOpenGroup read group_count a round trip ago; five agent runs
      // finishing together all read the same number, all compute the same
      // +1, and the row lands one higher instead of five. The digest
      // renders `group_count - 1` as "and N more", so the user is told two
      // things happened when five did.
      //
      // On a miss the row was moved by somebody else, and the retry below
      // re-reads it rather than writing a number derived from a value that
      // is already stale.
      const { data: bumped } = await admin
        .from("user_notifications")
        .update({ group_count: nextCount, body, title })
        .eq("id", open.id)
        .eq("user_id", input.userId)
        .eq("group_count", open.groupCount)
        .select("id");

      if (!bumped || bumped.length === 0) {
        const { data: current } = await admin
          .from("user_notifications")
          .select("group_count")
          .eq("id", open.id)
          .eq("user_id", input.userId)
          .maybeSingle();
        const seen = Number(current?.group_count ?? open.groupCount);
        await admin
          .from("user_notifications")
          .update({ group_count: seen + 1, body, title })
          .eq("id", open.id)
          .eq("user_id", input.userId)
          .eq("group_count", seen);
      }
      delivered.push("in_app");
      for (const channel of channels) {
        if (channel === "in_app") continue;
        suppressed.push({ channel, reason: "grouped into a recent notification" });
        await recordNotificationEvent({
          userId: input.userId,
          notificationId: open.id,
          type: input.type,
          channel,
          event: "suppressed",
          reason: "grouped into a recent notification",
        });
      }
      return { delivered, suppressed, notificationId: open.id, deferredUntil: null, groupedInto: open.id };
    } catch (err) {
      logApiError("notify:dispatch", err, { stage: "group_update", type: input.type });
      // Falls through and writes a new row. An extra notification is a
      // far smaller failure than a lost one.
    }
  }

  // ---- The in-app record ------------------------------------------
  // Written FIRST and regardless of quiet hours: the bell is the record,
  // not the interruption, and a notification with no record anywhere
  // makes "I was never told" unanswerable.
  const href = safeNotificationUrl(input.url) ?? spec.href;
  const notificationId = await createNotification({
    userId: input.userId,
    source: "notify",
    title,
    body,
    url: href,
    type: input.type,
    groupKey,
    groupCount: 1,
    deliverAt: due,
  });

  if (channels.includes("in_app")) {
    if (notificationId) {
      delivered.push("in_app");
      await recordNotificationEvent({
        userId: input.userId,
        notificationId,
        type: input.type,
        channel: "in_app",
        event: "sent",
      });
    } else {
      suppressed.push({ channel: "in_app", reason: "could not write the notification" });
    }
  }

  const interrupting = channels.filter((c) => c !== "in_app");

  if (deferred) {
    // QUIET HOURS DEFER, THEY DO NOT DROP. The row carries deliver_at and
    // the drain below picks it up when the window closes; nothing is
    // thrown away, which is the difference between a setting and a filter.
    for (const channel of interrupting) {
      suppressed.push({ channel, reason: "quiet hours" });
      await recordNotificationEvent({
        userId: input.userId,
        notificationId,
        type: input.type,
        channel,
        event: "suppressed",
        reason: "quiet hours",
      });
    }
    return { delivered, suppressed, notificationId, deferredUntil: due.toISOString(), groupedInto: null };
  }

  const sentNow = await sendToChannels({
    userId: input.userId,
    email: input.email,
    notificationId,
    type: input.type,
    title,
    body,
    href,
    extraCount: 0,
    channels: interrupting,
  });
  delivered.push(...sentNow.delivered);
  suppressed.push(...sentNow.suppressed);

  return { delivered, suppressed, notificationId, deferredUntil: null, groupedInto: null };
}

/**
 * The channel loop, shared by the immediate path and the deferred drain
 * so a notification held overnight is sent by exactly the same code that
 * would have sent it at 3pm.
 */
async function sendToChannels(params: {
  userId: string;
  email?: string | null;
  notificationId: string | null;
  type: NotificationType;
  title: string;
  body: string;
  href: string;
  extraCount: number;
  channels: readonly NotificationChannel[];
}): Promise<{ delivered: NotificationChannel[]; suppressed: Suppression[] }> {
  const delivered: NotificationChannel[] = [];
  const suppressed: Suppression[] = [];
  if (params.channels.length === 0) return { delivered, suppressed };

  // RULE 5: ONE CLICK GOES TO THE RELEVANT PLACE. Every outbound link is
  // the tracking redirect, which records the click and then sends the
  // user to the notification's own path — so the click rate that decides
  // whether a type is worth sending is measured, not estimated.
  const site = getSiteUrl();
  const clickUrl = params.notificationId ? `${site}/api/n/${params.notificationId}` : `${site}${params.href}`;

  for (const channel of params.channels) {
    const record = async (event: "sent" | "suppressed", reason?: string) =>
      recordNotificationEvent({
        userId: params.userId,
        notificationId: params.notificationId,
        type: params.type,
        channel,
        event,
        reason,
      });

    try {
      if (channel === "email") {
        const gate = await checkNotificationEmailAllowed(params.userId);
        if (!gate.allowed) {
          suppressed.push({ channel, reason: gate.reason });
          await record("suppressed", gate.reason);
          continue;
        }
        const address = await resolveEmail(params.userId, params.email);
        if (!address) {
          suppressed.push({ channel, reason: "no email address" });
          await record("suppressed", "no email address");
          continue;
        }
        // NAMED, not guessed at, and decided BEFORE the API call.
        //
        // Two ways this deployment cannot mail a customer, and the second
        // one used to be recorded as `sent`:
        //
        //   no_key       nothing leaves at all. A silent no-op here is
        //                what makes a user think the feature is broken
        //                rather than unconfigured.
        //   test_sender  RESEND_API_KEY is set and RESEND_FROM_EMAIL is
        //                not, so From is Resend's shared test address.
        //                Resend delivers that ONLY to the account
        //                owner's own address and refuses everyone else —
        //                which means the OPERATOR's mail arrives and
        //                every customer's does not, one API call and one
        //                provider sentence at a time, in a column nobody
        //                aggregates. The deployment looks configured from
        //                the only seat that would notice.
        //
        // Refusing here costs a doomed request per notification and turns
        // fourteen different English strings from a third party into one
        // reason code that a query can count.
        const mail = senderStatus();
        if (mail !== "ok") {
          const reason = mail === "no_key" ? "RESEND_API_KEY is not set" : "test_sender";
          suppressed.push({ channel, reason });
          await record("suppressed", reason);
          continue;
        }
        const resend = createResendClient();
        const { error } = await resend.emails.send({
          from: senderAddress(),
          to: address,
          subject: params.title.slice(0, 120),
          html: notificationEmailHtml({
            title: params.title,
            body: params.body,
            actionUrl: clickUrl,
            actionLabel: "Open in Ionexa",
            extraCount: params.extraCount,
            settingsUrl: `${site}/dashboard/settings#notifications`,
          }),
        });
        if (error) {
          // A REASON CODE, not a sentence. This value is written to
          // notification_events.reason and read back by a query, and the
          // provider's own message is only useful when there is one —
          // an English fallback here would be prose nobody translates
          // sitting in a column nobody reads as prose.
          const detail = typeof error.message === "string" && error.message.trim() ? error.message : "email_provider_error";
          suppressed.push({ channel, reason: detail });
          await record("suppressed", detail);
          continue;
        }
        await recordNotificationEmailSend(params.userId, params.type);
        delivered.push(channel);
        await record("sent");
        continue;
      }

      if (channel === "telegram" || channel === "discord") {
        const target = await loadChatTarget(params.userId, channel);
        if (!target) {
          suppressed.push({ channel, reason: "not connected" });
          await record("suppressed", "not connected");
          continue;
        }
        const result =
          channel === "telegram"
            ? await sendTelegram({ chatId: target, title: params.title, body: params.body, url: clickUrl })
            : await sendDiscord({ webhookUrl: target, title: params.title, body: params.body, url: clickUrl });
        if (!result.ok) {
          suppressed.push({ channel, reason: `${result.kind}: ${result.detail}` });
          await record("suppressed", `${result.kind}: ${result.detail}`);
          continue;
        }
        delivered.push(channel);
        await record("sent");
      }
    } catch (err) {
      logApiError("notify:dispatch", err, { stage: "send", channel, type: params.type });
      suppressed.push({ channel, reason: "channel error" });
      await record("suppressed", "channel error");
    }
  }

  return { delivered, suppressed };
}

/**
 * THE OTHER HALF OF QUIET HOURS.
 *
 * Deferring is only a real behaviour if something later picks the
 * notification up — otherwise "we held it until morning" is
 * indistinguishable from "we dropped it". Run from the cron that already
 * runs every few minutes.
 */
export async function drainDeferredNotifications(limit = 200): Promise<{ examined: number; sent: number }> {
  let examined = 0;
  let sent = 0;
  try {
    const admin = createAdminClient();
    const nowIso = new Date().toISOString();
    const { data, error } = await admin
      .from("user_notifications")
      .select("id, user_id, type, title, body, url, group_count")
      .not("deliver_at", "is", null)
      .lte("deliver_at", nowIso)
      .is("read_at", null)
      .order("deliver_at", { ascending: true })
      .limit(limit);
    if (error) throw error;

    for (const row of data ?? []) {
      examined += 1;
      const type = String(row.type ?? "") as NotificationType;
      if (!NOTIFICATION_SPECS[type]) continue;

      // CLEARED FIRST, then sent. If the send crashes the notification is
      // still in the bell and is not retried forever; the opposite order
      // turns one transient Resend outage into an infinite loop of
      // attempts against the same row.
      const { error: clearError } = await admin
        .from("user_notifications")
        .update({ deliver_at: null })
        .eq("id", row.id)
        .not("deliver_at", "is", null);
      // No rows updated means another worker got there first.
      if (clearError) continue;

      const context = await loadNotifyContext(String(row.user_id));
      const preference = context.preferences[type];
      const channels = resolveChannels({
        type,
        chosen: preference?.channels ?? undefined,
        disabled: preference ? !preference.enabled : false,
        available: context.available,
      }).filter((c) => c !== "in_app");

      const result = await sendToChannels({
        userId: String(row.user_id),
        notificationId: String(row.id),
        type,
        title: String(row.title ?? ""),
        body: String(row.body ?? ""),
        href: (row.url as string | null) ?? NOTIFICATION_SPECS[type].href,
        extraCount: Math.max(0, Number(row.group_count ?? 1) - 1),
        channels,
      });
      if (result.delivered.length > 0) sent += 1;
    }
  } catch (err) {
    logApiError("notify:dispatch", err, { stage: "drain" });
  }
  return { examined, sent };
}
