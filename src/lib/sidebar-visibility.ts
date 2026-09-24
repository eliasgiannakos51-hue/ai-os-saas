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
   * DECLARED, BUT NOT BUILT YET — a position held open.
   *
   * The problem this solves is an ordering one, and it is not
   * hypothetical: every feature that arrived after this list was written
   * got appended to the end of whichever group it belonged to, because
   * nobody had said where it went. A row is where a person reaches for
   * it, and "wherever it landed" is not a place.
   *
   * So the future rows are here, in the order they will appear, with this
   * flag. When Music generates, the flag comes off and the row appears
   * BETWEEN Videos and nothing — not at the bottom of Make.
   *
   * IT IS NOT `hidden`, AND THE DIFFERENCE IS THE POINT. A hidden row is a
   * page that exists and is deliberately not drawn: it stays in the
   * command palette, stays on the hub at /dashboard/records, and its href
   * has to resolve. A notBuilt row has no page at all — offering it in
   * search would be offering a 404 — so `visibleGroups` strips it and both
   * surfaces built on that function never see it.
   *
   * `declaredGroups` is the one reader that keeps them: the structure gate
   * checks ORDER against the full declaration, which is what makes the
   * position a promise rather than a comment.
   */
  notBuilt?: true;
  /**
   * WITHDRAWN FROM EVERY SURFACE, WHILE THE PAGE KEEPS WORKING.
   *
   * The third state, and it is the mirror image of `notBuilt` rather than
   * a variant of `hidden`:
   *
   *   hidden    the page exists, the sidebar does not draw it, and the
   *             palette and the hub still offer it. Its href MUST resolve.
   *   notBuilt  there is no page. Nothing offers it anywhere, because
   *             offering it would be offering a 404. Its href must NOT
   *             resolve.
   *   retired   the page exists and keeps working for anyone who has the
   *             URL, and NOTHING offers it — not the sidebar, not the
   *             palette, not the hub, not the price list.
   *
   * `hidden` was the near miss and the reason this exists: it keeps the
   * row one keystroke away in the command palette, which is the opposite
   * of withdrawing a capability from the product. `notBuilt` strips the
   * right surfaces and makes a false claim — its own contract says the
   * page does not exist, and a gate reads that contract.
   *
   * THE VALUE IS THE REASON, IN WORDS, and it is checked for length so
   * that "todo" cannot pass for one. A row nobody can find needs to say
   * why it is still here, or the next reader deletes the page and takes
   * the URL with it.
   */
  retired?: string;
};

export type SidebarGroupConfig = {
  heading: string;
  items: SidebarItem[];
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
  // NOT-BUILT AND RETIRED ROWS ARE STRIPPED FIRST, for everybody
  // including the owner, and for two different reasons that land in the
  // same place. A notBuilt row has no page, so the palette and the hub —
  // both built on this function — would be offering a 404. A retired row
  // has a page that works, and offering it is offering a capability the
  // product has withdrawn; the URL still serves anyone who kept it.
  const built = groups
    .map((group) => ({
      ...group,
      items: group.items.filter((i) => !i.notBuilt && !i.retired),
    }))
    .filter((group) => group.items.length > 0);
  if (isOwner) return built;
  return built
    .map((group) => ({ ...group, items: group.items.filter((i) => !i.ownerOnly) }))
    .filter((group) => group.items.length > 0);
}

/**
 * EVERY ROW, IN ORDER, INCLUDING THE ONES THAT DO NOT EXIST YET.
 *
 * The only reader is scripts/tests/sidebar-structure.test.mjs, and it is
 * the reason the `notBuilt` positions are worth anything: the gate holds
 * the DECLARED order, so a future feature cannot arrive at the bottom of
 * its group, and collapsing a group cannot reorder one either. What is
 * DRAWN is a different question, asked separately in the same file.
 *
 * Returns the config as declared. No filtering of any kind — that is what
 * distinguishes it from the two functions above, and a version of this
 * that filtered anything would make the gate agree with the sidebar by
 * construction instead of by measurement.
 */
export function declaredGroups(groups: SidebarGroupConfig[]): SidebarGroupConfig[] {
  return groups.map((group) => ({ ...group, items: [...group.items] }));
}

/**
 * The groups the SIDEBAR draws: role-filtered, then stripped of every
 * `hidden` item, then stripped of any group left empty.
 *
 * A `retired` row never reaches here: visibleGroups strips it, so the
 * sidebar and the palette lose it together and cannot drift apart.
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
