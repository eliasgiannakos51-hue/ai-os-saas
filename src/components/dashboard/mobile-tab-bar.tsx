"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import { Home, LayoutGrid, MessageCircle, UserRound } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { TABS, activeTab, type TabKey } from "@/lib/nav/tabs";

const ICONS: Record<TabKey, LucideIcon> = {
  home: Home,
  chat: MessageCircle,
  tools: LayoutGrid,
  you: UserRound,
};

/**
 * THE PHONE'S BOTTOM BAR (docs/CONTEXT.md, ΣΥΣΤΗΜΑ DESIGN, «ΚΙΝΗΤΟ»):
 * Home, Chat, Tools, You, every target at least 44px. Below the md
 * breakpoint only; the sidebar is still one tap away behind the top
 * bar's menu, so nothing that was reachable stops being reachable.
 * Which tab a page belongs to is lib/nav/tabs.ts, so the gate runs it.
 */
export function MobileTabBar() {
  const pathname = usePathname();
  const t = useTranslations("sidebar.tabs");
  const active = activeTab(pathname);
  return (
    <nav
      aria-label={t("label")}
      data-testid="mobile-tab-bar"
      className="fixed inset-x-0 bottom-0 z-40 border-t border-divider bg-background pb-[env(safe-area-inset-bottom)] md:hidden"
    >
      <ul className="grid grid-cols-4">
        {TABS.map((tab) => {
          const Icon = ICONS[tab.key];
          const isActive = active === tab.key;
          return (
            <li key={tab.key}>
              <Link
                href={tab.href}
                aria-current={isActive ? "page" : undefined}
                className={`flex min-h-[56px] flex-col items-center justify-center gap-1 text-[11px] transition-colors duration-150 ${
                  isActive ? "text-foreground" : "text-muted hover:text-foreground"
                }`}
              >
                <Icon className="h-5 w-5" aria-hidden="true" />
                <span className="break-words">{t(tab.key)}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
