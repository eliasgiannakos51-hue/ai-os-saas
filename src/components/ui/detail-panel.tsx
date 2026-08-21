"use client";

import { useRef, type ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { moduleAccent } from "@/lib/module-colors";

export type DetailTab = {
  key: string;
  label: string;
  icon?: LucideIcon;
  /** Small count/marker rendered after the label (e.g. number of files). */
  badge?: string | number;
};

/**
 * The detail view that opens when a card is selected.
 *
 * Fixed structure, mirroring EntityCard's: a header carrying the same icon
 * tile and title the card showed, a tab strip across the top, the active
 * tab's content beneath it, and the action buttons last. Whatever the
 * surface, the buttons that change something are always in the same place
 * — the bottom — instead of being scattered through the panel the way
 * each detail view used to arrange them independently.
 *
 * State is owned by the caller (activeTab/onTabChange) because most
 * callers need to react to the tab anyway — e.g. only fetching version
 * history once the History tab is actually opened.
 */
export function DetailPanel({
  icon: Icon,
  accentSlug,
  title,
  subtitle,
  corner,
  tabs,
  activeTab,
  onTabChange,
  actions,
  children,
}: {
  icon: LucideIcon;
  accentSlug: string;
  title: string;
  subtitle?: ReactNode;
  /** Top-right slot — the star, a badge, anything non-primary. */
  corner?: ReactNode;
  tabs: DetailTab[];
  activeTab: string;
  onTabChange: (key: string) => void;
  /** The action row rendered last, after the content. */
  actions?: ReactNode;
  children: ReactNode;
}) {
  const tablistRef = useRef<HTMLDivElement>(null);

  function handleTabKeyDown(e: React.KeyboardEvent) {
    if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
    e.preventDefault();
    const current = tabs.findIndex((tab) => tab.key === activeTab);
    const next =
      e.key === "ArrowRight"
        ? (current + 1) % tabs.length
        : (current - 1 + tabs.length) % tabs.length;
    onTabChange(tabs[next].key);
    tablistRef.current
      ?.querySelectorAll<HTMLElement>("[role='tab']")
      [next]?.focus();
  }

  return (
    <section className="relative overflow-hidden rounded-2xl border border-border bg-panel">
      <header className="flex items-start justify-between gap-3 p-5 pb-4">
        <div className="flex min-w-0 items-start gap-3">
          <span
            aria-hidden="true"
            className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border ${moduleAccent(accentSlug)}`}
          >
            <Icon className="h-[18px] w-[18px]" />
          </span>
          <div className="min-w-0">
            <h2 className="truncate text-base font-semibold tracking-tight text-foreground">{title}</h2>
            {subtitle ? <div className="mt-0.5 text-xs text-muted">{subtitle}</div> : null}
          </div>
        </div>
        {corner ? <div className="flex shrink-0 items-center gap-1.5">{corner}</div> : null}
      </header>

      <div
        ref={tablistRef}
        role="tablist"
        aria-label={title}
        onKeyDown={handleTabKeyDown}
        className="flex gap-1 overflow-x-auto border-b border-border px-3"
      >
        {tabs.map((tab) => {
          const TabIcon = tab.icon;
          const active = tab.key === activeTab;
          return (
            <button
              key={tab.key}
              type="button"
              role="tab"
              id={`detail-tab-${tab.key}`}
              aria-selected={active}
              aria-controls={`detail-panel-${tab.key}`}
              tabIndex={active ? 0 : -1}
              onClick={() => onTabChange(tab.key)}
              className={`-mb-px inline-flex min-h-[44px] shrink-0 items-center gap-1.5 whitespace-nowrap border-b-2 px-3 py-2 text-xs font-medium transition-colors duration-150 ${
                active
                  ? "border-orange-500 text-orange-400"
                  : "border-transparent text-muted hover:text-foreground"
              }`}
            >
              {TabIcon && <TabIcon className="h-3.5 w-3.5" aria-hidden="true" />}
              {tab.label}
              {tab.badge !== undefined && tab.badge !== "" && (
                <span className="rounded-full bg-input px-1.5 py-0.5 text-[10px] font-semibold text-muted">
                  {tab.badge}
                </span>
              )}
            </button>
          );
        })}
      </div>

      <div
        role="tabpanel"
        id={`detail-panel-${activeTab}`}
        aria-labelledby={`detail-tab-${activeTab}`}
        className="content-fade-in p-5"
      >
        {children}
      </div>

      {actions ? (
        <footer className="flex flex-wrap items-center gap-2 border-t border-border bg-input px-5 py-3">
          {actions}
        </footer>
      ) : null}
    </section>
  );
}
