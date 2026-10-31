/**
 * Pure style tokens shared by tool-shell.tsx's callers. Split out of
 * tool-shell.tsx itself (which also renders ChatComposer, a real,
 * heavy value import) because a file that needs only the string below
 * had no way to ask for it without dragging that render in too:
 * scripts/lib/route-graph.mjs's reachability walk marks a whole file
 * reachable the moment anything imports ANY of its named exports, type
 * or not. flow-plan.tsx imported `OPTION` alone, which is one Tailwind
 * class string, and inherited chat-composer.tsx's filled send button
 * as a "control on this page" everywhere flow-plan.tsx is now used —
 * including dashboard/projects/page.tsx (Projects Κομμάτι 6), which
 * renders neither ToolShell nor ChatComposer.
 */

/** One option under the field: a label that is pressed, or that opens a choice. */
export const OPTION = "chip-link gap-1.5";

/** A 44px icon action in the work area's top row. */
export const ACTION =
  "inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-item text-muted transition-colors duration-150 hover:bg-panel-hover hover:text-foreground";
