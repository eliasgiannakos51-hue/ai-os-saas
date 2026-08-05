import { LINKABLE_MODULES, moduleHref } from "@/lib/knowledge-graph";

/**
 * Every table whose records can be starred.
 *
 * This is deliberately WIDER than LINKABLE_MODULES. "Can I link this to
 * another record" and "can I star this" are different questions: a
 * Website Builder project, a Mission and a Document are all things a user
 * naturally wants to pin, but none of them is a classifier/build module
 * with the `fields` shape the entity-link picker needs.
 *
 * Keeping one registry means the toggle route's allow-list, the favorites
 * page's grouping, and the star buttons themselves can never disagree
 * about what is starrable — which is exactly how the earlier version
 * ended up rejecting a star the UI had already drawn.
 */
export type FavoritableConfig = {
  table: string;
  /** Stable key used for grouping and for the module badge colour. */
  slug: string;
  /** English fallback name, used only if no translation exists. */
  title: string;
  /** Column holding the human-readable name. */
  headlineKey: string;
  /**
   * Where a starred record links to. Some modules have a real per-record
   * page; others only have a list, so the link goes there.
   */
  hrefFor: (recordId: string) => string;
};

// The three surfaces that are starrable but not linkable. Their titles
// come from the same i18n namespace the sidebar uses, so a starred
// Mission is labelled the same everywhere.
export const EXTRA_FAVORITABLE: FavoritableConfig[] = [
  {
    table: "user_websites",
    slug: "websiteBuilder",
    title: "Website Builder",
    headlineKey: "name",
    // The workspace selects a project from the query string rather than
    // having its own route, so the deep link has to carry the id.
    hrefFor: (id) => `/dashboard/website-builder?project=${id}`,
  },
  {
    table: "ai_missions",
    slug: "missionControl",
    title: "Mission Control",
    headlineKey: "goal",
    hrefFor: () => "/dashboard/mission",
  },
  {
    table: "user_documents",
    slug: "documents",
    title: "Documents",
    headlineKey: "title",
    hrefFor: (id) => `/dashboard/documents/${id}`,
  },
];

const LINKABLE_FAVORITABLE: FavoritableConfig[] = LINKABLE_MODULES.map((m) => ({
  table: m.table,
  slug: m.slug,
  title: m.title,
  headlineKey: m.headlineKey,
  hrefFor: () => moduleHref(m.slug),
}));

export const FAVORITABLE: FavoritableConfig[] = [
  ...LINKABLE_FAVORITABLE,
  ...EXTRA_FAVORITABLE,
];

export function getFavoritableByTable(table: string): FavoritableConfig | undefined {
  return FAVORITABLE.find((f) => f.table === table);
}

export function isFavoritableTable(table: string): boolean {
  return FAVORITABLE.some((f) => f.table === table);
}

/**
 * The `sidebar.items.*` key for a module slug.
 *
 * Slugs are kebab-case ("data-analysis") while the message catalogue is
 * camelCase ("dataAnalysis"), so the two only line up after this
 * conversion — `data-analysis` is the one module where they differ today,
 * and normalising generically means the next kebab-case slug added won't
 * silently fall back to English.
 */
export function sidebarKeyForSlug(slug: string): string {
  return slug.replace(/-([a-z])/g, (_, c: string) => c.toUpperCase());
}
