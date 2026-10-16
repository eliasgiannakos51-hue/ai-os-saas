/**
 * THE SIDEBAR, AS DATA — ΣΥΣΤΗΜΑ DESIGN, SIDEBAR (docs/CONTEXT.md):
 *
 *   1. Logo: the earth and the word IONEXA
 *   2. New      3. Chats     4. Coding      5. All tools
 *   6. Recent tools (only when there are any)
 *   7. At the bottom: Settings, the name and plan, Collapse sidebar
 *
 * SEVEN ROWS, AND THE SEVENTH USED TO BE EIGHTH. «Recent
 * conversations» sat between Recent tools and Settings until
 * 2026-10-16, when the owner had it taken out —
 * «ΑΦΑΙΡΕΣΕ ΤΙΣ ΠΡΟΣΦΑΤΕΣ ΣΥΝΟΜΙΛΙΕΣ ΑΠΟ ΤΟ SIDEBAR». Nothing draws
 * them in any width, on any page, for any account; they are all on
 * the Chats page that row 3 opens.
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
export const CHATS_HREF = "/dashboard/chats";

/**
 * THE FOUR ROWS, THE SAME FOR EVERY ACCOUNT (owner, 2026-10-16).
 *
 * The third row said «Chat» and opened a new conversation until
 * 2026-10-15, then said «Chats» for staff only while the switch
 * `chats-page` was being tried. The switch is gone and «Chats» is what
 * everybody sees: it opens the page with every conversation, where the
 * «⋯» renames, pins, moves to a Project and deletes.
 *
 * NOTHING ELSE IS EVER HERE. No conversations — they were a seventh row
 * of this rail until 2026-10-16 and the owner had them taken out:
 * «ΑΦΑΙΡΕΣΕ ΤΙΣ ΠΡΟΣΦΑΤΕΣ ΣΥΝΟΜΙΛΙΕΣ ΑΠΟ ΤΟ SIDEBAR». Every tool is in
 * All tools and ⌘K. scripts/tests/sidebar-no-chats.prodtest.mjs opens
 * ten pages on a computer and a phone and fails on a single one.
 */
export const RAIL_ROWS = [
  { key: "new", href: "/dashboard/overview" },
  { key: "chats", href: CHATS_HREF },
  { key: "coding", href: "/dashboard/coding" },
  { key: "allTools", href: "/dashboard/tools" },
] as const;

export const SETTINGS_HREF = "/dashboard/settings";

export type RailKey = (typeof RAIL_ROWS)[number]["key"] | "chat" | "settings";

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
