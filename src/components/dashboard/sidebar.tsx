"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Tooltip } from "@/components/ui/tooltip";
import { displayNameFromEmail } from "@/lib/greeting";
import { ChevronRight, X } from "lucide-react";
import { OVERVIEW_NAV_ITEM, CREATE_NAV_ITEM } from "@/lib/modules";
import {
  ALL_SIDEBAR_GROUPS,
  MAIN_SIDEBAR_GROUPS,
  SETTINGS_GROUP,
  sidebarGroups,
  type SidebarGroupConfig,
  type SidebarItem,
} from "@/lib/sidebar-nav";
import {
  expandedAfterNavigation,
  initialExpandedGroups,
  isActiveHref,
} from "@/lib/sidebar-visibility";
import { useSidebar } from "@/components/dashboard/sidebar-context";
import { ThemeToggle } from "@/components/theme/theme-toggle";
import { useToast } from "@/components/toast/toast-context";
import { Logo } from "@/components/logo";
import { GROUP_HEADING_KEYS, ITEM_LABEL_KEYS } from "@/lib/sidebar-label-keys";
import { CREATE_ICON } from "@/lib/module-icons";

// THE THREE RULES THAT DECIDE WHAT IS OPEN live in
// lib/sidebar-visibility.ts, which imports no icons and no React — so
// scripts/tests/sidebar-collapse.test.mjs can RUN them against every
// route in the product rather than matching this file as text. What is
// left here is the wiring.
const isActive = (pathname: string | null, href: string) => isActiveHref(pathname, href);

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

  // ONLY THE GROUP YOU ARE IN, AND THE STATE IS NOT REMEMBERED.
  //
  // THE HISTORY, because this is the third answer and each one was right
  // for a different sidebar. It was an accordion (at most one group
  // open) when there were eight groups and forty-five rows. V4.6 #3 cut
  // it to four groups and sixteen rows, which fit, so everything was
  // opened by default and what the user SHUT was remembered in
  // localStorage. It is six groups and twenty-six rows now, and
  // everything-open is thirty-three lines — past the fold at every
  // height this product is used at.
  //
  // WHAT IS STORED: NOTHING. That is the part worth being exact about,
  // because the obvious design is to remember what the user opened, and
  // it is wrong here for a stated reason: a sidebar that restores three
  // groups somebody opened yesterday is thirty-three lines again, and it
  // is thirty-three lines on the one visit where the person has no idea
  // why. Every load starts from the same place — the group holding the
  // page you are on — and nothing carries over.
  //
  // WITHIN A SESSION IT IS ADDITIVE. Opening a second group does not
  // shut the first: this is not an accordion, and a control that undoes
  // your last action to perform the new one is a control people stop
  // using. Navigating opens the group you land in, on top of whatever
  // you already opened.
  //
  // COMPUTED IN THE INITIALISER, not in an effect, so the server render
  // and the first client render agree — `usePathname()` returns the real
  // path during SSR of a client component, so both sides compute the
  // same set and there is no hydration flash of a nav in the wrong
  // state.
  const [expanded, setExpanded] = useState<Set<string>>(() =>
    initialExpandedGroups(ALL_SIDEBAR_GROUPS, pathname)
  );

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

  // NAVIGATING OPENS THE GROUP YOU LAND IN, and opens nothing else and
  // closes nothing. A soft navigation is not a load — this is the same
  // page — so what the user opened before pressing the link is still
  // open after it.
  //
  // Returns `prev` UNCHANGED when the group is already open, rather than
  // a new Set with the same contents: setState with a fresh object is a
  // re-render, and this effect runs on every pathname change, which is
  // every click in the nav.
  useEffect(() => {
    setExpanded((prev) => expandedAfterNavigation(ALL_SIDEBAR_GROUPS, pathname, prev));
  }, [pathname]);

  function toggleGroup(group: SidebarGroupConfig) {
    if (!group.collapsible) return;
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(group.heading)) next.delete(group.heading);
      else next.add(group.heading);
      return next;
    });
  }

  function renderGroup(group: SidebarGroupConfig) {
    const isOpen = group.collapsible ? expanded.has(group.heading) : true;

    // The panel's id, so the heading can point at what it opens.
    // Derived from the heading rather than generated, because it has to
    // be the same string on the server and on the client.
    const panelId = `sidebar-group-${group.heading.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`;

    return (
      <div key={group.heading}>
        {group.collapsible ? (
          <button
            type="button"
            onClick={() => toggleGroup(group)}
            aria-expanded={isOpen}
            aria-controls={panelId}
            className="flex min-h-[44px] w-full items-center justify-between rounded-lg px-3 pb-1.5 text-[10px] font-semibold uppercase tracking-widest text-muted transition-colors duration-150 hover:text-foreground focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-orange-400"
          >
            <span>{translatedHeading(group.heading)}</span>
            <ChevronRight
              className={`h-3 w-3 shrink-0 transition-transform duration-200 ${
                isOpen ? "rotate-90" : "rotate-0"
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
          id={panelId}
          // A CLOSED GROUP IS CLOSED TO THE KEYBOARD TOO.
          //
          // The rows animate shut with grid-template-rows, so they are
          // still in the DOM at zero height — and a link at zero height
          // is still in the tab order and still read by a screen reader.
          // Without this, tabbing past a shut "See" walked through seven
          // invisible links, which is worse than not collapsing at all:
          // the sighted user sees five headings and the keyboard user
          // traverses twenty-six rows.
          //
          // aria-hidden takes the subtree out of the accessibility tree;
          // tabIndex={-1} on each row (below) takes it out of the tab
          // order. NOT the `inert` attribute, which would do both in one
          // go: React 18 does not know it as a boolean property, so
          // `inert={false}` renders the literal attribute `inert="false"`
          // — and an inert attribute is inert whatever its value, so the
          // OPEN groups would be the unreachable ones. That is a bug that
          // looks like a fix in every review and only appears at the
          // keyboard.
          aria-hidden={!isOpen}
          className={`grid transition-[grid-template-rows] duration-200 ease-in-out ${
            isOpen ? "grid-rows-[1fr]" : "grid-rows-[0fr]"
          }`}
        >
          <div className="min-h-0 overflow-hidden">
            <div className="space-y-0.5 pb-0.5">
              {group.items.map((item) => renderItem(item, isOpen))}
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
  function renderItem(item: SidebarItem, reachable = true) {
    const active = isActive(pathname, item.href);
    const Icon = item.icon;
    const hint = item.hintKey ? t(`hints.${item.hintKey}`) : undefined;

    return (
                  <Tooltip key={item.href} content={hint} side="right">
                  <Link
                    href={item.href}
                    onClick={closeOnMobile}
                    // -1 while the group is shut: the row is still in the
                    // DOM at zero height, and a zero-height link is still
                    // a tab stop. See the aria-hidden note on the panel.
                    tabIndex={reachable ? undefined : -1}
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
                    className={`nav-item group relative flex min-h-[44px] items-center gap-2.5 rounded-xl py-2 ps-2.5 pe-3 text-sm transition-colors duration-200 ${
                      active
                        ? "font-semibold text-orange-200"
                        : "text-muted hover:bg-white/[0.045] hover:text-foreground hover:shadow-[inset_0_0_0_1px_rgba(249,115,22,0.18)]"
                    }`}
                  >
                    <Icon
                      className={`icon-bounce h-4 w-4 shrink-0 ${
                        active
                          ? "text-orange-300 drop-"
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
        className={`fixed inset-y-0 start-0 z-50 w-64 transform overflow-y-auto border-e border-white/[0.07] bg-panel/80 backdrop-blur-xl transition-transform duration-200 ease-in-out md:sticky md:top-0 md:z-auto md:h-screen md:w-60 md:shrink-0 md:translate-x-0 ${
          open ? "translate-x-0" : "-translate-x-full rtl:translate-x-full md:rtl:translate-x-0"
        }`}
      >
        <div className="relative flex items-center justify-center px-4 py-3">
          <Link href={OVERVIEW_NAV_ITEM.href} onClick={closeOnMobile} className="flex items-center">
            {/* 72px, not 130px. The full logo's viewBox is 202x190 — very
                nearly square — so 130px of width was 122px of height, and
                the header block measured 146px in a 768px-tall viewport:
                more than any group of links. Measured at 72px it is 92px,
                which is 54px back, and 54px is 1.2 rows of nav. The mark
                is unchanged; only its size is. */}
            <Logo className="h-auto w-[72px] max-w-full" />
          </Link>
          <button
            type="button"
            onClick={closeOnMobile}
            aria-label={t("closeMenu")}
            className="absolute end-3 top-3 flex h-11 w-11 items-center justify-center rounded-lg text-muted transition-colors duration-150 hover:bg-panel-hover hover:text-foreground md:hidden"
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

        {/* THE THEME TOGGLE, HERE BECAUSE ON A PHONE IT IS NOWHERE ELSE.
            top-nav.tsx wraps it in `hidden sm:contents`, so below 640px
            this drawer is where it lives. Shown only where the top bar
            hides it, so desktop keeps one rather than two.

            THE LANGUAGE CONTROL WAS HERE TOO, AND IT WAS NOT FOUND. This
            block sits under sixteen nav rows and the settings group,
            which on a 390x844 phone is below the fold of the drawer: a
            person opening the menu saw a list of pages and no globe, and
            reported that the language control did not exist. Rendered
            below the fold of a scrolling drawer is not reachable. It is
            now in the top bar at every width (top-nav.tsx), which is
            visible without a scroll and without opening anything. */}
        <div className="flex items-center gap-1 border-t border-white/[0.07] p-3 sm:hidden">
          <ThemeToggle />
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
