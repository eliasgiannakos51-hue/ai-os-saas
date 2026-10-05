// Deterministic module badge colors for cross-module views (Timeline) —
// keyed by slug so the same module always gets the same color everywhere
// this map is used, same idea as lib/module-icons.ts's MODULE_ICONS. Picked
// to stay legible against both the panel background and hover states
// already used throughout the dashboard.
export const MODULE_BADGE_COLORS: Record<string, string> = {
  ideas: "border-warning/40 bg-warning/10 text-warning",
  competitors: "border-danger/40 bg-danger/10 text-danger",
  research: "border-border bg-foreground/10 text-muted",
  finance: "border-success/40 bg-success/10 text-success",
  learning: "border-border bg-foreground/10 text-muted",
  trading: "border-border bg-foreground/10 text-muted",
  decisions: "border-border bg-foreground/10 text-muted",
  products: "border-border bg-foreground/10 text-muted",
  content: "border-border bg-foreground/10 text-muted",
  sales: "border-border bg-foreground/10 text-muted",
  feedback: "border-border bg-foreground/10 text-muted",
  analytics: "border-border bg-foreground/10 text-muted",
  automation: "border-foreground/40 bg-foreground/10 text-foreground",
  agents: "border-border bg-foreground/10 text-muted",
  websites: "border-border bg-foreground/10 text-muted",
  apps: "border-border bg-foreground/10 text-muted",
  images: "border-border bg-foreground/10 text-muted",
  videos: "border-danger/40 bg-danger/10 text-danger",
  coding: "border-success/40 bg-success/10 text-success",
  "data-analysis": "border-border bg-foreground/10 text-muted",
  documents: "border-border bg-foreground/10 text-muted",
  presentations: "border-warning/40 bg-warning/10 text-warning",
  campaigns: "border-border bg-foreground/10 text-muted",
  // The three starrable-but-not-linkable surfaces (lib/favoritable.ts's
  // EXTRA_FAVORITABLE) plus Mission Control. They render EntityCards like
  // every other list now, so they need a colour for the icon tile too —
  // without an entry here they'd all fall back to the same grey.
  missionControl: "border-foreground/40 bg-foreground/10 text-foreground",
  websiteBuilder: "border-border bg-foreground/10 text-muted",
  createStudio: "border-foreground/40 bg-foreground/10 text-foreground",
};

const FALLBACK_BADGE_COLOR = "border-border bg-input text-foreground/80";

export function moduleBadgeColor(slug: string): string {
  return MODULE_BADGE_COLORS[slug] ?? FALLBACK_BADGE_COLOR;
}

/**
 * Classes for a card's icon tile — the small rounded square in the top-left
 * corner of every EntityCard (components/ui/entity-card.tsx).
 *
 * Deliberately the SAME map as the badge above rather than a second
 * palette: a module's colour is one fact about it, and the timeline badge,
 * the favorites heading and the card's icon tile all have to agree or the
 * "same module everywhere" promise breaks the moment someone adds a
 * module and updates only one of the two maps.
 */
export function moduleAccent(slug: string): string {
  return moduleBadgeColor(slug);
}
