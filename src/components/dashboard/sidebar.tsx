"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import { ChevronRight, X } from "lucide-react";
import { OVERVIEW_NAV_ITEM } from "@/lib/modules";
import {
  ALL_SIDEBAR_GROUPS,
  MAIN_SIDEBAR_GROUPS,
  SETTINGS_GROUP,
  type SidebarGroupConfig,
} from "@/lib/sidebar-nav";
import { useSidebar } from "@/components/dashboard/sidebar-context";
import { Logo } from "@/components/logo";
import { GROUP_HEADING_KEYS, ITEM_LABEL_KEYS } from "@/lib/sidebar-label-keys";

function isActive(pathname: string | null, href: string) {
  if (href === "/dashboard") return pathname === "/dashboard";
  if (!pathname) return false;
  // Segment-boundary match, not a raw prefix — otherwise "/dashboard/trading"
  // would also light up on "/dashboard/trading-workflow" (and any other
  // href that happens to be a string prefix of a sibling route).
  return pathname === href || pathname.startsWith(`${href}/`);
}

function groupContainsActive(group: SidebarGroupConfig, pathname: string | null) {
  return group.items.some((item) => isActive(pathname, item.href));
}

function defaultExpanded(group: SidebarGroupConfig, pathname: string | null) {
  return !group.collapsible || groupContainsActive(group, pathname);
}

function storageKey(heading: string) {
  return `ionexa:sidebar-group:${heading}`;
}

export function Sidebar() {
  const pathname = usePathname();
  const t = useTranslations("sidebar");
  const tCommon = useTranslations("common");
  const { open, setOpen } = useSidebar();
  const closeOnMobile = () => setOpen(false);

  function translatedHeading(heading: string): string {
    const key = GROUP_HEADING_KEYS[heading];
    return key ? t(`groups.${key}`) : heading;
  }

  function translatedLabel(label: string): string {
    // Lives under "common" (shared with command-palette.tsx's identical
    // special case) rather than sidebar.items, since Create Anything is
    // also referenced by that non-sidebar name elsewhere in the app.
    if (label === "Create Anything") return tCommon("createAnything");
    const key = ITEM_LABEL_KEYS[label];
    return key ? t(`items.${key}`) : label;
  }

  // Explicit overrides only — a group with no entry here falls back to
  // defaultExpanded() below, which is pure/deterministic from pathname
  // alone, so server and client render identically on first paint. The
  // effect below then layers in localStorage + the "active group always
  // starts expanded" rule once we're on the client.
  const [expandedOverrides, setExpandedOverrides] = useState<Record<string, boolean>>({});

  useEffect(() => {
    setExpandedOverrides((prev) => {
      const next = { ...prev };
      let changed = false;

      for (const group of ALL_SIDEBAR_GROUPS) {
        if (!group.collapsible) continue;

        if (groupContainsActive(group, pathname)) {
          if (next[group.heading] !== true) {
            next[group.heading] = true;
            changed = true;
          }
          continue;
        }

        if (next[group.heading] === undefined) {
          const stored = window.localStorage.getItem(storageKey(group.heading));
          if (stored !== null) {
            next[group.heading] = stored === "true";
            changed = true;
          }
        }
      }

      return changed ? next : prev;
    });
  }, [pathname]);

  function toggleGroup(group: SidebarGroupConfig) {
    if (!group.collapsible) return;
    setExpandedOverrides((prev) => {
      const current = prev[group.heading] ?? defaultExpanded(group, pathname);
      const next = !current;
      window.localStorage.setItem(storageKey(group.heading), String(next));
      return { ...prev, [group.heading]: next };
    });
  }

  function renderGroup(group: SidebarGroupConfig) {
    const expanded = group.collapsible
      ? expandedOverrides[group.heading] ?? defaultExpanded(group, pathname)
      : true;

    return (
      <div key={group.heading}>
        {group.collapsible ? (
          <button
            type="button"
            onClick={() => toggleGroup(group)}
            aria-expanded={expanded}
            className="flex w-full items-center justify-between rounded-lg px-3 pb-1.5 text-[10px] font-semibold uppercase tracking-widest text-muted transition-colors duration-150 hover:text-foreground"
          >
            <span>{translatedHeading(group.heading)}</span>
            <ChevronRight
              className={`h-3 w-3 shrink-0 transition-transform duration-200 ${
                expanded ? "rotate-90" : "rotate-0"
              }`}
              aria-hidden="true"
            />
          </button>
        ) : (
          <p className="px-3 pb-1.5 text-[10px] font-semibold uppercase tracking-widest text-muted">
            {translatedHeading(group.heading)}
          </p>
        )}

        <div
          className={`grid transition-[grid-template-rows] duration-200 ease-in-out ${
            expanded ? "grid-rows-[1fr]" : "grid-rows-[0fr]"
          }`}
        >
          <div className="min-h-0 overflow-hidden">
            <div className="space-y-0.5 pb-0.5">
              {group.items.map((item) => {
                const active = isActive(pathname, item.href);
                const Icon = item.icon;
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={closeOnMobile}
                    className={`flex min-h-[40px] items-center gap-2.5 rounded-lg border-l-2 py-2 pl-2.5 pr-3 text-sm transition-colors duration-150 ${
                      active
                        ? "border-orange-500 bg-orange-500/10 font-medium text-orange-400"
                        : "border-transparent text-muted hover:bg-panel-hover hover:text-foreground"
                    }`}
                  >
                    <Icon
                      className={`h-4 w-4 shrink-0 transition-colors duration-150 ${
                        active ? "text-orange-400" : "text-orange-500/40"
                      }`}
                      aria-hidden="true"
                    />
                    {/* "Ionexa" specifically gets a touch of extra tracking — at
                        this label's small size, a lone capital "I" can read as
                        a lowercase "l" ("lonexa"); the app's other standalone
                        brand-name renderings already lean on wider letter-
                        spacing for the same reason (see loading-state.tsx,
                        not-found.tsx). */}
                    <span
                      className={`truncate ${item.label === "Ionexa Chat" ? "tracking-wide" : ""}`}
                    >
                      {translatedLabel(item.label)}
                    </span>
                  </Link>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <>
      {open && (
        <div
          onClick={closeOnMobile}
          className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm transition-opacity duration-200 md:hidden"
          aria-hidden="true"
        />
      )}

      <aside
        className={`fixed inset-y-0 left-0 z-50 w-64 transform overflow-y-auto border-r border-border bg-panel transition-transform duration-200 ease-in-out md:sticky md:top-0 md:z-auto md:h-screen md:w-60 md:shrink-0 md:translate-x-0 ${
          open ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <div className="relative flex items-center justify-center px-4 py-3">
          <Link href={OVERVIEW_NAV_ITEM.href} onClick={closeOnMobile} className="flex items-center">
            <Logo className="h-auto w-[130px] max-w-full" />
          </Link>
          <button
            type="button"
            onClick={closeOnMobile}
            aria-label="Close menu"
            className="absolute right-3 top-3 flex h-9 w-9 items-center justify-center rounded-lg text-muted transition-colors duration-150 hover:bg-panel-hover hover:text-foreground md:hidden"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <nav className="space-y-5 p-3">{MAIN_SIDEBAR_GROUPS.map(renderGroup)}</nav>

        <div className="border-t border-border p-3">{renderGroup(SETTINGS_GROUP)}</div>
      </aside>
    </>
  );
}
