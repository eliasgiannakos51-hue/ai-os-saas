/**
 * The three shapes a per-record action (Ask AI, Link to, Delete) can take.
 *
 * They're the same action wherever they appear, so they stay the same
 * component — only the chrome changes with where it's rendered:
 *
 *   icon      the bare 32px icon button (legacy inline placements)
 *   menuItem  a labelled full-width row inside a card's "..." menu
 *   action    a labelled bordered button in a DetailPanel's footer row
 */
export type RecordActionVariant = "icon" | "menuItem" | "action";

export function recordActionClasses(
  variant: RecordActionVariant,
  tone: "neutral" | "destructive" = "neutral"
): string {
  const destructive = tone === "destructive";

  if (variant === "menuItem") {
    return `flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-xs font-medium transition-colors duration-150 disabled:cursor-not-allowed disabled:opacity-40 ${
      destructive
        ? "text-red-400 hover:bg-red-500/10"
        : "text-foreground hover:bg-panel-hover hover:text-orange-400"
    }`;
  }

  if (variant === "action") {
    return `inline-flex min-h-[40px] shrink-0 items-center gap-1.5 rounded-lg border border-border px-3 py-2 text-xs font-medium transition-colors duration-150 disabled:cursor-not-allowed disabled:opacity-40 sm:min-h-0 ${
      destructive
        ? "text-red-400 hover:border-red-500/60 hover:bg-red-500/10"
        : "text-foreground hover:border-orange-500 hover:text-orange-400"
    }`;
  }

  return `flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-muted transition-colors duration-150 disabled:opacity-50 ${
    destructive ? "hover:bg-red-500/10 hover:text-red-400" : "hover:bg-orange-500/10 hover:text-orange-400"
  }`;
}

export function recordActionIconClasses(variant: RecordActionVariant): string {
  return variant === "icon" ? "h-4 w-4" : "h-3.5 w-3.5 shrink-0";
}
