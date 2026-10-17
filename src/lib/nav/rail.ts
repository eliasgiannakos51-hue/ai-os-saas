/**
 * THE SIDEBAR, AS DATA — ΣΥΣΤΗΜΑ DESIGN, SIDEBAR (docs/CONTEXT.md):
 *
 *   1. Logo: the earth and the word IONEXA
 *   2. Ionexa Chat    3. Coding    4. All tools
 *   5. Recent tools (only when there are any)
 *   6. At the bottom: Settings, the name and plan
 *
 * IT KEEPS GETTING SHORTER, ON PURPOSE. «Recent conversations» went on
 * 2026-10-16; «New», «Chats» and «Collapse sidebar» went on 2026-10-17,
 * when the owner replaced the first two with ONE row — «Ionexa Chat» —
 * and moved the conversations inside Chat, where a [◧] opens them in a
 * column beside the thread (components/chat/conversation-column.tsx).
 *
 * «New» and «Chats» were two rows for one place. «New» opened an empty
 * conversation and «Chats» listed them all; both are things you do once
 * you are IN the chat, so they are buttons in its title row now and the
 * rail names the place instead of the two errands.
 *
 * AND THERE IS NO «Collapse sidebar» BECAUSE THERE IS NOTHING TO PRESS.
 * The narrow, icons-only form is what a screen under 1024px gets, and a
 * wide one above it; it is CSS, not a stored choice, so it is right on
 * the first paint and cannot disagree with the screen it is on.
 *
 * THE TWO ROWS WERE ONE PLACE TWICE, AND THAT IS THE HISTORY WORTH
 * KEEPING. Until 2026-10-15 «New» and «Chats» both led to a screen with
 * an empty field and a greeting, so whichever you pressed you got a new
 * conversation and one of the two earned nothing. That was split —
 * «New» to an empty conversation, «Chats» to the page listing them all
 * (app/dashboard/chats/page.tsx) — and two days later the owner
 * collapsed both into «Ionexa Chat», which is the place, with the two
 * errands as buttons inside it. The page did not go: it is reached from
 * «Όλες οι συνομιλίες» at the foot of the column, and its old address
 * still answers.
 *
 * "Κανένα άλλο εργαλείο δεν είναι μόνιμα στο sidebar" and "Δεν αλλάζει
 * ποτέ από σελίδα σε σελίδα": the fixed rows are this constant and
 * nothing else, the same on every page; only Recent tools moves, and it
 * is computed once per load on the server (lib/nav/recent-tools.ts).
 *
 * Every other screen is in All tools (app/dashboard/tools/page.tsx) and
 * ⌘K, which read lib/sidebar-nav.ts — the full list was never in this
 * file and never needs to be.
 */
export const CHATS_HREF = "/dashboard/chats";

/**
 * THE THREE ROWS, THE SAME FOR EVERY ACCOUNT (owner, 2026-10-17).
 *
 * «Ionexa Chat» opens the chat. The conversations are inside it, behind
 * the [◧] in its title row, and the page that lists every one of them
 * is one press further on («Όλες οι συνομιλίες»); `CHATS_HREF` is still
 * exported for that link and for the old addresses, which keep working.
 *
 * NOTHING ELSE IS EVER HERE, and no conversations: they were a row of
 * this rail until 2026-10-16. Every tool is in All tools and ⌘K.
 * scripts/tests/sidebar-no-chats.prodtest.mjs opens ten pages on a
 * computer and a phone and fails on a single conversation, a «New», a
 * «Chats» or a «Collapse sidebar».
 *
 * `match` IS FOR A PAGE THAT BELONGS TO A ROW WITHOUT LIVING UNDER IT.
 * /dashboard/chats is the chat's own list, so it lights «Ionexa Chat» —
 * and it has to be said out loud, because `under()` compares path
 * segments and «/dashboard/chats» is not under «/dashboard/chat».
 */
export const RAIL_ROWS = [
  { key: "ionexaChat", href: "/dashboard/chat", match: [CHATS_HREF] },
  { key: "coding", href: "/dashboard/coding" },
  { key: "allTools", href: "/dashboard/tools" },
] as const;

export const SETTINGS_HREF = "/dashboard/settings";

/** Every row key activeRail may be asked about. The rail itself draws
 *  only RAIL_ROWS plus Settings; "chat" and "home" exist because the
 *  phone's bottom bar passes rows the rail does not have
 *  (lib/nav/tabs.ts) and its answers have to be typed too. */
export type RailKey = (typeof RAIL_ROWS)[number]["key"] | "chat" | "home" | "settings";

/** The keys the sidebar itself draws an icon for. */
export type DrawnRailKey = (typeof RAIL_ROWS)[number]["key"];

/** A row as activeRail reads it: where it goes, plus any page that
 *  belongs to it without sitting under that path. */
export type RailRow = { key: RailKey; href: string; match?: readonly string[] };

function under(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(`${href}/`);
}

/**
 * Which row is the current page's. A fixed row when the page is one; a
 * Recent tool when the page is that tool; All tools for any other tool,
 * because that is where it lives; Settings for the account's pages.
 * Null for a page that belongs to none of them.
 */
export function activeRail(
  pathname: string | null,
  recentHrefs: readonly string[],
  toolHrefs: readonly string[],
  /** The rows actually drawn. Defaults to RAIL_ROWS; the phone's
   *  bottom bar passes its own list, which has a Chat tab the sidebar
   *  does not (lib/nav/tabs.ts). */
  rows: readonly RailRow[] = RAIL_ROWS
): { key: RailKey } | { recent: string } | null {
  if (!pathname) return null;
  for (const row of rows) {
    if (under(pathname, row.href)) return { key: row.key };
    if (row.match?.some((m) => under(pathname, m))) return { key: row.key };
  }
  const recent = recentHrefs.find((h) => under(pathname, h));
  if (recent) return { recent };
  if (under(pathname, SETTINGS_HREF)) return { key: "settings" };
  if (toolHrefs.some((h) => under(pathname, h))) return { key: "allTools" };
  return null;
}
