"use client";

import { useCallback, useRef } from "react";
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
import { useSidebar } from "@/components/dashboard/sidebar-context";
import { ThemeToggle } from "@/components/theme/theme-toggle";
import { useToast } from "@/components/toast/toast-context";
import { Logo } from "@/components/logo";
import { GROUP_HEADING_KEYS, ITEM_LABEL_KEYS } from "@/lib/sidebar-label-keys";
import { CREATE_ICON } from "@/lib/module-icons";

function isActive(pathname: string | null, href: string) {
  if (href === "/dashboard") return pathname === "/dashboard";
  if (!pathname) return false;
  // Segment-boundary match, not a raw prefix — otherwise "/dashboard/trading"
  // would also light up on "/dashboard/trading-workflow" (and any other
  // href that happens to be a string prefix of a sibling route).
  return pathname === href || pathname.startsWith(`${href}/`);
}

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

  // EVERY GROUP IS OPEN, ALWAYS — and this reverses the one-open-group
  // rule of 2026-09-17 on a production report rather than a preference.
  //
  // WHAT THAT RULE DID TO THE SCREEN. It opened only the group holding
  // the current page, so five of the six headings stood over nothing.
  // Measured in a browser on the build before this change:
  //
  //     1440x900: 7 of 26 rows painted, 6 group headings
  //               Mine · Files · Finances · Sales · Trading ·
  //               Search my records · What it remembers
  //
  // All seven are the See group. Make, Ask, Run, Organise and Settings
  // were a heading and a chevron over empty space. The report that came
  // back was "the sidebar shows Run and NO rows — did a filter remove
  // Agents, Automation and Marketplace?" Nothing had. A shut group and a
  // group whose contents were filtered away look identical, and the
  // second is the one a reader assumes.
  //
  // WHAT IT COSTS TO OPEN THEM, measured rather than feared. `node
  // scripts/measure-sidebar-height.mjs`, computed from this file's own
  // classes, and section 4 of sidebar-density.prodtest.mjs, measured in
  // the browser. Both are printed on every run, so neither number needs
  // to be trusted from here.
  //
  // WHAT REPLACED THE MACHINERY. `touched`, `isExpanded`, `toggleGroup`,
  // `headingContaining`, `groupContainsActive`, the chevron, the
  // grid-template-rows animation and the aria-hidden / tabIndex pair are
  // all gone, along with `collapsible` on SidebarGroupConfig. None of
  // them had a second purpose: a flag that is false for every group is
  // the `prominent` parameter this file already deleted once.

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

  function renderGroup(group: SidebarGroupConfig) {
    // A HEADING IS ONLY DRAWN WHEN SOMETHING IS UNDER IT.
    //
    // sidebarGroups() already drops a group whose items all filter away,
    // so on the declared config this is unreachable — and it is here
    // because "unreachable today" was exactly the state of affairs while
    // five headings stood over nothing. The filter that emptied them was
    // not a filter at all, it was the collapse, and no amount of
    // correctness in sidebarGroups() could have caught it.
    //
    // This is the last line of defence and the only one inside the
    // renderer. Section 0 of scripts/tests/sidebar-density.prodtest.mjs
    // asks the same question of the SCREEN, which is the version that
    // would have caught the real thing.
    if (group.items.length === 0) return null;

    return (
      <div key={group.heading}>
        <p className="px-3 pb-1.5 text-[10px] font-semibold uppercase tracking-widest text-muted">
          {translatedHeading(group.heading)}
        </p>

        <div className="space-y-0.5 pb-0.5">
          {group.items.map((item) => renderItem(item))}
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
  // weight from being the first group, which is a property of the config
  // rather than of a flag nobody sets.
  //
  // A SECOND SUCH PARAMETER LASTED ONE ROUND. `reachable` was added with
  // the collapse to put a shut group's rows out of the tab order —
  // `tabIndex={reachable ? undefined : -1}` — and when the collapse went,
  // its only false call site went with it. Left in place it would have
  // been the same defect this paragraph is about, one round later.
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
                    {/* THE EXTRA TRACKING IS GONE, and what it was for is
                        worth keeping written down. "Ionexa" at this size
                        renders a lone capital "I" that reads as a lowercase
                        "l" — "lonexa" — so this row leaned on wider
                        letter-spacing, as app/not-found.tsx still does for
                        the standalone wordmark.
                        `item.label` is a KEY into ITEM_LABEL_KEYS and never
                        reaches the screen, so the condition matched on
                        "Ionexa Chat" while what was painted came from
                        sidebar.items.chat — and on 2026-09-11 the owner
                        renamed that to "Ask me" in all ten languages. Not
                        one of them contains "Ionexa". The class had been
                        spacing out "Ask me", "Ρώτα με" and "问我" for eight
                        days, for a capital I none of them has. */}
                    <span className="truncate">{translatedLabel(item.label)}</span>
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
