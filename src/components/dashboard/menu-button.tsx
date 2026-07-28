"use client";

import { useSidebar } from "@/components/dashboard/sidebar-context";

export function MenuButton() {
  const { toggle } = useSidebar();

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label="Toggle menu"
      className="flex h-11 w-11 shrink-0 items-center justify-center rounded border border-border text-foreground transition-colors hover:border-amber-500 hover:text-amber-400 md:hidden"
    >
      <span className="text-lg leading-none" aria-hidden="true">
        ☰
      </span>
    </button>
  );
}
