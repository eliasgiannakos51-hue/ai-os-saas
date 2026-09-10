import { CLASSIFIER_MODULES, moduleHref } from "@/lib/classifier-modules";
import { BUILD_MODULES } from "@/lib/build-modules";
import { LINK_ONLY_MODULES } from "@/lib/projects/linkable-extras";
import type { LinkableModule } from "@/lib/modules";

// Every module whose records can be linked via entity_links — the 13
// classic business modules (Ideas + lib/modules.ts's MODULES) plus the 10
// Build modules (lib/build-modules.ts). Shared by the "Link to..." picker
// (components/entity-links/*, client) and by lib/entity-links.ts's
// headline resolution (server) — one registry so both sides agree on which
// tables are linkable and how to find a human-readable headline for them.
// THREE SOURCES SINCE REDESIGN PHASE 2, and the third is not a fourth
// kind of tracker. LINK_ONLY_MODULES holds files, conversations,
// missions, presentations and posts: things a project is FOR that no
// tracker owns. They are linkable and they are not typeable — see the
// header of lib/projects/linkable-extras.ts for why they are kept out of
// the other two registries rather than appended to them.
export type { LinkableModule };

export const LINKABLE_MODULES: LinkableModule[] = [
  ...CLASSIFIER_MODULES,
  ...BUILD_MODULES,
  ...LINK_ONLY_MODULES,
];

export function getLinkableModuleByTable(table: string): LinkableModule | undefined {
  return LINKABLE_MODULES.find((m) => m.table === table);
}

export function isLinkableTable(table: string): boolean {
  return LINKABLE_MODULES.some((m) => m.table === table);
}

export { moduleHref };
