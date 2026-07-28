"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { NAV_ITEMS, CREATE_NAV_ITEM } from "@/lib/modules";

export function Sidebar() {
  const pathname = usePathname();
  const createActive = pathname?.startsWith(CREATE_NAV_ITEM.href);

  return (
    <aside className="w-56 shrink-0 border-r border-border bg-panel font-mono">
      <div className="border-b border-border px-4 py-4">
        <p className="text-xs tracking-widest text-amber-500">AI_OS //</p>
      </div>
      <div className="border-b border-border p-3">
        <Link
          href={CREATE_NAV_ITEM.href}
          className={`block rounded px-3 py-2 text-center text-sm font-semibold transition-colors ${
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
              className={`block rounded px-3 py-2 text-sm transition-colors ${
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
    </aside>
  );
}
