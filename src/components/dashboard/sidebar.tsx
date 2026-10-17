"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Code2, LayoutGrid, MessageCircle, Pin, PinOff, Settings, X } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { Tooltip } from "@/components/ui/tooltip";
import { Logo } from "@/components/logo";
import { displayNameFromEmail } from "@/lib/greeting";
import { MAIN_SIDEBAR_GROUPS, SETTINGS_GROUP, sidebarGroups, type SidebarItem } from "@/lib/sidebar-nav";
import { ITEM_LABEL_KEYS } from "@/lib/sidebar-label-keys";
import { RAIL_ROWS, SETTINGS_HREF, activeRail, type DrawnRailKey, type RailKey } from "@/lib/nav/rail";
import type { RecentAction, RecentTool } from "@/lib/nav/recent-tools";
import { useSidebar } from "@/components/dashboard/sidebar-context";
import { useToast } from "@/components/toast/toast-context";

/**
 * THE SIDEBAR — ΣΥΣΤΗΜΑ DESIGN (docs/CONTEXT.md): the same on every
 * page. Logo, Ionexa Chat, Coding, All tools, Recent tools, and
 * Settings at the bottom with the account inside it. Nothing else is
 * ever here; every tool is in All tools and ⌘K (lib/nav/rail.ts).
 *
 * NO CONVERSATIONS. A «Recent chats» section was row 7 of this list
 * until 2026-10-16, when the owner had it taken out —
 * «ΑΦΑΙΡΕΣΕ ΤΙΣ ΠΡΟΣΦΑΤΕΣ ΣΥΝΟΜΙΛΙΕΣ ΑΠΟ ΤΟ SIDEBAR». It is not
 * hidden and not behind a switch: this component is handed no
 * conversations and renders none, at any width, on any page, for any
 * account. scripts/tests/sidebar-no-chats.prodtest.mjs opens ten
 * pages on a computer and a phone and fails on one conversation
 * title.
 *
 * ONE ROW FOR THE CHAT, since 2026-10-17. «New» and «Chats» were two
 * rows for one place — start an empty conversation, list them all —
 * and both are errands you run once you are inside it. They are the
 * [◧] and «Νέα συνομιλία» of the chat's own title row now
 * (components/chat/conversation-column.tsx), and the rail names the
 * place: «Ionexa Chat».
 *
 * AND THERE IS NO «Collapse sidebar». The narrow, icons-only form is
 * what a screen under 1024px gets and the wide one what it gets above,
 * decided by CSS alone — `md:w-16 lg:w-60`, with every label
 * `md:sr-only lg:not-sr-only` so a screen reader keeps all of them at
 * every width. It was a button and a localStorage key until today; a
 * stored choice is one more thing that can be wrong on the first
 * paint, and it could disagree with the screen it was being read on.
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
// ONLY THE ROWS THIS FILE DRAWS. Typed as DrawnRailKey rather than
// RailKey so the two extra keys the phone's bottom bar uses cannot
// oblige this map to carry icons nothing here ever renders.
const RAIL_ICONS: Record<DrawnRailKey, LucideIcon> = {
  // ONE BUBBLE, FOR ONE PLACE. It was a stack while the row meant "all
  // of them"; the row is the chat itself again, and the conversations
  // are a column inside it.
  ionexaChat: MessageCircle,
  coding: Code2,
  allTools: LayoutGrid,
};

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

  const rows = RAIL_ROWS;
  const active = activeRail(
    pathname,
    list.map((r) => r.href),
    tools.map((i) => i.href),
    rows
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
        aria-current={isActive ? "page" : undefined}
        data-active={isActive}
        // NARROW BETWEEN md AND lg, WIDE ABOVE IT — and the name is in
        // the DOM at every width, only hidden from the eye in between
        // (`md:sr-only lg:not-sr-only`). That is why there is no
        // aria-label: the accessible name is the text itself, so it
        // cannot drift from what a wide screen reads.
        className={`nav-item flex min-h-[44px] flex-1 items-center gap-3 px-3 py-2 text-sm ${
          isActive ? "text-foreground" : "text-muted hover:bg-panel-hover hover:text-foreground"
        } md:justify-center md:px-0 lg:justify-start lg:px-3`}
      >
        <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
        <span className="min-w-0 break-words md:sr-only lg:not-sr-only">{label}</span>
      </Link>
    );
    return (
      <div key={href} className="group relative flex items-center">
        {/* The tooltip earns its place only where the name is hidden;
            above lg the name is already on screen beside the icon. */}
        <Tooltip content={label} side="right">
          {link}
        </Tooltip>
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
        className={`fixed inset-y-0 start-0 z-50 flex w-64 flex-col overflow-y-auto border-e border-divider bg-background transition-[transform,width] duration-200 ease-out md:sticky md:top-0 md:z-auto md:h-screen md:w-16 md:shrink-0 md:translate-x-0 lg:w-60 ${
          open ? "translate-x-0" : "-translate-x-full rtl:translate-x-full md:rtl:translate-x-0"
        }`}
      >
        <div className="flex items-center gap-2 px-3 py-4 md:justify-center md:px-0 lg:justify-start lg:px-3">
          <Link href="/dashboard/overview" onClick={closeOnMobile} className="flex min-h-[44px] items-center rounded-item px-1" aria-label="Ionexa">
            {/* Both marks are rendered and CSS picks one, so the swap
                happens at the breakpoint without a re-render and
                without a first paint that shows the wrong one. */}
            <span className="hidden md:inline lg:hidden"><Logo iconOnly px={26} /></span>
            <span className="md:hidden lg:inline"><Logo px={24} /></span>
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
          {rows.map((r) => row(r.href, t(`rail.${r.key}`), RAIL_ICONS[r.key], isRowActive(r.key)))}

          {list.length > 0 && (
            <div className="pt-5" data-testid="recent-tools">
              <p className="px-3 pb-2 text-xs text-muted md:sr-only lg:not-sr-only">{t("rail.recentTools")}</p>
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
                    (
                      <span className="absolute end-1 hidden items-center opacity-0 transition-opacity duration-150 focus-within:opacity-100 group-hover:opacity-100 md:hidden lg:flex">
                        <button
                          type="button"
                          onClick={() => act(r.pinned ? "unpin" : "pin", r.href)}
                          aria-label={t(r.pinned ? "rail.unpin" : "rail.pin", { tool: label })}
                          aria-pressed={r.pinned}
                          className="flex h-11 w-11 items-center justify-center rounded-item text-muted hover:bg-panel-hover hover:text-foreground"
                        >
                          {r.pinned ? <PinOff className="h-3.5 w-3.5" aria-hidden="true" /> : <Pin className="h-3.5 w-3.5" aria-hidden="true" />}
                        </button>
                        <button
                          type="button"
                          onClick={() => act("remove", r.href)}
                          aria-label={t("rail.remove", { tool: label })}
                          className="flex h-11 w-11 items-center justify-center rounded-item text-muted hover:bg-panel-hover hover:text-foreground"
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

          {/* NO CONVERSATIONS HERE. They were row 7 of this rail until
              2026-10-16, when the owner had them taken out —
              «ΑΦΑΙΡΕΣΕ ΤΙΣ ΠΡΟΣΦΑΤΕΣ ΣΥΝΟΜΙΛΙΕΣ ΑΠΟ ΤΟ SIDEBAR». They
              are not hidden with CSS and not behind a switch: nothing
              renders them, in any width, on any page, for any account.
              Everything they could do — open, rename, pin, move to a
              Project, delete with an Undo — is on the «Chats» page
              above (app/dashboard/chats/page.tsx), which is where the
              second row now goes. */}
        </nav>

        <div className="space-y-1 border-t border-divider px-2 py-3">
          {row(
            SETTINGS_HREF,
            t("rail.settings"),
            Settings,
            isRowActive("settings"),
            null
          )}
          {email && (
            <p className="px-3 text-xs text-muted md:sr-only lg:not-sr-only">
              <span className="block break-words text-foreground">{displayNameFromEmail(email)}</span>
              {planName && <span className="block break-words">{planName}</span>}
            </p>
          )}
          {/* NO «Collapse sidebar» BUTTON. It was here until 2026-10-17
              with a localStorage key behind it; the owner had it taken
              out and the narrow form made automatic. What it did is in
              the widths on the <aside> above — icons only between md
              and lg, the full rail beyond — so there is no state to
              store, nothing to be wrong on the first paint, and no way
              for a remembered choice to contradict the screen. */}
        </div>
      </aside>
    </>
  );
}
