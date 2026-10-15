/**
 * A PAGE WHOSE NAME FOLLOWS A SWITCH.
 *
 * /dashboard/images is two different things depending on who opens it.
 * Where the switch "image-studio" is on (lib/flags/flags.ts), it is the
 * Image tool — four pictures, one changed with words, the largest size
 * downloaded (app/dashboard/images/page.tsx draws components/images/
 * image-shell.tsx). Where it is off, it is the old ideas list, under its
 * own name «Ιδέες για εικόνες» (sidebar.items.images), with the hint that
 * says it makes nothing. Until 2026-10-08 every menu read only the second
 * name, so a person with the tool saw the tab and the ⌘K menu call it the
 * list that «does not generate them».
 *
 * Each entry names the switch and the sidebar keys the name and the hint
 * come from while it is on. The keys are under `sidebar.items` and
 * `sidebar.hints`, so the tab, the ⌘K menu and the records hub stay one
 * string per language. Who it is on for is decided on the server
 * (lib/nav/switched-on.ts) and handed down as a list of hrefs.
 *
 * `flag` is a plain string so that this file, which the command palette
 * carries to the browser, imports nothing from lib/flags/flags.ts (it
 * reads the database); a name that is not a switch is never "on"
 * (isFlagKey in lib/nav/switched-on.ts), and
 * scripts/tests/image-studio.test.mjs holds that this one is. In a
 * browser: scripts/tests/image-studio-edges.prodtest.mjs.
 */
export type SwitchedName = { href: string; flag: string; labelKey: "imageTool"; hintKey: "imageTool" };

export const SWITCHED_NAMES: readonly SwitchedName[] = [
  { href: "/dashboard/images", flag: "image-studio", labelKey: "imageTool", hintKey: "imageTool" },
];

/** The entry for this page when its switch is on for the person reading, or null. */
export function switchedName(href: string, switchedOn: readonly string[]): SwitchedName | null {
  if (!switchedOn.includes(href)) return null;
  return SWITCHED_NAMES.find((s) => s.href === href) ?? null;
}
