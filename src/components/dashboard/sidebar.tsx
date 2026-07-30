"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { X } from "lucide-react";
import { OVERVIEW_NAV_ITEM, CREATE_NAV_ITEM, SETTINGS_NAV_ITEM } from "@/lib/modules";
import { MODULE_ICONS, OVERVIEW_ICON, CREATE_ICON, SETTINGS_ICON } from "@/lib/module-icons";
import { useSidebar } from "@/components/dashboard/sidebar-context";
import type { LucideIcon } from "lucide-react";

// Sidebar-only grouping + label overrides. Routes are the single source of
// truth from lib/modules.ts (MODULES/NAV_ITEMS) — this just changes how
// links are grouped, labeled, and iconified here, so renaming a group
// heading or a label below never touches a URL, a page title, or any other
// consumer of MODULES (overview cards, export-data, the create classifier).
type SidebarItem = { href: string; label: string; icon: LucideIcon };

const SIDEBAR_GROUPS: { heading: string; items: SidebarItem[] }[] = [
  {
    heading: "Workspace",
    items: [
      { href: OVERVIEW_NAV_ITEM.href, label: "Home", icon: OVERVIEW_ICON },
      { href: CREATE_NAV_ITEM.href, label: "AI Assistant", icon: CREATE_ICON },
    ],
  },
  {
    heading: "Business",
    items: [
      { href: "/dashboard/analytics", label: "Analytics", icon: MODULE_ICONS.analytics },
      { href: "/dashboard/finance", label: "Finance", icon: MODULE_ICONS.finance },
      { href: "/dashboard/content", label: "Marketing", icon: MODULE_ICONS.content },
      { href: "/dashboard/sales", label: "CRM", icon: MODULE_ICONS.sales },
      { href: "/dashboard/products", label: "Products", icon: MODULE_ICONS.products },
      { href: "/dashboard/research", label: "Knowledge", icon: MODULE_ICONS.research },
      { href: "/dashboard/learning", label: "Learning", icon: MODULE_ICONS.learning },
    ],
  },
  {
    heading: "Strategy",
    items: [
      { href: "/dashboard", label: "Ideas", icon: MODULE_ICONS.ideas },
      { href: "/dashboard/competitors", label: "Competitors", icon: MODULE_ICONS.competitors },
      { href: "/dashboard/decisions", label: "Decisions", icon: MODULE_ICONS.decisions },
      { href: "/dashboard/feedback", label: "Feedback", icon: MODULE_ICONS.feedback },
    ],
  },
  {
    heading: "Operations",
    items: [
      { href: "/dashboard/trading", label: "Trading", icon: MODULE_ICONS.trading },
      { href: "/dashboard/automation", label: "Automation", icon: MODULE_ICONS.automation },
    ],
  },
];

function isActive(pathname: string | null, href: string) {
  if (href === "/dashboard") return pathname === "/dashboard";
  return pathname?.startsWith(href) ?? false;
}

export function Sidebar() {
  const pathname = usePathname();
  const { open, setOpen } = useSidebar();
  const settingsActive = isActive(pathname, SETTINGS_NAV_ITEM.href);
  const closeOnMobile = () => setOpen(false);

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
        <div className="flex items-center justify-end px-3 py-3 md:hidden">
          <button
            type="button"
            onClick={closeOnMobile}
            aria-label="Close menu"
            className="flex h-9 w-9 items-center justify-center rounded-lg text-muted transition-colors duration-150 hover:bg-panel-hover hover:text-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <nav className="space-y-5 p-3">
          {SIDEBAR_GROUPS.map((group) => (
            <div key={group.heading}>
              <p className="px-3 pb-1.5 text-[10px] font-semibold uppercase tracking-widest text-muted/70">
                {group.heading}
              </p>
              <div className="space-y-0.5">
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
                      <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
                      <span className="truncate">{item.label}</span>
                    </Link>
                  );
                })}
              </div>
            </div>
          ))}
        </nav>

        <div className="border-t border-border p-3">
          <p className="px-3 pb-1.5 text-[10px] font-semibold uppercase tracking-widest text-muted/70">
            Settings
          </p>
          <Link
            href={SETTINGS_NAV_ITEM.href}
            onClick={closeOnMobile}
            className={`flex min-h-[40px] items-center gap-2.5 rounded-lg border-l-2 py-2 pl-2.5 pr-3 text-sm transition-colors duration-150 ${
              settingsActive
                ? "border-orange-500 bg-orange-500/10 font-medium text-orange-400"
                : "border-transparent text-muted hover:bg-panel-hover hover:text-foreground"
            }`}
          >
            <SETTINGS_ICON className="h-4 w-4 shrink-0" aria-hidden="true" />
            <span>Settings</span>
          </Link>
        </div>
      </aside>
    </>
  );
}
