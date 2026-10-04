/**
 * THE SIDEBAR, AS DATA — ΣΥΣΤΗΜΑ DESIGN, SIDEBAR (docs/CONTEXT.md):
 *
 *   1. Logo: the earth and the word IONEXA
 *   2. New      3. Chat      4. Coding      5. All tools
 *   6. Recent tools
 *   7. At the bottom: Settings (the account is inside it)
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

export const SETTINGS_HREF = "/dashboard/settings";

export type RailKey = (typeof RAIL_ROWS)[number]["key"] | "settings";

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
  toolHrefs: readonly string[]
): { key: RailKey } | { recent: string } | null {
  if (!pathname) return null;
  for (const row of RAIL_ROWS) if (under(pathname, row.href)) return { key: row.key };
  const recent = recentHrefs.find((h) => under(pathname, h));
  if (recent) return { recent };
  if (under(pathname, SETTINGS_HREF)) return { key: "settings" };
  if (toolHrefs.some((h) => under(pathname, h))) return { key: "allTools" };
  return null;
}
