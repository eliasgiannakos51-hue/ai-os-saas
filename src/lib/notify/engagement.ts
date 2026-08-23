import { NOTIFICATION_TYPES, type NotificationChannel, type NotificationType } from "@/lib/notify/types";

/**
 * THE MEASUREMENT, AND THE VERDICT IT LEADS TO.
 *
 * The brief: "open rate, click rate per type. If click rate is under 10%,
 * the type is not worth sending."
 *
 * ============================================================
 * THE HONEST PART ABOUT OPEN RATES
 * ============================================================
 *
 * EMAIL OPEN RATES ARE NOT A MEASUREMENT ANY MORE, and reporting one as
 * though it were would be inventing data. Apple Mail Privacy Protection
 * fetches every tracking pixel in every message whether or not the
 * recipient looked at it, and it has been the default on iPhone since
 * 2021; Gmail proxies images similarly. An email "open rate" today is
 * closer to a measure of which mail clients your users have.
 *
 * So this module computes open rate where it is REAL (in-app: the row was
 * rendered in an opened bell) and marks it UNMEASURABLE for email rather
 * than printing a number that means nothing. The two chat channels have
 * no open signal at all and say so.
 *
 * CLICK RATE IS REAL EVERYWHERE, because a click is a request that
 * reaches our own server (api/n/[id]). It is also the metric the brief's
 * rule is actually about, which is fortunate: the one that survives is
 * the one that decides.
 *
 * Pure — the counting is done by the caller's SQL, the arithmetic and the
 * judgement are here where the build gate can read them.
 */

/** The brief's threshold. A type under this is not earning its place. */
export const CLICK_RATE_FLOOR_PERCENT = 10;

/**
 * Below this many sends, a rate is noise. One click out of three is 33%
 * and means nothing; zero out of three is 0% and means nothing either —
 * and switching a type off on that basis would be the most confident
 * possible way to be wrong.
 */
export const MIN_SENDS_FOR_VERDICT = 30;

export type ChannelCounts = { sent: number; opened: number; clicked: number; suppressed: number };
export type TypeCounts = Partial<Record<NotificationChannel, ChannelCounts>>;

export type OpenRate =
  | { measurable: true; percent: number }
  | { measurable: false; why: "prefetching_makes_it_meaningless" | "no_open_signal" | "not_enough_sends" };

export type ChannelEngagement = {
  channel: NotificationChannel;
  sent: number;
  clickRatePercent: number | null;
  openRate: OpenRate;
};

export type TypeEngagement = {
  type: NotificationType;
  sent: number;
  suppressed: number;
  clicked: number;
  /** Null below MIN_SENDS_FOR_VERDICT — see why above. */
  clickRatePercent: number | null;
  verdict: "worth_sending" | "not_worth_sending" | "too_early_to_say";
  channels: ChannelEngagement[];
};

function rate(numerator: number, denominator: number): number | null {
  if (denominator < MIN_SENDS_FOR_VERDICT) return null;
  return (numerator / denominator) * 100;
}

function openRateFor(channel: NotificationChannel, counts: ChannelCounts): OpenRate {
  if (channel === "telegram" || channel === "discord") {
    return { measurable: false, why: "no_open_signal" };
  }
  if (channel === "email") {
    // See the header. A pixel-based figure here would be a number that
    // looks like a measurement and is not one.
    return { measurable: false, why: "prefetching_makes_it_meaningless" };
  }
  const percent = rate(counts.opened, counts.sent);
  return percent === null
    ? { measurable: false, why: "not_enough_sends" }
    : { measurable: true, percent };
}

export function engagementForType(type: NotificationType, counts: TypeCounts): TypeEngagement {
  const channels: ChannelEngagement[] = [];
  let sent = 0;
  let clicked = 0;
  let suppressed = 0;

  for (const [channel, c] of Object.entries(counts) as [NotificationChannel, ChannelCounts][]) {
    if (!c) continue;
    sent += c.sent;
    clicked += c.clicked;
    suppressed += c.suppressed;
    channels.push({
      channel,
      sent: c.sent,
      clickRatePercent: rate(c.clicked, c.sent),
      openRate: openRateFor(channel, c),
    });
  }

  const clickRatePercent = rate(clicked, sent);
  return {
    type,
    sent,
    suppressed,
    clicked,
    clickRatePercent,
    verdict:
      clickRatePercent === null
        ? "too_early_to_say"
        : clickRatePercent < CLICK_RATE_FLOOR_PERCENT
          ? "not_worth_sending"
          : "worth_sending",
    // Stable order so two reports over the same data read the same.
    channels: channels.sort((a, b) => a.channel.localeCompare(b.channel)),
  };
}

export function engagementReport(byType: Partial<Record<NotificationType, TypeCounts>>): TypeEngagement[] {
  return NOTIFICATION_TYPES.map((type) => engagementForType(type, byType[type] ?? {}))
    // Worst first: the report exists to find the type that is not earning
    // its place, and sorting by name buries it.
    .sort((a, b) => {
      const order = { not_worth_sending: 0, worth_sending: 1, too_early_to_say: 2 } as const;
      return order[a.verdict] - order[b.verdict] || (a.clickRatePercent ?? 101) - (b.clickRatePercent ?? 101);
    });
}

/**
 * WHAT THE VERDICT IS NOT ALLOWED TO DO.
 *
 * It does not switch anything off. A low click rate on `payment_failed`
 * means people fix their card in the email client rather than following
 * a link — not that a failed payment is not worth telling somebody about.
 * The verdict is a report for a human, and every critical type is marked
 * so nobody automates the wrong lesson from it.
 */
export function isSafeToRetire(type: NotificationType, engagement: TypeEngagement): boolean {
  if (engagement.verdict !== "not_worth_sending") return false;
  const critical = (
    ["credits_low", "payment_failed", "error_needs_attention"] as NotificationType[]
  ).includes(type);
  return !critical;
}
