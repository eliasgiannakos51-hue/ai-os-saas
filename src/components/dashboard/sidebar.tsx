"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Code2, LayoutGrid, MessageCircle, PanelLeftClose, PanelLeftOpen, Pin, PinOff, Plus, Settings, X } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { Tooltip } from "@/components/ui/tooltip";
import { Logo } from "@/components/logo";
import { displayNameFromEmail } from "@/lib/greeting";
import { MAIN_SIDEBAR_GROUPS, SETTINGS_GROUP, sidebarGroups, type SidebarItem } from "@/lib/sidebar-nav";
import { ITEM_LABEL_KEYS } from "@/lib/sidebar-label-keys";
import { RAIL_ROWS, SETTINGS_HREF, activeRail, type RailKey } from "@/lib/nav/rail";
import type { RecentAction, RecentTool } from "@/lib/nav/recent-tools";
import { useSidebar } from "@/components/dashboard/sidebar-context";
import { useToast } from "@/components/toast/toast-context";

/**
 * THE SIDEBAR — ΣΥΣΤΗΜΑ DESIGN (docs/CONTEXT.md, 2026-10-04): the same
 * on every page. Logo, New, Chat, Coding, All tools, Recent tools, and
 * Settings at the bottom with the account inside it. Nothing else is
 * ever here; every tool is in All tools and ⌘K (lib/nav/rail.ts).
 *
 * WHY THE OLD "All tools changes the sidebar" BUG CANNOT HAPPEN. The
 * Recent list used to be rebuilt from localStorage on every page change,
 * so opening a tool from All tools grew a new section under the cursor.
 * It is now computed on the server from the account's own history
 * (lib/nav/recent-tools.ts) once per load, and a navigation does not
 * touch it. Only an explicit pin or removal changes it, and then by the
 * person's own hand.
 *
 * NARROW MODE: icons only, the name in a tooltip AND as the link's
 * accessible name. Kept per device (localStorage, guarded), because how
 * wide a sidebar should be is a property of the screen, not the account.
 */
const RAIL_ICONS: Record<RailKey, LucideIcon> = {
  new: Plus,
  chat: MessageCircle,
  coding: Code2,
  allTools: LayoutGrid,
  settings: Settings,
};
const COLLAPSED_KEY = "ionexa.sidebarCollapsed";

export function Sidebar({
  email = "",
  planName = "",
  isOwner = false,
  recent = [],
}: {
  email?: string;
  planName?: string;
  /** Owner-only rows are left out for everybody else (lib/sidebar-nav.ts). */
  isOwner?: boolean;
  /** Recent tools, computed by the dashboard layout from the account. */
  recent?: RecentTool[];
}) {
  const pathname = usePathname();
  const router = useRouter();
  const t = useTranslations("sidebar");
  const { open, setOpen } = useSidebar();
  const { addToast } = useToast();
  const closeOnMobile = () => setOpen(false);

  const [collapsed, setCollapsed] = useState(false);
  useEffect(() => {
    try {
      setCollapsed(window.localStorage.getItem(COLLAPSED_KEY) === "1");
    } catch {
      /* storage blocked: the wide sidebar, which is the default */
    }
  }, []);
  const toggleCollapsed = () => {
    setCollapsed((c) => {
      try {
        window.localStorage.setItem(COLLAPSED_KEY, c ? "0" : "1");
      } catch {
        /* storage blocked: this page only */
      }
      return !c;
    });
  };

  // The tools a Recent row may name, with their icons and labels.
  const tools = useMemo(
    () => sidebarGroups([...MAIN_SIDEBAR_GROUPS, SETTINGS_GROUP], isOwner).flatMap((g) => g.items),
    [isOwner]
  );
  const toolFor = (href: string): SidebarItem | undefined => tools.find((i) => i.href === href);

  // A pin or removal, shown at once and then confirmed by the server.
  const [list, setList] = useState<RecentTool[]>(recent);
  useEffect(() => setList(recent), [recent]);
  const act = async (action: RecentAction, href: string) => {
    const before = list;
    setList((l) =>
      action === "remove"
        ? l.filter((r) => r.href !== href)
        : l.map((r) => (r.href === href ? { ...r, pinned: action === "pin" } : r))
    );
    try {
      const res = await fetch("/api/nav/recent-tools", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, href }),
      });
      if (!res.ok) throw new Error(String(res.status));
      router.refresh();
    } catch {
      setList(before);
      addToast(t("rail.saveFailed"), "error");
    }
  };

  const active = activeRail(
    pathname,
    list.map((r) => r.href),
    tools.map((i) => i.href)
  );
  const isRowActive = (key: RailKey) => Boolean(active && "key" in active && active.key === key);

  // Warm the route the pointer is heading for: every dashboard route is
  // dynamic, so the fetch after a click is the transition the person
  // feels. One prefetch for the link being approached, not twenty.
  const warmed = useRef<Set<string>>(new Set());
  const warm = useCallback(
    (href: string) => {
      if (warmed.current.has(href)) return;
      warmed.current.add(href);
      router.prefetch(href);
    },
    [router]
  );

  const labelOf = (item: SidebarItem) => {
    const key = ITEM_LABEL_KEYS[item.label];
    return key ? t(`items.${key}`) : item.label;
  };

  const row = (href: string, label: string, Icon: LucideIcon, isActive: boolean, extra?: React.ReactNode) => {
    const link = (
      <Link
        href={href}
        onClick={closeOnMobile}
        onMouseEnter={() => warm(href)}
        onFocus={() => warm(href)}
        onTouchStart={() => warm(href)}
        aria-label={collapsed ? label : undefined}
        aria-current={isActive ? "page" : undefined}
        data-active={isActive}
        className={`nav-item flex min-h-[44px] flex-1 items-center gap-3 px-3 py-2 text-sm ${
          isActive ? "text-foreground" : "text-muted hover:bg-panel-hover hover:text-foreground"
        } ${collapsed ? "md:justify-center md:px-0" : ""}`}
      >
        <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
        <span className={`min-w-0 break-words ${collapsed ? "md:sr-only" : ""}`}>{label}</span>
      </Link>
    );
    return (
      <div key={href} className="group relative flex items-center">
        {collapsed ? (
          <Tooltip content={label} side="right">
            {link}
          </Tooltip>
        ) : (
          link
        )}
        {extra}
      </div>
    );
  };

  return (
    <>
      {open && (
        <div
          onClick={closeOnMobile}
          className="fixed inset-0 z-40 bg-background/70 transition-opacity duration-200 md:hidden"
          aria-hidden="true"
        />
      )}

      <aside
        data-testid="sidebar"
        data-collapsed={collapsed}
        className={`fixed inset-y-0 start-0 z-50 flex w-64 flex-col overflow-y-auto border-e border-divider bg-background transition-[transform,width] duration-200 ease-out md:sticky md:top-0 md:z-auto md:h-screen md:shrink-0 md:translate-x-0 ${
          collapsed ? "md:w-16" : "md:w-60"
        } ${open ? "translate-x-0" : "-translate-x-full rtl:translate-x-full md:rtl:translate-x-0"}`}
      >
        <div className={`flex items-center gap-2 px-3 py-4 ${collapsed ? "md:justify-center md:px-0" : ""}`}>
          <Link href="/dashboard/overview" onClick={closeOnMobile} className="flex items-center rounded-item px-1 py-1" aria-label="Ionexa">
            {collapsed ? <Logo iconOnly px={26} /> : <Logo px={24} />}
          </Link>
          <button
            type="button"
            onClick={closeOnMobile}
            aria-label={t("closeMenu")}
            className="ms-auto flex h-11 w-11 items-center justify-center rounded-item text-muted hover:bg-panel-hover hover:text-foreground md:hidden"
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>

        <nav className="flex-1 space-y-1 px-2" aria-label={t("rail.label")}>
          {RAIL_ROWS.map((r) => row(r.href, t(`rail.${r.key}`), RAIL_ICONS[r.key], isRowActive(r.key)))}

          {list.length > 0 && (
            <div className="pt-5" data-testid="recent-tools">
              {!collapsed && <p className="px-3 pb-2 text-xs text-muted">{t("rail.recentTools")}</p>}
              <div className="space-y-1">
                {list.map((r) => {
                  const item = toolFor(r.href);
                  if (!item) return null;
                  const label = labelOf(item);
                  const isActive = Boolean(active && "recent" in active && active.recent === r.href);
                  return row(
                    r.href,
                    label,
                    item.icon,
                    isActive,
                    collapsed ? null : (
                      <span className="absolute end-1 flex items-center opacity-0 transition-opacity duration-150 focus-within:opacity-100 group-hover:opacity-100">
                        <button
                          type="button"
                          onClick={() => act(r.pinned ? "unpin" : "pin", r.href)}
                          aria-label={t(r.pinned ? "rail.unpin" : "rail.pin", { tool: label })}
                          aria-pressed={r.pinned}
                          className="flex h-8 w-8 items-center justify-center rounded-item text-muted hover:bg-panel-hover hover:text-foreground"
                        >
                          {r.pinned ? <PinOff className="h-3.5 w-3.5" aria-hidden="true" /> : <Pin className="h-3.5 w-3.5" aria-hidden="true" />}
                        </button>
                        <button
                          type="button"
                          onClick={() => act("remove", r.href)}
                          aria-label={t("rail.remove", { tool: label })}
                          className="flex h-8 w-8 items-center justify-center rounded-item text-muted hover:bg-panel-hover hover:text-foreground"
                        >
                          <X className="h-3.5 w-3.5" aria-hidden="true" />
                        </button>
                      </span>
                    )
                  );
                })}
              </div>
            </div>
          )}
        </nav>

        <div className="space-y-1 border-t border-divider px-2 py-3">
          {row(
            SETTINGS_HREF,
            t("rail.settings"),
            Settings,
            isRowActive("settings"),
            null
          )}
          {email && !collapsed && (
            <p className="px-3 text-xs text-muted">
              <span className="block break-words text-foreground">{displayNameFromEmail(email)}</span>
              {planName && <span className="block break-words">{planName}</span>}
            </p>
          )}
          <button
            type="button"
            onClick={toggleCollapsed}
            aria-label={t(collapsed ? "rail.expand" : "rail.collapse")}
            className={`hidden min-h-[44px] w-full items-center gap-3 rounded-item px-3 text-sm text-muted hover:bg-panel-hover hover:text-foreground md:flex ${
              collapsed ? "md:justify-center md:px-0" : ""
            }`}
          >
            {collapsed ? <PanelLeftOpen className="h-4 w-4" aria-hidden="true" /> : <PanelLeftClose className="h-4 w-4" aria-hidden="true" />}
            <span className={collapsed ? "sr-only" : ""}>{t(collapsed ? "rail.expand" : "rail.collapse")}</span>
          </button>
        </div>
      </aside>
    </>
  );
}
