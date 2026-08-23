/**
 * THE SEVEN THINGS WORTH INTERRUPTING SOMEBODY FOR.
 *
 * Pure — no SDK, no database, no network — so the build gate can read
 * every rule below without a key or a connection.
 *
 * ============================================================
 * RULE 1: NEVER A NOTIFICATION WITHOUT VALUE
 * ============================================================
 *
 * The list is short on purpose, and it is a list of OUTCOMES rather than
 * of events. "An agent ran" is not one of them; "an agent ran and found
 * something" is. The difference is the whole rule: a product that tells
 * you it did the thing you scheduled it to do, every morning, has taught
 * you to ignore it by Thursday — and then the one that mattered arrives
 * on Friday and is ignored too.
 *
 * So `agent_completed` carries a REQUIREMENT that there is a result. The
 * predicate lives in worth-sending.ts and is applied by dispatch.ts
 * before anything is written anywhere.
 */

export const NOTIFICATION_TYPES = [
  /** An agent finished AND produced something. Never fired for a run
   *  that returned nothing — see worth-sending.ts. */
  "agent_completed",
  "website_published",
  "research_ready",
  /** Fired at 80% and again at 100%, once each per cycle. */
  "credits_low",
  "payment_failed",
  "team_member_joined",
  /** Something broke in a way the user has to act on. Not "an API call
   *  retried" — a state they must change. */
  "error_needs_attention",
] as const;
export type NotificationType = (typeof NOTIFICATION_TYPES)[number];

export function isNotificationType(value: unknown): value is NotificationType {
  return typeof value === "string" && (NOTIFICATION_TYPES as readonly string[]).includes(value);
}

/**
 * WHERE IT CAN GO.
 *
 * `in_app` is always available and is the only one that cannot be turned
 * off for a critical type — it is the record, not the interruption. The
 * other three are ways of reaching somebody who is not looking at the
 * product.
 */
export const NOTIFICATION_CHANNELS = ["in_app", "email", "telegram", "discord"] as const;
export type NotificationChannel = (typeof NOTIFICATION_CHANNELS)[number];

export function isNotificationChannel(value: unknown): value is NotificationChannel {
  return typeof value === "string" && (NOTIFICATION_CHANNELS as readonly string[]).includes(value);
}

export type NotificationSpec = {
  type: NotificationType;
  /**
   * CRITICAL MEANS THE USER LOSES SOMETHING BY NOT SEEING IT, and it buys
   * exactly two exemptions: the in-app record cannot be switched off, and
   * quiet hours do not defer it.
   *
   * It does NOT exempt a type from the per-channel preference. Somebody
   * who has turned off payment emails because their card lives with an
   * accountant has made a decision, and overriding it "for their own
   * good" is how a product earns a spam complaint from the one person
   * who reads everything.
   */
  critical: boolean;
  /** Channels a new account gets. Deliberately conservative: the two
   *  chat channels are OFF by default even when connected, because
   *  connecting Telegram to get an agent result is not consent to be
   *  messaged about credit balances. */
  defaultChannels: readonly NotificationChannel[];
  /**
   * The window, in minutes, inside which several of this type collapse
   * into one (rule 2). Zero means never group — a payment failure is not
   * "and two others".
   */
  groupWindowMinutes: number;
  /** Where one click goes (rule 5). A path, never an absolute URL — see
   *  lib/notifications/store.ts's safeNotificationUrl for why. */
  href: string;
};

export const NOTIFICATION_SPECS: Record<NotificationType, NotificationSpec> = {
  agent_completed: {
    type: "agent_completed",
    critical: false,
    defaultChannels: ["in_app", "email"],
    // FIVE AGENTS AT 06:00 IS ONE NOTIFICATION. Sixty minutes covers a
    // morning batch without merging this morning's with tomorrow's.
    groupWindowMinutes: 60,
    href: "/dashboard/agents",
  },
  website_published: {
    type: "website_published",
    critical: false,
    defaultChannels: ["in_app"],
    // Publishing is something the user just did and is watching. Grouping
    // would only merge two deliberate acts a minute apart.
    groupWindowMinutes: 0,
    href: "/dashboard/published",
  },
  research_ready: {
    type: "research_ready",
    critical: false,
    defaultChannels: ["in_app", "email"],
    groupWindowMinutes: 60,
    href: "/dashboard/deep-research",
  },
  credits_low: {
    // CRITICAL, and this is the one people argue about. It is not an
    // upsell: an account that hits zero has its scheduled agents paused,
    // and the user finds out days later that the thing they built stopped.
    // The 80% warning is what makes that avoidable.
    type: "credits_low",
    critical: true,
    defaultChannels: ["in_app", "email"],
    // NEVER GROUPED. 80% and 100% are different facts and merging them
    // loses the one that came second.
    groupWindowMinutes: 0,
    href: "/dashboard/settings#buy-credits",
  },
  payment_failed: {
    type: "payment_failed",
    critical: true,
    defaultChannels: ["in_app", "email"],
    groupWindowMinutes: 0,
    href: "/dashboard/settings#buy-credits",
  },
  team_member_joined: {
    type: "team_member_joined",
    critical: false,
    defaultChannels: ["in_app"],
    groupWindowMinutes: 60,
    href: "/dashboard/team",
  },
  error_needs_attention: {
    type: "error_needs_attention",
    critical: true,
    defaultChannels: ["in_app", "email"],
    // Grouped, because the failure mode this guards against is a hundred
    // of them at once — which is precisely when a user most needs ONE
    // message rather than a hundred.
    groupWindowMinutes: 30,
    href: "/dashboard/system-health",
  },
};

/**
 * The channels a type may EVER use, before the user's preference.
 *
 * in_app is on every one of them because it is the record: a
 * notification that was suppressed everywhere leaves no trace at all,
 * and "I never got told" becomes unanswerable.
 */
export function allowedChannels(type: NotificationType): NotificationChannel[] {
  return [...NOTIFICATION_CHANNELS];
}

/**
 * Applies the user's preference to a type, with the two exemptions a
 * critical type gets and no more.
 */
export function resolveChannels(params: {
  type: NotificationType;
  /** What the user chose. Undefined means they have never chosen, so the
   *  defaults apply. */
  chosen?: readonly NotificationChannel[];
  /** Types the user has switched off entirely (rule 4). */
  disabled?: boolean;
  /** Chat channels with no target configured cannot be used however the
   *  preference reads. */
  available?: readonly NotificationChannel[];
}): NotificationChannel[] {
  const spec = NOTIFICATION_SPECS[params.type];
  const available = params.available ?? NOTIFICATION_CHANNELS;

  if (params.disabled) {
    // OPTED OUT. A critical type still leaves its in-app record — the
    // user turned off being INTERRUPTED, not being told at all, and a
    // paused account with no trace of why is a support ticket.
    return spec.critical ? ["in_app"] : [];
  }

  const chosen = params.chosen ?? spec.defaultChannels;
  const resolved = chosen.filter((c) => available.includes(c));
  if (spec.critical && !resolved.includes("in_app")) resolved.push("in_app");
  // Stable order, so two calls with the same inputs produce the same
  // array — which is what lets a test compare them.
  return NOTIFICATION_CHANNELS.filter((c) => resolved.includes(c));
}
