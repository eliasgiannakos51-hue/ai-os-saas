/**
 * THE PHONE'S FOUR TABS — Home, Chat, Tools, You (docs/CONTEXT.md,
 * ΣΥΣΤΗΜΑ DESIGN, «ΚΙΝΗΤΟ»), and which one a page belongs to.
 *
 * Built on lib/nav/rail.ts's activeRail, so the phone and the desktop
 * sidebar can never disagree about where a page lives: Ionexa Chat and
 * the Chats page are Chat; Coding, All tools and every tool — a recent
 * one included — are Tools; Settings is You; Home is this bar's own
 * tab, since the rail stopped having a «New» row on 2026-10-17.
 */
import { RAIL_ROWS, activeRail } from "@/lib/nav/rail";

export const TABS = [
  { key: "home", href: "/dashboard/overview" },
  { key: "chat", href: "/dashboard/chat" },
  { key: "tools", href: "/dashboard/tools" },
  { key: "you", href: "/dashboard/settings" },
] as const;

export type TabKey = (typeof TABS)[number]["key"];

/**
 * Any /dashboard page that is not Home, Chat or the account's own pages
 * is a tool, so a page the rail does not know still lights Tools rather
 * than nothing — the bar has no "none" state on a dashboard screen.
 */
export function activeTab(pathname: string | null): TabKey | null {
  if (!pathname) return null;
  // HOME IS ADDED FOR THIS ONE QUESTION. The bottom bar has a Home tab
  // and the rail no longer has a «New» row — it went on 2026-10-17 with
  // «Chats», both replaced by one «Ionexa Chat». Without this entry
  // /dashboard/overview would match no row and fall to Tools: the phone
  // would light the wrong tab on the first screen anybody sees.
  //
  // «Ionexa Chat» already carries /dashboard/chats in its own `match`
  // (lib/nav/rail.ts), so the Chats page lights the Chat tab here for
  // free rather than through a second rule that could drift.
  const rail = activeRail(pathname, [], [], [
    ...RAIL_ROWS,
    { key: "home" as const, href: "/dashboard/overview" },
  ]);
  if (rail && "key" in rail) {
    if (rail.key === "home") return "home";
    if (rail.key === "ionexaChat" || rail.key === "chat") return "chat";
    if (rail.key === "settings") return "you";
    return "tools";
  }
  return pathname.startsWith("/dashboard") ? "tools" : null;
}
