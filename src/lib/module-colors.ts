// Deterministic module badge colors for cross-module views (Timeline) —
// keyed by slug so the same module always gets the same color everywhere
// this map is used, same idea as lib/module-icons.ts's MODULE_ICONS. Picked
// to stay legible against both the panel background and hover states
// already used throughout the dashboard.
export const MODULE_BADGE_COLORS: Record<string, string> = {
  ideas: "border-amber-500/40 bg-amber-500/10 text-amber-400",
  competitors: "border-rose-500/40 bg-rose-500/10 text-rose-400",
  research: "border-sky-500/40 bg-sky-500/10 text-sky-400",
  finance: "border-emerald-500/40 bg-emerald-500/10 text-emerald-400",
  learning: "border-indigo-500/40 bg-indigo-500/10 text-indigo-400",
  trading: "border-lime-500/40 bg-lime-500/10 text-lime-400",
  decisions: "border-fuchsia-500/40 bg-fuchsia-500/10 text-fuchsia-400",
  products: "border-cyan-500/40 bg-cyan-500/10 text-cyan-400",
  content: "border-pink-500/40 bg-pink-500/10 text-pink-400",
  sales: "border-teal-500/40 bg-teal-500/10 text-teal-400",
  feedback: "border-violet-500/40 bg-violet-500/10 text-violet-400",
  analytics: "border-blue-500/40 bg-blue-500/10 text-blue-400",
  automation: "border-orange-500/40 bg-orange-500/10 text-orange-400",
  agents: "border-purple-500/40 bg-purple-500/10 text-purple-400",
  websites: "border-cyan-600/40 bg-cyan-600/10 text-cyan-300",
  apps: "border-sky-600/40 bg-sky-600/10 text-sky-300",
  images: "border-pink-600/40 bg-pink-600/10 text-pink-300",
  videos: "border-red-500/40 bg-red-500/10 text-red-400",
  coding: "border-emerald-600/40 bg-emerald-600/10 text-emerald-300",
  "data-analysis": "border-indigo-600/40 bg-indigo-600/10 text-indigo-300",
  documents: "border-slate-500/40 bg-slate-500/10 text-slate-300",
  presentations: "border-amber-600/40 bg-amber-600/10 text-amber-300",
  campaigns: "border-fuchsia-600/40 bg-fuchsia-600/10 text-fuchsia-300",
};

const FALLBACK_BADGE_COLOR = "border-border bg-input text-foreground/80";

export function moduleBadgeColor(slug: string): string {
  return MODULE_BADGE_COLORS[slug] ?? FALLBACK_BADGE_COLOR;
}
