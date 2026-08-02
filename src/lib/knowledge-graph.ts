import { CLASSIFIER_MODULES, moduleHref } from "@/lib/classifier-modules";
import { BUILD_MODULES } from "@/lib/build-modules";
import type { ModuleConfig } from "@/lib/modules";

// Every module whose records can be linked via entity_links — the 13
// classic business modules (Ideas + lib/modules.ts's MODULES) plus the 10
// Build modules (lib/build-modules.ts). Shared by the "Link to..." picker
// (components/entity-links/*, client) and by lib/entity-links.ts's
// headline resolution (server) — one registry so both sides agree on which
// tables are linkable and how to find a human-readable headline for them.
export const LINKABLE_MODULES: ModuleConfig[] = [...CLASSIFIER_MODULES, ...BUILD_MODULES];

export function getLinkableModuleByTable(table: string): ModuleConfig | undefined {
  return LINKABLE_MODULES.find((m) => m.table === table);
}

export function isLinkableTable(table: string): boolean {
  return LINKABLE_MODULES.some((m) => m.table === table);
}

export { moduleHref };
