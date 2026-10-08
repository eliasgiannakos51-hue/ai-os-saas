/**
 * RECENT TOOLS — the sidebar's one moving part (docs/CONTEXT.md,
 * ΣΥΣΤΗΜΑ DESIGN §3 and «RECENT TOOLS, Ο ΣΩΣΤΟΣ ΚΑΝΟΝΑΣ», 2026-10-05):
 *
 *   - a USE is finished work only: a result produced, something saved,
 *     a task run to the end. Opening a page, a click from All tools,
 *     browsing, and a task that was cancelled or failed are not uses;
 *   - a tool appears after 3 uses on at least 2 different days within
 *     the last 30 days, and leaves after 30 days without one;
 *   - at most five; past five, the five most recently used stay, and a
 *     pinned tool is never pushed out;
 *   - pinning (from All tools) is the only way in at once; any tool can
 *     be removed;
 *   - empty for a new person, and then the heading is not drawn either;
 *   - Chat and Coding never appear, because they are already above;
 *   - kept on the ACCOUNT, not in the browser.
 *
 * WHERE A USE COMES FROM, with nothing new written to find out:
 *
 *   ai_cost_log    one row per SETTLED action — settlement happens only
 *                  when the work finished. The job runner's refunded,
 *                  stopped and cannot-complete rows carry a suffix, match
 *                  no tool and are not uses (completionEvents below).
 *   search_index   one row per thing SAVED (a file, a record, a project,
 *                  a site), kept by triggers on every table it indexes;
 *                  its `href` names the tool. An edit updates the row and
 *                  is not a new use.
 *
 * Until 2026-10-05 a use was an OPENED page (nav_events), which is why a
 * tool clicked once from All tools showed up in the sidebar.
 *
 * WHERE PINS AND REMOVALS LIVE. In the account's user_metadata, under
 * `recent_tools` — no new table, so no migration. A removal is a date:
 * the tool comes back only if it qualifies again on uses AFTER it.
 *
 * Pure: no database, no clock (`now` is passed in), so the gate runs it.
 */

export const RECENT_TOOLS_MAX = 5;
export const RECENT_WINDOW_DAYS = 30;
export const USES_TO_APPEAR = 3;
export const DAYS_TO_APPEAR = 2;
/** Already at the top of the sidebar, so never repeated below it. */
export const NEVER_RECENT: readonly string[] = ["/dashboard/chat", "/dashboard/coding"];

export type RecentPrefs = { pinned: string[]; removed: Record<string, string> };
export type RecentTool = { href: string; pinned: boolean; lastUsed: string | null };

/** The sidebar's «Πρόσφατες συνομιλίες»: the latest conversations, by
 *  last activity (app/dashboard/layout.tsx reads them). */
export const RECENT_CONVERSATIONS = 5;
export type RecentConversation = { id: string; title: string };
/** One finished piece of work: where it happened, and when. */
export type NavEvent = { path: string; created_at: string };
export type RecentAction = "pin" | "unpin" | "remove";

/**
 * Settlement feature → the tool it was done in. A feature not listed
 * here (a pre-check, a clarifying question, an import during onboarding)
 * is not a use of any one tool.
 */
export const COMPLETION_TOOLS: Readonly<Record<string, string>> = {
  website_generate: "/dashboard/website-builder",
  website_edit: "/dashboard/website-builder",
  deep_research: "/dashboard/deep-research",
  research_plan: "/dashboard/deep-research",
  presentation_generate: "/dashboard/presentations",
  presentation_edit: "/dashboard/presentations",
  posts_generate: "/dashboard/posts",
  data_analysis: "/dashboard/data-analysis",
  meeting_analyse: "/dashboard/meetings",
  document_translate: "/dashboard/documents",
  document_generate: "/dashboard/documents",
  document_edit: "/dashboard/documents",
  file_ask: "/dashboard/files",
  insight_narrate: "/dashboard/predictions",
  mission_plan: "/dashboard/mission",
  mission_review: "/dashboard/mission",
  agent_build: "/dashboard/agents",
  agent_run: "/dashboard/agents",
  scheduled_agent_run: "/dashboard/agents",
  agent_run_batch: "/dashboard/agents",
  automation_run: "/dashboard/automation",
  voice: "/dashboard/voice",
};

/** ai_cost_log rows → finished-work events. The lookup is by EXACT
 *  feature, so the job runner's `_refunded`, `_stopped` and
 *  `_cannot_complete` rows — work that did not finish — match nothing. */
export function completionEvents(rows: readonly { feature: string; created_at: string }[]): NavEvent[] {
  const out: NavEvent[] = [];
  for (const r of rows) {
    const href = COMPLETION_TOOLS[r.feature];
    if (href) out.push({ path: href, created_at: r.created_at });
  }
  return out;
}

/** search_index rows → saved-work events (the row's href is its tool). */
export function savedEvents(rows: readonly { href: string; created_at: string }[]): NavEvent[] {
  return rows.filter((r) => typeof r.href === "string" && r.href.length > 0).map((r) => ({ path: r.href, created_at: r.created_at }));
}

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

/** The tool a path belongs to, on a segment boundary; a query or a
 *  fragment is not part of the path. */
export function toolForPath(path: string, toolHrefs: readonly string[]): string | null {
  const bare = path.split(/[?#]/)[0];
  for (const href of toolHrefs) {
    if (bare === href || bare.startsWith(`${href}/`)) return href;
  }
  return null;
}

/** Enough finished work to earn a row: 3 uses, on at least 2 days. */
export function qualifies(times: readonly number[]): boolean {
  const days = new Set(times.map((t) => new Date(t).toISOString().slice(0, 10)));
  return times.length >= USES_TO_APPEAR && days.size >= DAYS_TO_APPEAR;
}

/** The list the sidebar draws: pinned first, then most recently used. */
export function recentTools(input: {
  events: readonly NavEvent[];
  toolHrefs: readonly string[];
  prefs: RecentPrefs;
  now: Date;
}): RecentTool[] {
  const candidates = input.toolHrefs.filter((h) => !NEVER_RECENT.includes(h));
  const since = input.now.getTime() - RECENT_WINDOW_DAYS * 86_400_000;
  const uses = new Map<string, number[]>();
  for (const e of input.events) {
    const at = Date.parse(e.created_at);
    if (Number.isNaN(at) || at < since || at > input.now.getTime()) continue;
    const href = toolForPath(e.path, candidates);
    if (!href) continue;
    const removedAt = input.prefs.removed[href];
    if (removedAt && at <= Date.parse(removedAt)) continue;
    const list = uses.get(href) ?? [];
    list.push(at);
    uses.set(href, list);
  }
  const lastUsed = (href: string) => {
    const list = uses.get(href);
    return list && list.length ? Math.max(...list) : null;
  };
  const pinned = input.prefs.pinned.filter((h) => candidates.includes(h)).slice(0, RECENT_TOOLS_MAX);
  const used = [...uses.entries()]
    .filter(([href, times]) => !pinned.includes(href) && qualifies(times))
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
