/**
 * RECENT TOOLS — the sidebar's one moving part (docs/CONTEXT.md,
 * ΣΥΣΤΗΜΑ DESIGN, SIDEBAR):
 *
 *   - empty for a new person, and then the heading is not drawn either;
 *   - a tool appears once it has been used twice within 30 days;
 *   - at most five; a sixth pushes out the one unused for longest;
 *   - the person can remove a tool from it, or pin it so it stays;
 *   - kept on the ACCOUNT, not in the browser;
 *   - Chat and Coding never appear, because they are already above.
 *
 * WHERE "USED" COMES FROM. nav_events (migration
 * 20260915000000_nav_events.sql) already records every screen a person
 * opens, server-side, per account, for 90 days — so a use is an opened
 * tool, and nothing new is written to find out. Opens of the same tool
 * less than SAME_USE_MINUTES apart are ONE use: reloading a page, or
 * going back to it a minute later, is not using it twice.
 *
 * WHERE PINS AND REMOVALS LIVE. In the account's user_metadata, under
 * `recent_tools` — on the account, as the design asks, and with no new
 * table, so no migration has to be run for this to work. A removal is a
 * date: the tool comes back only if it is used twice AFTER it.
 *
 * Pure: no database, no clock (`now` is passed in), so the gate runs it.
 */

export const RECENT_TOOLS_MAX = 5;
export const RECENT_WINDOW_DAYS = 30;
export const USES_TO_APPEAR = 2;
export const SAME_USE_MINUTES = 30;
/** Already at the top of the sidebar, so never repeated below it. */
export const NEVER_RECENT: readonly string[] = ["/dashboard/chat", "/dashboard/coding"];

export type RecentPrefs = { pinned: string[]; removed: Record<string, string> };
export type RecentTool = { href: string; pinned: boolean; lastUsed: string | null };
export type NavEvent = { path: string; created_at: string };
export type RecentAction = "pin" | "unpin" | "remove";

/** Whatever user_metadata holds, the part that is well-formed. */
export function readRecentPrefs(meta: unknown): RecentPrefs {
  const raw = meta && typeof meta === "object" ? (meta as Record<string, unknown>).recent_tools : null;
  const r = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const pinned = Array.isArray(r.pinned) ? r.pinned.filter((h): h is string => typeof h === "string") : [];
  const removed: Record<string, string> = {};
  if (r.removed && typeof r.removed === "object") {
    for (const [href, at] of Object.entries(r.removed as Record<string, unknown>)) {
      if (typeof at === "string" && !Number.isNaN(Date.parse(at))) removed[href] = at;
    }
  }
  return { pinned: [...new Set(pinned)].slice(0, RECENT_TOOLS_MAX), removed };
}

/** The tool a path belongs to, on a segment boundary. */
export function toolForPath(path: string, toolHrefs: readonly string[]): string | null {
  for (const href of toolHrefs) {
    if (path === href || path.startsWith(`${href}/`)) return href;
  }
  return null;
}

/** How many separate uses a list of open times makes. */
export function countUses(times: number[]): number {
  const sorted = [...times].sort((a, b) => a - b);
  let uses = 0;
  let last = -Infinity;
  for (const t of sorted) {
    if (t - last > SAME_USE_MINUTES * 60_000) uses++;
    last = t;
  }
  return uses;
}

/** The list the sidebar draws, newest first after the pinned ones. */
export function recentTools(input: {
  events: readonly NavEvent[];
  toolHrefs: readonly string[];
  prefs: RecentPrefs;
  now: Date;
}): RecentTool[] {
  const candidates = input.toolHrefs.filter((h) => !NEVER_RECENT.includes(h));
  const since = input.now.getTime() - RECENT_WINDOW_DAYS * 86_400_000;
  const opens = new Map<string, number[]>();
  for (const e of input.events) {
    const at = Date.parse(e.created_at);
    if (Number.isNaN(at) || at < since || at > input.now.getTime()) continue;
    const href = toolForPath(e.path, candidates);
    if (!href) continue;
    const removedAt = input.prefs.removed[href];
    if (removedAt && at <= Date.parse(removedAt)) continue;
    const list = opens.get(href) ?? [];
    list.push(at);
    opens.set(href, list);
  }
  const lastUsed = (href: string) => {
    const list = opens.get(href);
    return list && list.length ? Math.max(...list) : null;
  };
  const pinned = input.prefs.pinned.filter((h) => candidates.includes(h)).slice(0, RECENT_TOOLS_MAX);
  const used = [...opens.entries()]
    .filter(([href, times]) => !pinned.includes(href) && countUses(times) >= USES_TO_APPEAR)
    .map(([href]) => href)
    .sort((a, b) => (lastUsed(b) ?? 0) - (lastUsed(a) ?? 0))
    .slice(0, RECENT_TOOLS_MAX - pinned.length);
  const iso = (t: number | null) => (t === null ? null : new Date(t).toISOString());
  return [
    ...pinned.map((href) => ({ href, pinned: true, lastUsed: iso(lastUsed(href)) })),
    ...used.map((href) => ({ href, pinned: false, lastUsed: iso(lastUsed(href)) })),
  ];
}

/** What a pin, an unpin or a removal does to the stored preferences. */
export function applyRecentAction(prefs: RecentPrefs, action: RecentAction, href: string, now: Date): RecentPrefs {
  const pinned = prefs.pinned.filter((h) => h !== href);
  const removed = { ...prefs.removed };
  if (action === "pin") {
    if (prefs.pinned.length >= RECENT_TOOLS_MAX && !prefs.pinned.includes(href)) return prefs;
    delete removed[href];
    return { pinned: [...pinned, href], removed };
  }
  if (action === "unpin") return { pinned, removed };
  removed[href] = now.toISOString();
  return { pinned, removed };
}
