/**
 * A PAGE KNOWN BY ITS TOOL'S NAME, NOT BY THE SIDEBAR ROW'S.
 *
 * /dashboard/images is the Image tool — four pictures, one changed with
 * words, the largest size downloaded (app/dashboard/images/page.tsx draws
 * components/images/image-shell.tsx). Its sidebar row is still the older
 * «Ιδέες για εικόνες» (sidebar.items.images, hidden: true in
 * lib/sidebar-nav.ts), so the ⌘K menu, the records hub and the page's tab
 * read the tool's name from here instead. Until 2026-10-23 this applied
 * only to whom the switch "image-studio" was on for (the owner opened it
 * to everybody and the switch is gone), so the lookup took the list of
 * hrefs the switch was on for; now it is unconditional.
 *
 * Each entry names the sidebar keys the name and the hint come from, under
 * `sidebar.items` and `sidebar.hints`, so the tab, the ⌘K menu and the
 * records hub stay one string per language.
 * scripts/tests/image-studio.test.mjs holds the entry and its readers; in a
 * browser: scripts/tests/image-studio-edges.prodtest.mjs.
 */
export type ToolName = { href: string; labelKey: "imageTool"; hintKey: "imageTool" };

export const TOOL_NAMES: readonly ToolName[] = [
  { href: "/dashboard/images", labelKey: "imageTool", hintKey: "imageTool" },
];

/** The entry for this page, or null when its name is the sidebar row's own. */
export function toolName(href: string): ToolName | null {
  return TOOL_NAMES.find((s) => s.href === href) ?? null;
}
