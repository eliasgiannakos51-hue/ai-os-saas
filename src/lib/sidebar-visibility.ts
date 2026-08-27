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
};

export type SidebarGroupConfig = {
  heading: string;
  items: SidebarItem[];
  // Workspace holds the core always-visible nav (Home, Ionexa Chat, AI
  // Memory) and is never collapsed — every other group can be toggled.
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
