/**
 * Lifecycle email decisions (V3 Task 13) — pure, so the cron's behaviour
 * is testable as a function instead of an inbox.
 *
 * The sequence: day1 "you haven't tried anything yet", day3 a tip about
 * the thing they DID use, day7 what they actually achieved, day14
 * re-engagement if they went quiet, day30 the personalised upgrade
 * suggestion. Day 0 is the welcome email, sent at signup by
 * /api/signup and /auth/callback — not by the cron.
 *
 * TWO RULES, applied to every email:
 *   - REAL DATA ONLY. An email with nothing true to say is not sent.
 *     day7 with zero activity is skipped, not padded with encouragement;
 *     day3's tip requires an actual most-used module; day30 requires the
 *     upgrade rule to have produced a real suggestion.
 *   - A WINDOW, NOT A BACKFILL. Each email is due only while the account
 *     age is inside [day, day+2). A 60-day-old account that never got
 *     day7 does not get it now — a "here's your first week" email in
 *     month three reads as exactly what it is.
 */

export type LifecycleKey = "day1" | "day3" | "day7" | "day14" | "day30";

export const LIFECYCLE_DAYS: Record<LifecycleKey, number> = {
  day1: 1,
  day3: 3,
  day7: 7,
  day14: 14,
  day30: 30,
};

// The daily cron can slip (deploy windows, incident days); two days of
// grace keeps a one-run outage from silently dropping a whole cohort's
// email while still never sending one embarrassingly late.
export const LIFECYCLE_WINDOW_DAYS = 2;

export type LifecycleActivity = {
  /** Total AI actions ever (ai_cost_log rows). */
  aiActions: number;
  /** Total module entries ever, across every module. */
  totalEntries: number;
  /** The module with the most entries, when any exist. */
  topModuleSlug: string | null;
  /** Entries + AI actions in the last 7 days. */
  recentActivity: number;
  /** Websites published, ever. */
  websitesPublished: number;
  /** True when the day-30 upgrade rule produced a real suggestion. */
  hasUpgradeSuggestion: boolean;
};

export function lifecycleKeyDue(ageDays: number, key: LifecycleKey): boolean {
  const day = LIFECYCLE_DAYS[key];
  return ageDays >= day && ageDays < day + LIFECYCLE_WINDOW_DAYS;
}

/**
 * Which emails an account is due for TODAY, before the already-sent log
 * is consulted. Order is stable (earliest first) so if two ever fall in
 * the same window only the earliest is sent — the caller takes the first
 * unsent one, because two lifecycle emails in one day is a spam folder's
 * definition of a drip campaign.
 */
export function dueLifecycleEmails(ageDays: number, activity: LifecycleActivity): LifecycleKey[] {
  const due: LifecycleKey[] = [];

  // day1 — only for an account that has genuinely done nothing. Someone
  // who already ran three AI actions does not need "have you tried it?".
  if (lifecycleKeyDue(ageDays, "day1") && activity.aiActions === 0 && activity.totalEntries === 0) {
    due.push("day1");
  }

  // day3 — a tip about what they actually use. No usage, no tip: day1
  // already made the "try something" case.
  if (lifecycleKeyDue(ageDays, "day3") && activity.topModuleSlug !== null) {
    due.push("day3");
  }

  // day7 — "here's what you achieved", which requires an achievement.
  if (lifecycleKeyDue(ageDays, "day7") && (activity.totalEntries > 0 || activity.aiActions > 0)) {
    due.push("day7");
  }

  // day14 — re-engagement, only for the quiet. An active account getting
  // "we miss you" is worse than no email.
  if (lifecycleKeyDue(ageDays, "day14") && activity.recentActivity === 0) {
    due.push("day14");
  }

  // day30 — the personalised upgrade nudge, only when the same rule the
  // dashboard uses produced a real suggestion from real usage.
  if (lifecycleKeyDue(ageDays, "day30") && activity.hasUpgradeSuggestion) {
    due.push("day30");
  }

  return due;
}
