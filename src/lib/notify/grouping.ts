import { NOTIFICATION_SPECS, type NotificationType } from "@/lib/notify/types";

/**
 * RULE 2: FIVE AGENTS ARE ONE NOTIFICATION.
 *
 * Somebody with five scheduled agents at 06:00 gets five results within a
 * minute of each other. Five notifications is five interruptions for one
 * event ("my morning agents ran"), and the fifth is read with more
 * irritation than the first.
 *
 * WHAT GROUPING IS NOT: a summary that loses the contents. The grouped
 * notification names the first one and counts the rest, and one click
 * still goes to the place where all of them are — the individual results
 * were never in the notification, they were always in the product.
 *
 * NOT EVERY TYPE GROUPS. A failed payment is not "and two others". The
 * window is per type in types.ts, and zero means never.
 *
 * Pure.
 */

export type Groupable = {
  type: NotificationType;
  /** Same key means the same event to a human. Usually the type; for an
   *  agent it stays the type rather than the agent id, because "five
   *  agents finished" is the thing being grouped. */
  groupKey: string;
  title: string;
  body: string;
  at: Date;
};

export type Grouped = {
  type: NotificationType;
  groupKey: string;
  title: string;
  body: string;
  at: Date;
  /** 1 when nothing was merged. */
  count: number;
  /** Every id that went into it, so the record can point at all of them. */
  members: Groupable[];
};

export function groupKeyFor(type: NotificationType): string {
  return type;
}

/**
 * Collapses a batch into what should actually be sent.
 *
 * `pending` must be in the order the notifications were raised, oldest
 * first: the FIRST one's title is what the group is named after, because
 * it is the one the user would have seen if nothing had been grouped.
 *
 * A window of zero disables grouping for that type entirely, and each
 * item comes back on its own with count 1 — so the caller has one code
 * path whether or not a type groups.
 */
export function groupNotifications(pending: readonly Groupable[]): Grouped[] {
  const out: Grouped[] = [];
  const open = new Map<string, Grouped>();

  for (const item of pending) {
    const windowMinutes = NOTIFICATION_SPECS[item.type].groupWindowMinutes;
    if (windowMinutes <= 0) {
      out.push({ ...item, count: 1, members: [item] });
      continue;
    }

    const key = `${item.type}::${item.groupKey}`;
    const existing = open.get(key);
    // THE WINDOW IS MEASURED FROM THE FIRST ITEM, not from the last. A
    // sliding window would let a slow trickle of agents merge for hours
    // and produce one notification at lunchtime about something that
    // started at breakfast.
    if (existing && item.at.getTime() - existing.at.getTime() <= windowMinutes * 60_000) {
      existing.count += 1;
      existing.members.push(item);
      continue;
    }

    const started: Grouped = { ...item, count: 1, members: [item] };
    open.set(key, started);
    out.push(started);
  }

  return out;
}

/**
 * The sentence a grouped notification carries.
 *
 * NAMES THE FIRST AND COUNTS THE REST — "Morning briefing ready, and 4
 * more" — rather than "5 agents finished", because the named one is the
 * one that tells the user whether they care.
 *
 * The caller supplies the phrasing so this stays translatable; this
 * function decides only WHAT goes into it.
 */
export function groupSummary(group: Grouped): { leadTitle: string; extraCount: number } {
  return { leadTitle: group.title, extraCount: Math.max(0, group.count - 1) };
}
