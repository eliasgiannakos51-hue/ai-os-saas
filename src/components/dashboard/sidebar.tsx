"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  NAV_ITEMS,
  CREATE_NAV_ITEM,
  OVERVIEW_NAV_ITEM,
  SETTINGS_NAV_ITEM,
} from "@/lib/modules";
import { useSidebar } from "@/components/dashboard/sidebar-context";

export function Sidebar() {
  const pathname = usePathname();
  const { open, setOpen } = useSidebar();
  const overviewActive = pathname?.startsWith(OVERVIEW_NAV_ITEM.href);
  const createActive = pathname?.startsWith(CREATE_NAV_ITEM.href);
  const settingsActive = pathname?.startsWith(SETTINGS_NAV_ITEM.href);
  const closeOnMobile = () => setOpen(false);

  return (
    <>
      {open && (
        <div
          onClick={closeOnMobile}
          className="fixed inset-0 z-40 bg-black/60 md:hidden"
          aria-hidden="true"
        />
      )}

      <aside
        className={`fixed inset-y-0 left-0 z-50 w-64 transform overflow-y-auto border-r border-border bg-panel font-mono transition-transform duration-200 ease-in-out md:relative md:z-auto md:w-56 md:shrink-0 md:translate-x-0 ${
          open ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <div className="flex items-center justify-between border-b border-border px-4 py-4">
          <p className="text-xs tracking-widest text-amber-500">AI_OS //</p>
          <button
            type="button"
            onClick={closeOnMobile}
            aria-label="Close menu"
            className="flex h-11 w-11 items-center justify-center rounded text-muted transition-colors hover:text-foreground md:hidden"
          >
            <span className="text-lg leading-none" aria-hidden="true">
              ✕
            </span>
          </button>
        </div>
        <div className="border-b border-border p-3">
          <Link
            href={OVERVIEW_NAV_ITEM.href}
            onClick={closeOnMobile}
            className={`flex min-h-[44px] items-center rounded px-3 py-2 text-sm transition-colors sm:min-h-0 ${
              overviewActive
                ? "border border-amber-800 bg-amber-950/20 text-amber-400"
                : "text-muted hover:bg-black/30 hover:text-foreground"
            }`}
          >
            overview
          </Link>
        </div>
        <div className="border-b border-border p-3">
          <Link
            href={CREATE_NAV_ITEM.href}
            onClick={closeOnMobile}
            className={`flex min-h-[44px] items-center justify-center rounded px-3 py-2 text-center text-sm font-semibold transition-colors sm:min-h-0 ${
              createActive
                ? "border border-amber-400 bg-amber-500 text-black"
                : "border border-amber-800 bg-amber-950/20 text-amber-400 hover:border-amber-500"
            }`}
          >
            + create_anything()
          </Link>
        </div>
        <nav className="space-y-1 p-3">
          {NAV_ITEMS.map((item) => {
            const active =
              item.href === "/dashboard"
                ? pathname === "/dashboard"
                : pathname?.startsWith(item.href);

            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={closeOnMobile}
                className={`flex min-h-[44px] items-center rounded px-3 py-2 text-sm transition-colors sm:min-h-0 ${
                  active
                    ? "border border-amber-800 bg-amber-950/20 text-amber-400"
                    : "text-muted hover:bg-black/30 hover:text-foreground"
                }`}
              >
                {item.label.toLowerCase()}
              </Link>
            );
          })}
        </nav>
        <div className="border-t border-border p-3">
          <Link
            href={SETTINGS_NAV_ITEM.href}
            onClick={closeOnMobile}
            className={`flex min-h-[44px] items-center rounded px-3 py-2 text-sm transition-colors sm:min-h-0 ${
              settingsActive
                ? "border border-amber-800 bg-amber-950/20 text-amber-400"
                : "text-muted hover:bg-black/30 hover:text-foreground"
            }`}
          >
            settings
          </Link>
        </div>
      </aside>
    </>
  );
}
