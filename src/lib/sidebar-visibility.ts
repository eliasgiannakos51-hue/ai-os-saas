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
  if (isOwner) return groups;
  return groups
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
