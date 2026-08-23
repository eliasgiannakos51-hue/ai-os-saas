import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { logApiError } from "@/lib/log-error";
import {
  EMAIL_TYPES,
  OPTIONAL_EMAIL_TYPES,
  MAX_EMAILS_PER_DAY,
  type EmailType,
} from "@/lib/email/email-types";

// Re-exported so server-side callers only need one import.
export { EMAIL_TYPES, OPTIONAL_EMAIL_TYPES, MAX_EMAILS_PER_DAY };
export type { EmailType };

export type EmailGateDecision =
  | { allowed: true }
  | { allowed: false; reason: "opted_out" | "daily_cap" };

// The whole decision, with the two database reads already done and passed
// in as plain values. Split out of checkEmailAllowed below purely so the
// rules can be unit-tested against hand-constructed inputs without a live
// Supabase connection — same pattern as parsePlanMissionToolInput in
// lib/mission-agents.ts.
//
// `prefs` is the user_email_preferences row, or null when the user has
// never touched Settings. `recentSendCount` is how many emails already
// went to this user in the trailing 24h, or null when that count could
// not be read (in which case the cap is not enforced — see the
// fail-open note on checkEmailAllowed).
export function decideEmailGate({
  type,
  prefs,
  recentSendCount,
}: {
  type: EmailType;
  prefs: Record<string, boolean> | null;
  recentSendCount: number | null;
}): EmailGateDecision {
  // Critical mail is checked FIRST and returns before either rule, so no
  // preference row and no amount of prior sending can suppress it.
  if (EMAIL_TYPES[type].critical) return { allowed: true };

  // Explicit `=== false` rather than a falsy check: a missing column (a
  // row written before this type existed) must mean "default on", not
  // "off", or adding a new email type would silently opt every existing
  // user out of it.
  if (prefs && prefs[type] === false) return { allowed: false, reason: "opted_out" };

  if (recentSendCount !== null && recentSendCount >= MAX_EMAILS_PER_DAY) {
    return { allowed: false, reason: "daily_cap" };
  }

  return { allowed: true };
}

// Consulted by every sender in lib/email/ before it calls Resend.
//
// Fails OPEN on an infrastructure error (missing prefs row, unreachable
// DB): a transactional email the user is expecting is more valuable than
// a perfectly enforced cap, and the same DB outage that breaks this
// lookup would usually be breaking the thing that triggered the email
// anyway. The one thing it never does is throw — senders are all
// best-effort and must not take down their caller.
export async function checkEmailAllowed(
  userId: string,
  type: EmailType
): Promise<EmailGateDecision> {
  if (EMAIL_TYPES[type].critical) return { allowed: true };

  try {
    const admin = createAdminClient();

    // No row = never visited Settings = all defaults on, which is what
    // the table's column defaults say too. Treated as "allowed" rather
    // than lazily inserting a row, so a read path stays a read path.
    const { data: prefs } = await admin
      .from("user_email_preferences")
      .select(OPTIONAL_EMAIL_TYPES.join(","))
      .eq("user_id", userId)
      .maybeSingle();

    // Rolling 24h window, not "since local midnight" — the app has users
    // across many timezones (see the timezone-aware greeting on Home) and
    // there is no single correct midnight to reset at.
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const { count, error: countError } = await admin
      .from("email_send_log")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId)
      .gte("sent_at", since);

    if (countError) {
      logApiError("email:gate", countError, { stage: "count_recent_sends", type });
    }

    return decideEmailGate({
      type,
      prefs: (prefs as unknown as Record<string, boolean> | null) ?? null,
      // null = unreadable, which decideEmailGate treats as "don't enforce
      // the cap" rather than "zero sends so far".
      recentSendCount: countError ? null : count ?? 0,
    });
  } catch (err) {
    logApiError("email:gate", err, { stage: "unhandled", type });
    return { allowed: true };
  }
}

// Called AFTER a successful send. Critical emails are recorded too, so
// the log is a truthful history of what was sent — but checkEmailAllowed
// only counts against the cap for non-critical types by never consulting
// the count for critical ones in the first place.
export async function recordEmailSend(userId: string, type: EmailType): Promise<void> {
  try {
    const admin = createAdminClient();
    const { error } = await admin.from("email_send_log").insert({ user_id: userId, email_type: type });
    if (error) logApiError("email:gate", error, { stage: "record_send", type });
  } catch (err) {
    logApiError("email:gate", err, { stage: "record_send_unhandled", type });
  }
}

// ---------------------------------------------------------------------
// V4 #18 — the notification system's email channel.
// ---------------------------------------------------------------------
//
// It shares the CAP and nothing else. A user has one inbox, so twenty a
// day is twenty a day whether they came from a scheduled agent email or
// from the notification dispatcher — counting them separately would let
// the two systems add up to forty and call each one "capped".
//
// It deliberately does NOT consult user_email_preferences: which
// notification types may use email is stored per type in
// notification_preferences and has already been asked by the time
// dispatch.ts gets here. Two switches for the same decision is how a user
// turns something off and keeps receiving it.
export async function checkNotificationEmailAllowed(userId: string): Promise<EmailGateDecision> {
  try {
    const admin = createAdminClient();
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const { count, error } = await admin
      .from("email_send_log")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId)
      .gte("sent_at", since);
    // Unreadable count = cap not enforced, same fail-open reading as
    // checkEmailAllowed above.
    if (error) {
      logApiError("email:gate", error, { stage: "notification_count" });
      return { allowed: true };
    }
    if ((count ?? 0) >= MAX_EMAILS_PER_DAY) return { allowed: false, reason: "daily_cap" };
    return { allowed: true };
  } catch (err) {
    logApiError("email:gate", err, { stage: "notification_unhandled" });
    return { allowed: true };
  }
}

// Recorded under a namespaced type so the log stays a truthful history of
// WHAT was sent, while still counting towards the one shared cap.
export async function recordNotificationEmailSend(userId: string, notificationType: string): Promise<void> {
  try {
    const admin = createAdminClient();
    const { error } = await admin
      .from("email_send_log")
      .insert({ user_id: userId, email_type: `notify:${notificationType}`.slice(0, 60) });
    if (error) logApiError("email:gate", error, { stage: "record_notification_send" });
  } catch (err) {
    logApiError("email:gate", err, { stage: "record_notification_send_unhandled" });
  }
}
