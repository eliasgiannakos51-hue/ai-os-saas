"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { MoreHorizontal } from "lucide-react";
import type { LucideIcon } from "lucide-react";

export type CardMenuAction = {
  /** Stable key — also used as the DOM id suffix for keyboard focus. */
  key: string;
  label: string;
  icon?: LucideIcon;
  onSelect: () => void;
  /** Renders in red and sorts to the bottom visually via a separator. */
  destructive?: boolean;
  disabled?: boolean;
};

/**
 * The "..." action menu pinned to the top-right of every EntityCard.
 *
 * Every card in the app used to carry its actions as a row of 3-5 bare
 * 32px icon buttons along the bottom edge, which is what made two cards
 * from different modules look like different components: the action row
 * was the most visually prominent thing on the card and its contents
 * varied per surface. Collapsing them behind one control means the card
 * body — icon, title, description, tags — is the only thing that differs,
 * which is the entire point of a shared card structure.
 *
 * Interaction contract: click or Enter/Space opens, Escape closes and
 * returns focus to the trigger, ArrowUp/ArrowDown move between items,
 * clicking anywhere outside closes. Selecting an item always closes
 * first, so an action that opens a modal doesn't leave the menu hanging
 * behind it.
 */
export function CardMenu({
  actions,
  label,
  extra,
}: {
  actions: CardMenuAction[];
  /** Accessible name, e.g. "Actions for Acme Corp". */
  label: string;
  /**
   * Escape hatch for actions that are whole components rather than a
   * callback (the delete button owns its own confirm + row-collapse
   * animation, for instance). Rendered at the bottom of the panel; the
   * callback closes the menu.
   */
  extra?: (close: () => void) => ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;

    function onPointerDown(e: MouseEvent | TouchEvent) {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    }
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.stopPropagation();
        setOpen(false);
        triggerRef.current?.focus();
        return;
      }
      if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
      const items = panelRef.current?.querySelectorAll<HTMLElement>("[data-menu-item]");
      if (!items || items.length === 0) return;
      e.preventDefault();
      const list = Array.from(items);
      const current = list.indexOf(document.activeElement as HTMLElement);
      const next =
        e.key === "ArrowDown"
          ? (current + 1) % list.length
          : (current - 1 + list.length) % list.length;
      list[next]?.focus();
    }

    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("touchstart", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("touchstart", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  if (actions.length === 0 && !extra) return null;

  return (
    <div ref={rootRef} className="relative z-[3] shrink-0">
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-label={label}
        aria-haspopup="menu"
        aria-expanded={open}
        title={label}
        // Sized to match FavoriteButton's "inline" variant exactly — the
        // two sit side by side in every card corner.
        className="flex h-8 w-8 items-center justify-center rounded-xl bg-white/[0.04] text-muted shadow-[0_0_0_1px_rgba(255,255,255,0.09)] transition-all duration-200 hover:bg-panel-hover hover:text-foreground"
      >
        <MoreHorizontal className="h-4 w-4" aria-hidden="true" />
      </button>

      {open && (
        <div
          ref={panelRef}
          role="menu"
          aria-label={label}
          // dropdown-in is the existing shared entrance animation (see
          // globals.css) — reduced-motion is already handled globally.
          className="dropdown-in absolute right-0 top-11 z-[4] min-w-[11rem] overflow-hidden rounded-xl border border-border bg-panel p-1 shadow-[0_16px_40px_-12px_rgba(0,0,0,0.7)]"
        >
          {actions.map((action) => {
            const Icon = action.icon;
            return (
              <button
                key={action.key}
                type="button"
                role="menuitem"
                data-menu-item
                disabled={action.disabled}
                onClick={() => {
                  setOpen(false);
                  action.onSelect();
                }}
                className={`flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-xs font-medium transition-colors duration-150 disabled:cursor-not-allowed disabled:opacity-40 ${
                  action.destructive
                    ? "text-red-400 hover:bg-red-500/10"
                    : "text-foreground hover:bg-panel-hover hover:text-orange-400"
                }`}
              >
                {Icon && <Icon className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />}
                {action.label}
              </button>
            );
          })}
          {extra?.(() => setOpen(false))}
        </div>
      )}
    </div>
  );
}
