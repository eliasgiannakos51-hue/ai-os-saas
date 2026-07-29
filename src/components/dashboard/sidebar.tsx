"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { OVERVIEW_NAV_ITEM, CREATE_NAV_ITEM, SETTINGS_NAV_ITEM } from "@/lib/modules";
import { useSidebar } from "@/components/dashboard/sidebar-context";

// Sidebar-only grouping + label overrides. Routes are the single source of
// truth from lib/modules.ts (MODULES/NAV_ITEMS) — this just changes how
// links are grouped and labeled here, so renaming a group heading or a
// label below never touches a URL, a page title, or any other consumer of
// MODULES (overview cards, export-data, the create-anything classifier).
const SIDEBAR_GROUPS: { heading: string; items: { href: string; label: string }[] }[] = [
  {
    heading: "Workspace",
    items: [
      { href: OVERVIEW_NAV_ITEM.href, label: "Home" },
      { href: "/dashboard", label: "Ideas" },
    ],
  },
  {
    heading: "Business",
    items: [
      { href: "/dashboard/analytics", label: "Analytics" },
      { href: "/dashboard/finance", label: "Finance" },
      { href: "/dashboard/content", label: "Marketing" },
      { href: "/dashboard/sales", label: "CRM" },
      { href: "/dashboard/products", label: "Products" },
      { href: "/dashboard/research", label: "Knowledge" },
      { href: "/dashboard/learning", label: "Learning" },
    ],
  },
  {
    heading: "Strategy",
    items: [
      { href: "/dashboard/competitors", label: "Competitors" },
      { href: "/dashboard/decisions", label: "Decisions" },
      { href: "/dashboard/feedback", label: "Feedback" },
    ],
  },
  {
    heading: "Operations",
    items: [
      { href: "/dashboard/trading", label: "Trading" },
      { href: "/dashboard/automation", label: "Automation" },
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
  const createActive = isActive(pathname, CREATE_NAV_ITEM.href);
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
        className={`fixed inset-y-0 left-0 z-50 w-64 transform overflow-y-auto border-r border-border bg-panel font-mono transition-transform duration-200 ease-in-out md:relative md:z-auto md:w-56 md:shrink-0 md:translate-x-0 ${
          open ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <div className="flex items-center justify-between border-b border-border px-4 py-4">
          <p className="text-xs tracking-widest text-amber-500">Nexa AI //</p>
          <button
            type="button"
            onClick={closeOnMobile}
            aria-label="Close menu"
            className="flex h-11 w-11 items-center justify-center rounded text-muted transition-colors duration-150 hover:text-foreground md:hidden"
          >
            <span className="text-lg leading-none" aria-hidden="true">
              ✕
            </span>
          </button>
        </div>

        <div className="border-b border-border p-3">
          <Link
            href={CREATE_NAV_ITEM.href}
            onClick={closeOnMobile}
            className={`flex min-h-[44px] items-center justify-center rounded px-3 py-2 text-center text-sm font-semibold transition-all duration-200 sm:min-h-0 ${
              createActive
                ? "border border-amber-400 bg-amber-500 text-black shadow-[0_0_16px_rgba(245,158,11,0.35)]"
                : "border border-amber-800 bg-amber-950/20 text-amber-400 hover:border-amber-500 hover:shadow-[0_0_12px_rgba(245,158,11,0.25)]"
            }`}
          >
            + create_anything()
          </Link>
        </div>

        <nav className="space-y-4 p-3">
          {SIDEBAR_GROUPS.map((group) => (
            <div key={group.heading}>
              <p className="px-3 pb-1 text-[10px] font-semibold uppercase tracking-widest text-muted/70">
                {group.heading}
              </p>
              <div className="space-y-1">
                {group.items.map((item) => {
                  const active = isActive(pathname, item.href);
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      onClick={closeOnMobile}
                      className={`flex min-h-[44px] items-center rounded border-l-2 py-2 text-sm transition-colors duration-150 sm:min-h-0 ${
                        active
                          ? "border-amber-500 bg-amber-950/25 pl-[10px] pr-3 font-medium text-amber-400"
                          : "border-transparent px-3 text-muted hover:bg-black/30 hover:text-foreground"
                      }`}
                    >
                      {item.label.toLowerCase()}
                    </Link>
                  );
                })}
              </div>
            </div>
          ))}
        </nav>

        <div className="border-t border-border p-3">
          <p className="px-3 pb-1 text-[10px] font-semibold uppercase tracking-widest text-muted/70">
            Settings
          </p>
          <Link
            href={SETTINGS_NAV_ITEM.href}
            onClick={closeOnMobile}
            className={`flex min-h-[44px] items-center rounded border-l-2 py-2 text-sm transition-colors duration-150 sm:min-h-0 ${
              settingsActive
                ? "border-amber-500 bg-amber-950/25 pl-[10px] pr-3 font-medium text-amber-400"
                : "border-transparent px-3 text-muted hover:bg-black/30 hover:text-foreground"
            }`}
          >
            settings
          </Link>
        </div>
      </aside>
    </>
  );
}
