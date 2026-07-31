// Shared translation-key lookup for lib/sidebar-nav.ts's English `heading`/
// `label` strings, used by both Sidebar and CommandPalette so their
// translated display never drifts apart. The underlying strings stay
// English (state keys, search matching); only a handful of the most
// visible items have a translation today.
// TODO: extend once messages/*.json grows a full sidebar.items entry for
// the remaining ~30 module labels.
export const GROUP_HEADING_KEYS: Record<string, string> = {
  Workspace: "workspace",
  Build: "build",
  Business: "business",
  Strategy: "strategy",
  Operations: "operations",
  Marketplace: "marketplace",
  Settings: "settings",
};

export const ITEM_LABEL_KEYS: Record<string, string> = {
  Home: "home",
  "Ionexa Chat": "chat",
  "AI Memory": "memory",
  Settings: "settings",
  Team: "team",
};
