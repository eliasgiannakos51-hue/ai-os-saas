"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import { Tooltip } from "@/components/ui/tooltip";
import { displayNameFromEmail } from "@/lib/greeting";
import { ChevronRight, X } from "lucide-react";
import { OVERVIEW_NAV_ITEM } from "@/lib/modules";
import {
  ALL_SIDEBAR_GROUPS,
  MAIN_SIDEBAR_GROUPS,
  SETTINGS_GROUP,
  type SidebarGroupConfig,
  type SidebarItem,
} from "@/lib/sidebar-nav";
import { useSidebar } from "@/components/dashboard/sidebar-context";
import { useToast } from "@/components/toast/toast-context";
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

// Pure function of pathname alone (no localStorage read) so server and
// client agree on which group is open before hydration's effect runs.
function defaultOpenHeading(pathname: string | null): string | null {
  return (
    ALL_SIDEBAR_GROUPS.find((g) => g.collapsible && groupContainsActive(g, pathname))?.heading ??
    null
  );
}

function storageKey(heading: string) {
  return `ionexa:sidebar-group:${heading}`;
}

// One resting tint per sidebar section, so the nav reads as grouped at a
// glance instead of as one long amber list. Active items ignore this and
// go full amber — the current page should never be ambiguous.
// Returns whole Tailwind class strings (not an interpolated color name)
// so the JIT compiler can actually see them.
function groupTone(heading: string): string {
  switch (heading) {
    case "Create":
      return "text-purple-400/55";
    case "My Business":
      return "text-sky-400/55";
    case "Insights":
      return "text-amber-400/55";
    default:
      return "text-emerald-400/50";
  }
}

export function Sidebar({ email = "", planName = "" }: { email?: string; planName?: string }) {
  const pathname = usePathname();
  const t = useTranslations("sidebar");
  const tCommon = useTranslations("common");
  const { open, setOpen } = useSidebar();
  const { addToast } = useToast();
  const closeOnMobile = () => setOpen(false);

  function translatedHeading(heading: string): string {
    const key = GROUP_HEADING_KEYS[heading];
    return key ? t(`groups.${key}`) : heading;
  }

  function translatedLabel(label: string): string {
    // Lives under "common" (shared with command-palette.tsx's identical
    // special case) rather than sidebar.items, since Create Anything is
    // also referenced by that non-sidebar name elsewhere in the app.
    if (label === "Create Studio") return tCommon("createStudio");
    const key = ITEM_LABEL_KEYS[label];
    return key ? t(`items.${key}`) : label;
  }

  // Accordion: at most ONE collapsible group open at a time (Workspace is
  // always-open, excluded from this). undefined = "not yet decided on the
  // client" — renderGroup falls back to defaultOpenHeading(pathname) in
  // that case, a pure function of pathname alone, so server and client
  // render identically on first paint. The effect below then layers in
  // localStorage once we're on the client, and re-forces the active
  // page's own group open on every navigation (overriding any manually
  // collapsed state), matching the previous per-group behavior.
  const [openGroup, setOpenGroup] = useState<string | null | undefined>(undefined);

  useEffect(() => {
    const activeHeading = defaultOpenHeading(pathname);
    if (activeHeading) {
      setOpenGroup(activeHeading);
      return;
    }
    setOpenGroup((prev) => {
      if (prev !== undefined) return prev;
      const stored = window.localStorage.getItem(storageKey("__open__"));
      return stored ? stored : null;
    });
  }, [pathname]);

  function toggleGroup(group: SidebarGroupConfig) {
    if (!group.collapsible) return;
    setOpenGroup((prev) => {
      const currentlyOpen = prev ?? defaultOpenHeading(pathname);
      const next = currentlyOpen === group.heading ? null : group.heading;
      window.localStorage.setItem(storageKey("__open__"), next ?? "");
      return next;
    });
  }

  function renderGroup(group: SidebarGroupConfig) {
    const currentlyOpen = openGroup === undefined ? defaultOpenHeading(pathname) : openGroup;
    const expanded = group.collapsible ? currentlyOpen === group.heading : true;

    return (
      <div key={group.heading}>
        {group.collapsible ? (
          <button
            type="button"
            onClick={() => toggleGroup(group)}
            aria-expanded={expanded}
            className="flex min-h-[44px] w-full items-center justify-between rounded-lg px-3 pb-1.5 text-[10px] font-semibold uppercase tracking-widest text-muted transition-colors duration-150 hover:text-foreground"
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
              {group.items.map((item) => renderItem(item, groupTone(group.heading)))}
            </div>
          </div>
        </div>
      </div>
    );
  }

  // One renderer for every nav row, pinned or grouped, so the two can
  // never drift apart. `prominent` is what gives the three daily entry
  // points their visual weight over the twenty-odd module links.
  function renderItem(item: SidebarItem, tone: string, prominent = false) {
    const active = isActive(pathname, item.href);
    const Icon = item.icon;
    const hint = item.hintKey ? t(`hints.${item.hintKey}`) : undefined;

    return (
                  <Tooltip key={item.href} content={hint} side="right">
                  <Link
                    href={item.href}
                    onClick={closeOnMobile}
                    // nav-item draws the active highlight and the leading
                    // rail as pseudo-elements so both can animate; the
                    // look is unchanged, it just slides in now.
                    data-active={active}
                    className={`nav-item group relative flex items-center gap-2.5 rounded-xl transition-colors duration-200 ${
                      prominent
                        ? "min-h-[44px] py-2.5 pl-2.5 pr-3 text-[15px] font-medium"
                        : "min-h-[44px] py-2 pl-2.5 pr-3 text-sm"
                    } ${
                      active
                        ? "font-semibold text-orange-200"
                        : prominent
                          ? "text-foreground/90 hover:bg-white/[0.045] hover:text-foreground hover:shadow-[inset_0_0_0_1px_rgba(249,115,22,0.18)]"
                          : "text-muted hover:bg-white/[0.045] hover:text-foreground hover:shadow-[inset_0_0_0_1px_rgba(249,115,22,0.18)]"
                    }`}
                  >
                    <Icon
                      className={`icon-bounce shrink-0 ${prominent ? "h-[18px] w-[18px]" : "h-4 w-4"} ${
                        active
                          ? "text-orange-300 drop-shadow-[0_0_6px_rgba(249,115,22,0.8)]"
                          : `${tone} group-hover:text-orange-300`
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
                  </Tooltip>
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
        className={`fixed inset-y-0 left-0 z-50 w-64 transform overflow-y-auto border-r border-white/[0.07] bg-panel/80 backdrop-blur-xl transition-transform duration-200 ease-in-out md:sticky md:top-0 md:z-auto md:h-screen md:w-60 md:shrink-0 md:translate-x-0 ${
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
            aria-label={t("closeMenu")}
            className="absolute right-3 top-3 flex h-11 w-11 items-center justify-center rounded-lg text-muted transition-colors duration-150 hover:bg-panel-hover hover:text-foreground md:hidden"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <nav className="space-y-5 p-3">
          {MAIN_SIDEBAR_GROUPS.map(renderGroup)}
        </nav>

        <div className="border-t border-white/[0.07] p-3">{renderGroup(SETTINGS_GROUP)}</div>

        {/* Account card. Both values come from the already-loaded session
            in dashboard/layout.tsx — no extra query, and nothing is
            rendered at all if the layout couldn't supply them. */}
        {email && (
          <div className="border-t border-white/[0.07] p-3">
            <Link
              href="/dashboard/settings"
              onClick={closeOnMobile}
              className="group flex items-center gap-2.5 rounded-xl px-2 py-2 transition-colors duration-200 hover:bg-white/[0.05]"
            >
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[linear-gradient(135deg,#fbbf24_0%,#f97316_55%,#a855f7_100%)] text-sm font-bold text-black">
                {displayNameFromEmail(email).charAt(0).toUpperCase()}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[13px] font-medium text-foreground">
                  {displayNameFromEmail(email)}
                </span>
                {planName && (
                  <span className="block truncate text-[11px] text-muted">{planName}</span>
                )}
              </span>
              <ChevronRight
                className="h-3.5 w-3.5 shrink-0 text-muted transition-transform duration-200 group-hover:translate-x-0.5"
                aria-hidden="true"
              />
            </Link>
          </div>
        )}
      </aside>
    </>
  );
}
