/**
 * THE SIDEBAR, AS DATA — ΣΥΣΤΗΜΑ DESIGN, SIDEBAR (docs/CONTEXT.md):
 *
 *   1. Logo: the earth and the word IONEXA
 *   2. New      3. Chats     4. Coding      5. All tools
 *   6. Recent tools
 *   7. Recent conversations
 *   8. At the bottom: Settings (the account is inside it)
 *
 * NEW AND CHATS ARE TWO DIFFERENT THINGS, and until 2026-10-15 they were
 * not. Both rows led to a place with an empty field and a greeting, so
 * one of the two earned nothing: whichever you pressed, you got a new
 * conversation. The owner's instruction of that day splits them — New
 * starts an empty conversation, Chats opens the page that lists every
 * conversation there is (app/dashboard/chats/page.tsx) — and that page
 * is where the list inside Chat used to be, so there is one sidebar and
 * not two.
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
export const RAIL_ROWS = [
  { key: "new", href: "/dashboard/overview" },
  { key: "chat", href: "/dashboard/chat" },
  { key: "coding", href: "/dashboard/coding" },
  { key: "allTools", href: "/dashboard/tools" },
] as const;

/** Where the third row goes once the switch `chats-page` is on: the list
 *  of every conversation, instead of a second way into a new one. */
export const CHATS_HREF = "/dashboard/chats";

/**
 * The rows to draw, which differ in exactly one place.
 *
 * A FUNCTION RATHER THAN TWO CONSTANTS, so that the switch cannot change
 * the LENGTH or the ORDER of the rail by accident: both arrays are built
 * from the same one, and the only thing the flag decides is what the
 * third row's key and href are. scripts/tests/sidebar-chats.test.mjs
 * holds that the two differ in that one row and nowhere else.
 */
export function railRows(chatsPage: boolean): readonly { key: RailKey; href: string }[] {
  return RAIL_ROWS.map((row) =>
    chatsPage && row.key === "chat" ? { key: "chats" as const, href: CHATS_HREF } : { key: row.key, href: row.href }
  );
}

export const SETTINGS_HREF = "/dashboard/settings";

export type RailKey = (typeof RAIL_ROWS)[number]["key"] | "chats" | "settings";

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
  /** The rows actually drawn; defaults to the pre-switch rail so every
   *  existing caller keeps the behaviour it had. */
  rows: readonly { key: RailKey; href: string }[] = RAIL_ROWS
): { key: RailKey } | { recent: string } | null {
  if (!pathname) return null;
  for (const row of rows) if (under(pathname, row.href)) return { key: row.key };
  const recent = recentHrefs.find((h) => under(pathname, h));
  if (recent) return { recent };
  if (under(pathname, SETTINGS_HREF)) return { key: "settings" };
  if (toolHrefs.some((h) => under(pathname, h))) return { key: "allTools" };
  return null;
}
