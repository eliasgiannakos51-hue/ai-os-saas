"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Tooltip } from "@/components/ui/tooltip";
import { displayNameFromEmail } from "@/lib/greeting";
import { ChevronRight, X } from "lucide-react";
import { OVERVIEW_NAV_ITEM } from "@/lib/modules";
import {
  ALL_SIDEBAR_GROUPS,
  MAIN_SIDEBAR_GROUPS,
  SETTINGS_GROUP,
  sidebarGroups,
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

// THE GROUP HOLDING THE CURRENT PAGE, which is the one that must never
// be left shut — landing on a page whose group is collapsed shows a nav
// that does not say where you are.
//
// Reads ALL_SIDEBAR_GROUPS, not the filtered list, deliberately: the
// thirty rows the sidebar no longer draws still belong to a group, and
// arriving on one of them should still open it.
function headingContaining(pathname: string | null): string | null {
  return (
    ALL_SIDEBAR_GROUPS.find((g) => g.collapsible && groupContainsActive(g, pathname))?.heading ??
    null
  );
}

const COLLAPSED_KEY = "ionexa:sidebar-collapsed";

// ONE COLOUR FOR EVERY RESTING ICON. Only the current page gets the
// accent — V4.6 #3.
//
// What stood here was a `switch (heading)` returning purple, sky or amber
// for "Create", "My Business" and "Insights", above a comment claiming
// "one resting tint per sidebar section". Not one of those three headings
// had existed in lib/sidebar-nav.ts since the rename that made it
// Workspace / Build / Tracking / Business / Strategy / Operations, so
// every group fell through to `default` and the whole nav was already a
// single emerald. The comment described a behaviour the code could not
// produce, and it read as deliberate, which is why it survived.
//
// The behaviour it accidentally had is the one the brief asks for, so it
// is now stated as a constant rather than left to a dead branch: a
// function of the heading could go back to disagreeing with the config,
// a constant cannot.
const RESTING_ICON = "text-emerald-400/50";

export function Sidebar({
  email = "",
  planName = "",
  isOwner = false,
}: {
  email?: string;
  planName?: string;
  /** Owner-only nav items are removed for everybody else — see
   *  lib/sidebar-nav.ts's `ownerOnly`. Defaults to false, so a caller
   *  that forgets to pass it hides too much rather than too little. */
  isOwner?: boolean;
}) {
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

  // EVERYTHING OPEN BY DEFAULT — V4.6 #3.
  //
  // This was an accordion: at most one collapsible group open at a time.
  // That was the right answer to eight groups and forty-five rows, where
  // opening two of them at once pushed the rest off a 768px screen. It is
  // the wrong answer to four groups and sixteen rows, which fit at both
  // measured heights — and it was costing exactly what the brief asked
  // to buy. Measured on the real page at 1920x1080 and 1366x768: seven of
  // fifteen rows were painted on arrival, because two of the four groups
  // were shut. The whole point of cutting the sidebar to fifteen rows is
  // that fifteen rows can be seen at once.
  //
  // So the state is now the set of groups the user has DELIBERATELY shut,
  // which is empty by default. Empty is also a constant, so the server
  // and the first client paint agree without an effect having to run —
  // the property the old `undefined` sentinel existed to preserve, kept
  // for free.
  const [collapsed, setCollapsed] = useState<Set<string>>(() => new Set());

  const router = useRouter();
  /** Routes already asked for, so a pointer sweeping down the sidebar
   *  cannot fire the same prefetch a dozen times. */
  const warmed = useRef<Set<string>>(new Set());
  const warm = useCallback(
    (href: string) => {
      if (warmed.current.has(href)) return;
      warmed.current.add(href);
      router.prefetch(href);
    },
    [router]
  );

  // Restores what the user shut, then re-opens whichever group holds the
  // page they are on — a group cannot stay collapsed over the current
  // page, whatever was stored.
  useEffect(() => {
    let stored: string[] = [];
    try {
      stored = JSON.parse(window.localStorage.getItem(COLLAPSED_KEY) ?? "[]");
    } catch {
      // A hand-edited or half-written value is not worth a broken nav.
      stored = [];
    }
    const next = new Set(Array.isArray(stored) ? stored.filter((h) => typeof h === "string") : []);
    const active = headingContaining(pathname);
    if (active) next.delete(active);
    setCollapsed(next);
  }, [pathname]);

  function toggleGroup(group: SidebarGroupConfig) {
    if (!group.collapsible) return;
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(group.heading)) next.delete(group.heading);
      else next.add(group.heading);
      try {
        window.localStorage.setItem(COLLAPSED_KEY, JSON.stringify([...next]));
      } catch {
        // Private mode, or storage full. Losing the preference is fine;
        // throwing inside a click handler is not.
      }
      return next;
    });
  }

  function renderGroup(group: SidebarGroupConfig) {
    const expanded = group.collapsible ? !collapsed.has(group.heading) : true;

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
              {group.items.map((item) => renderItem(item))}
            </div>
          </div>
        </div>
      </div>
    );
  }

  // One renderer for every nav row.
  //
  // It used to take a third argument, `prominent`, whose comment said it
  // "gives the three daily entry points their visual weight over the
  // twenty-odd module links" — and it had exactly one call site, which
  // never passed it. There were no pinned rows and no prominent ones; the
  // parameter defaulted to false forever, and the two style branches it
  // guarded were unreachable. The five daily entry points now get their
  // weight from being the first group and never collapsing, which is a
  // property of the config rather than of a flag nobody sets.
  function renderItem(item: SidebarItem) {
    const active = isActive(pathname, item.href);
    const Icon = item.icon;
    const hint = item.hintKey ? t(`hints.${item.hintKey}`) : undefined;

    return (
                  <Tooltip key={item.href} content={hint} side="right">
                  <Link
                    href={item.href}
                    onClick={closeOnMobile}
                    // WARM THE ROUTE THE POINTER IS HEADING FOR.
                    //
                    // Every dashboard route is force-dynamic, so Next's
                    // default prefetch fetches only the loading boundary —
                    // the page itself is still a full server round trip
                    // AFTER the click, and that round trip is inside the
                    // time the user experiences as "the transition". A
                    // pointer arriving on a link is a few hundred
                    // milliseconds of warning; spending them on the fetch
                    // is what turns a click into an instant one.
                    //
                    // Not prefetch on ALL of them at render time: there are
                    // twenty-odd links in this sidebar, and prefetching
                    // every one would mean twenty-odd dynamic page renders
                    // per visit. One, for the link actually being
                    // approached, is the difference.
                    //
                    // Focus and touch get the same treatment, because a
                    // keyboard or a phone never produces a hover.
                    onMouseEnter={() => warm(item.href)}
                    onFocus={() => warm(item.href)}
                    onTouchStart={() => warm(item.href)}
                    // nav-item draws the active highlight and the leading
                    // rail as pseudo-elements so both can animate; the
                    // look is unchanged, it just slides in now.
                    data-active={active}
                    className={`nav-item group relative flex min-h-[44px] items-center gap-2.5 rounded-xl py-2 pl-2.5 pr-3 text-sm transition-colors duration-200 ${
                      active
                        ? "font-semibold text-orange-200"
                        : "text-muted hover:bg-white/[0.045] hover:text-foreground hover:shadow-[inset_0_0_0_1px_rgba(249,115,22,0.18)]"
                    }`}
                  >
                    <Icon
                      className={`icon-bounce h-4 w-4 shrink-0 ${
                        active
                          ? "text-orange-300 drop-shadow-[0_0_6px_rgba(249,115,22,0.8)]"
                          : `${RESTING_ICON} group-hover:text-orange-300`
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

        <nav className="space-y-4 p-3">
          {sidebarGroups(MAIN_SIDEBAR_GROUPS, isOwner).map(renderGroup)}
        </nav>

        <div className="border-t border-white/[0.07] p-3">
            {sidebarGroups([SETTINGS_GROUP], isOwner).map(renderGroup)}
          </div>

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
