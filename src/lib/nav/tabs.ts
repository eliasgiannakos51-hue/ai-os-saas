/**
 * THE PHONE'S FOUR TABS — Home, Chat, Tools, You (docs/CONTEXT.md,
 * ΣΥΣΤΗΜΑ DESIGN, «ΚΙΝΗΤΟ»), and which one a page belongs to.
 *
 * Built on lib/nav/rail.ts's activeRail, so the phone and the desktop
 * sidebar can never disagree about where a page lives: New is Home;
 * Chat is Chat; Coding, All tools and every tool — a recent one
 * included — are Tools; Settings is You.
 */
import { activeRail } from "@/lib/nav/rail";

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
  const rail = activeRail(pathname, [], []);
  if (rail && "key" in rail) {
    if (rail.key === "new") return "home";
    if (rail.key === "chat") return "chat";
    if (rail.key === "settings") return "you";
    return "tools";
  }
  return pathname.startsWith("/dashboard") ? "tools" : null;
}
