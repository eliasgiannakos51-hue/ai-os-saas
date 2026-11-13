"use client";

import { useEffect, useId, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { ChevronLeft, MoreHorizontal } from "lucide-react";
import { ACTION } from "@/components/shell/tool-shell-styles";

export type MoreItem = {
  id: string;
  label: string;
  icon?: ReactNode;
  /** Pressed: the menu closes, then this runs. */
  onSelect?: () => void;
  /** A link instead — opened in a new tab (a live site). */
  href?: string;
  disabled?: boolean;
  /** Pressed: the menu shows this in its own place, with the way back (Motion's list). */
  panel?: ReactNode;
  testId?: string;
};

/**
 * THE «MORE» MENU OF THE EDITOR LAYOUT'S BAR (the switch "editor-shell").
 * The approved bar carries at most a segmented control, one tag, one
 * outlined button and ONE white button (docs/design/approved/src/common.css,
 * `.tbar`); a tool's other actions are not dropped to get there — they are
 * here, one press away (ΣΥΣΤΗΜΑ DESIGN §1: «Οι υπόλοιπες πίσω από
 * "More"»; §9: «Καμία λειτουργία δεν χάνεται»).
 *
 * A menu button (aria-haspopup="menu"), its items `menuitem`s 44px tall:
 * arrows, Home and End move between them, Esc closes and gives focus back
 * to the button, Tab and a press outside close it.
 */
export function MoreMenu({ label, backLabel, items, testId = "editor-more" }: { label: string; backLabel: string; items: MoreItem[]; testId?: string }) {
  const [open, setOpen] = useState(false);
  const [panel, setPanel] = useState<string | null>(null);
  const button = useRef<HTMLButtonElement>(null);
  const menu = useRef<HTMLDivElement>(null);
  const menuId = useId();

  function close(refocus: boolean) {
    setOpen(false);
    setPanel(null);
    if (refocus) requestAnimationFrame(() => button.current?.focus());
  }

  const entries = () => [...(menu.current?.querySelectorAll<HTMLElement>('[role^="menuitem"]:not([disabled])') ?? [])];

  useEffect(() => {
    if (!open) return;
    requestAnimationFrame(() => entries()[0]?.focus());
    const onDown = (event: PointerEvent) => {
      const target = event.target as Node;
      if (!menu.current?.contains(target) && !button.current?.contains(target)) close(false);
    };
    document.addEventListener("pointerdown", onDown);
    return () => document.removeEventListener("pointerdown", onDown);
  }, [open, panel]);

  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    const list = entries();
    const at = list.indexOf(document.activeElement as HTMLElement);
    const go = (n: number) => {
      event.preventDefault();
      list[(n + list.length) % list.length]?.focus();
    };
    if (event.key === "ArrowDown") go(at + 1);
    else if (event.key === "ArrowUp") go(at - 1);
    else if (event.key === "Home") go(0);
    else if (event.key === "End") go(list.length - 1);
    else if (event.key === "Escape") {
      event.preventDefault();
      if (panel) setPanel(null);
      else close(true);
    } else if (event.key === "Tab") close(false);
  }

  const shown = panel ? items.find((item) => item.id === panel) : null;
  const ITEM = "flex min-h-[44px] w-full items-center gap-2.5 rounded-item px-3 text-start text-sm text-body transition-colors duration-150 hover:bg-panel-hover hover:text-foreground focus-visible:bg-panel-hover disabled:cursor-not-allowed disabled:opacity-40";

  return (
    <span className="relative">
      <button
        ref={button}
        type="button"
        onClick={() => (open ? close(false) : setOpen(true))}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        aria-label={label}
        title={label}
        data-testid={testId}
        className={ACTION}
      >
        <MoreHorizontal className="h-4 w-4" aria-hidden="true" />
      </button>
      {open && (
        <div ref={menu} id={menuId} role="menu" aria-label={shown ? shown.label : label} onKeyDown={onKeyDown} data-testid={`${testId}-menu`} className="editor-menu">
          {shown ? (
            <>
              <button type="button" role="menuitem" onClick={() => setPanel(null)} className={`${ITEM} text-muted`}>
                <ChevronLeft className="h-4 w-4 shrink-0" aria-hidden="true" />
                {backLabel}
              </button>
              {shown.panel}
            </>
          ) : (
            items.map((item) =>
              item.href ? (
                <a key={item.id} role="menuitem" href={item.href} target="_blank" rel="noopener noreferrer" onClick={() => close(false)} data-testid={item.testId} className={ITEM}>
                  {item.icon}
                  {item.label}
                </a>
              ) : (
                <button
                  key={item.id}
                  type="button"
                  role="menuitem"
                  disabled={item.disabled}
                  aria-haspopup={item.panel ? "menu" : undefined}
                  data-testid={item.testId}
                  onClick={() => {
                    if (item.panel) {
                      setPanel(item.id);
                      return;
                    }
                    close(true);
                    item.onSelect?.();
                  }}
                  className={ITEM}
                >
                  {item.icon}
                  {item.label}
                </button>
              )
            )
          )}
        </div>
      )}
    </span>
  );
}
