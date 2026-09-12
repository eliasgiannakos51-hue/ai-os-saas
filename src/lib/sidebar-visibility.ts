import type { LucideIcon } from "lucide-react";

// THE SHAPES AND THE ROLE FILTER, WITH NO ICONS IN THEM.
//
// Split out of lib/sidebar-nav.ts, which imports forty icons from
// lucide-react and therefore cannot be loaded by the gates: scripts/tests
// refuse external node_modules imports on purpose, so a check that wanted
// to run this filter could only read it as text and hope. A rule about
// who sees which page deserves to be executed by its test, not described
// to it.

export type SidebarItem = {
  href: string;
  label: string;
  icon: LucideIcon;
  /** i18n key under sidebar.hints.<hintKey> — the tooltip on hover. */
  hintKey?: string;
  /**
   * Hidden from anybody who is not the account owner.
   *
   * THE NAV HAD NO ROLE AT ALL, and one owner-only page was in it. The
   * Financial Dashboard sat under Business as "Finance", and its first
   * line is `if (!isAdminEmail(user.email)) notFound()` — so every
   * ordinary user who pressed it got a 404 from the main navigation.
   *
   * The other three owner-only pages (Costs, Model routing, System
   * Health) were never listed in the nav, which is why nobody had noticed
   * it could not express this. An absence is not a rule: the day one of
   * them is added, this flag is what stops it happening again, and
   * scripts/tests/route-shadowing.test.mjs fails the build if a nav item
   * points at a page that refuses non-owners without carrying it.
   */
  ownerOnly?: true;
  /**
   * In the config, but NOT drawn in the sidebar.
   *
   * V4.6 #3. The sidebar had eight groups and forty-five links, which is
   * not a navigation aid — it is a directory, and a directory is what a
   * user scrolls past on the way to the four things they came for.
   *
   * The obvious fix — delete the entries — is the wrong one, because the
   * command palette is built from THIS SAME LIST (see
   * command-palette.tsx, which flattens `visibleGroups`). Deleting an
   * item to tidy the sidebar would also delete it from search, which is
   * the opposite of making it reachable.
   *
   * So the item stays here, keeps its owner-only flag, keeps its
   * translation, keeps its place in the palette, and is additionally
   * listed on the hub page at /dashboard/records — it simply is not one
   * of the sixteen rows drawn down the left. `sidebarGroups()` is the
   * only reader of this flag; `visibleGroups()` deliberately ignores it,
   * so search and the hub still see everything.
   */
  hidden?: true;
  /**
   * DECLARED, AND DELIBERATELY NOT DRAWN.
   *
   * A position held for something that does not exist yet: Images,
   * Videos and Music under Make; a browser and a desktop agent under
   * Run; Meetings under Organise. Six rows, each sitting exactly where
   * it will appear the day it works.
   *
   * WHY DECLARE A ROW THAT CANNOT BE CLICKED. Because the ALTERNATIVE
   * is deciding the position on the day the feature lands, which is the
   * day the person deciding is thinking about the feature rather than
   * about the nav — and that is how "Images" ends up under Make next to
   * five things that generate, while being a form for typing notes
   * into. The position is a navigation decision and it is made here,
   * once, in the open.
   *
   * NOTHING RENDERS IT. `sidebarGroups()` drops it, and so does
   * `visibleGroups()` — which is the part that matters, because
   * `visibleGroups` feeds the command palette and the hub at
   * /dashboard/records. A row that is searchable and not clickable is
   * worse than no row: it is a promise with a 404 behind it. The
   * `hidden` flag deliberately does NOT behave this way; the two mean
   * different things and are filtered in different places.
   *
   * The route must not exist. scripts/tests/sidebar-collapse.test.mjs
   * fails the build if a notBuilt row's href resolves to a real page —
   * which is the check that makes the flag come OFF the day the page
   * lands, rather than leaving a working feature invisible.
   */
  notBuilt?: true;
};

export type SidebarGroupConfig = {
  heading: string;
  items: SidebarItem[];
  // "Daily" holds the five things somebody opens the app to do and is
  // never collapsed — every other group can be toggled.
  collapsible: boolean;
};

/**
 * The groups this person may see, with owner-only items removed and any
 * group left empty dropped.
 *
 * ONE FUNCTION, BOTH SURFACES. The sidebar and the command palette are
 * built from the same config precisely so they cannot drift — and a
 * filter applied in the sidebar alone would put every hidden page back
 * one keystroke away, which is not hiding it, only moving it.
 *
 * Returns new objects rather than mutating: the config is a module-level
 * constant shared by both surfaces and by the gates.
 */
export function visibleGroups(
  groups: SidebarGroupConfig[],
  isOwner: boolean,
): SidebarGroupConfig[] {
  // NOT-BUILT ROWS ARE DROPPED HERE, BEFORE THE OWNER SHORT-CIRCUIT, and
  // that order is the whole point: the owner is not exempt from a route
  // that does not exist. Returning `groups` unchanged for an owner would
  // have put six dead links in the owner's own command palette.
  const real = groups
    .map((group) => ({ ...group, items: group.items.filter((i) => !i.notBuilt) }))
    .filter((group) => group.items.length > 0);
  if (isOwner) return real;
  return real
    .map((group) => ({ ...group, items: group.items.filter((i) => !i.ownerOnly) }))
    .filter((group) => group.items.length > 0);
}

/**
 * The groups the SIDEBAR draws: role-filtered, then stripped of every
 * `hidden` item, then stripped of any group left empty.
 *
 * TWO FILTERS, NOT ONE, AND THE ORDER MATTERS. Role first, so an
 * owner-only item cannot be revealed by being un-hidden; `hidden` second,
 * so tidying the sidebar can never widen who sees what. Composed from
 * `visibleGroups` rather than reimplementing it, so there is exactly one
 * place that knows what `ownerOnly` means.
 *
 * The command palette calls `visibleGroups` instead, on purpose: an item
 * kept out of the sidebar is still searchable, and still owner-filtered.
 */
export function sidebarGroups(
  groups: SidebarGroupConfig[],
  isOwner: boolean,
): SidebarGroupConfig[] {
  return visibleGroups(groups, isOwner)
    .map((group) => ({ ...group, items: group.items.filter((i) => !i.hidden) }))
    .filter((group) => group.items.length > 0);
}

/**
 * IS THIS ROW THE PAGE WE ARE ON?
 *
 * Segment-boundary match, not a raw prefix — otherwise "/dashboard/
 * trading" also matches "/dashboard/trading-workflow", and two rows
 * light up at once.
 */
export function isActiveHref(pathname: string | null, href: string): boolean {
  if (href === "/dashboard") return pathname === "/dashboard";
  if (!pathname) return false;
  return pathname === href || pathname.startsWith(`${href}/`);
}

/**
 * The collapsible group holding `pathname`, or null.
 *
 * Reads the FULL config, not the filtered one, on purpose: the rows the
 * sidebar no longer draws still belong to a group, and arriving on one
 * of them should still open it.
 */
export function headingContaining(
  groups: SidebarGroupConfig[],
  pathname: string | null,
): string | null {
  return (
    groups.find(
      (g) => g.collapsible && g.items.some((item) => isActiveHref(pathname, item.href)),
    )?.heading ?? null
  );
}

/**
 * WHICH GROUPS ARE OPEN ON A FRESH LOAD: exactly the one holding the
 * current page, and nothing else.
 *
 * PURE, AND HERE RATHER THAN INSIDE THE COMPONENT, so the rule can be
 * EXECUTED by a gate against every route in the product instead of being
 * matched as text in a .tsx a gate cannot import. A check that reads
 * `useState(() => new Set(...))` and calls that proof is measuring the
 * shape of the code, not the behaviour — the distinction shapes.md files
 * as #15.
 */
export function initialExpandedGroups(
  groups: SidebarGroupConfig[],
  pathname: string | null,
): Set<string> {
  const active = headingContaining(groups, pathname);
  return new Set(active ? [active] : []);
}

/**
 * WHAT A NAVIGATION DOES: opens the group you land in, and touches
 * nothing else.
 *
 * Returns the SAME Set when nothing changes. React state set to a new
 * object with identical contents is still a re-render, and this runs on
 * every path change — which is every click in the nav.
 */
export function expandedAfterNavigation(
  groups: SidebarGroupConfig[],
  pathname: string | null,
  current: Set<string>,
): Set<string> {
  const active = headingContaining(groups, pathname);
  if (!active || current.has(active)) return current;
  return new Set([...current, active]);
}
