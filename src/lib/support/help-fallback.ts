import { helpLink } from "@/lib/support/help-links";

// The fallback rule, on its own, with nothing around it.
//
// This file has no database client, no `server-only`, and no Next
// dependency — deliberately. The rule it holds is the one sentence of this
// whole feature that must not be wrong:
//
//     a reader gets their own language, and English where theirs is
//     missing, and NEVER Greek.
//
// A rule that can only be exercised by standing up Supabase is a rule that
// gets tested once. Here it is a pure function over rows, so
// scripts/tests/help-articles.test.mjs drives it across every locale
// against fixtures that include Greek rows the reader must never see.
//
// ============================================================================
// WHY THE GUARANTEE IS STRUCTURAL AND NOT A FILTER
// ============================================================================
// The obvious implementation is to fetch everything and drop Greek. That
// is one line somebody can delete, reorder, or forget in a second query
// written six months from now. Instead localesFor() decides, once, which
// locales may be looked at — and it can only ever return [requested] or
// [requested, "en"]. Greek is in that array only when the reader asked for
// Greek. There is no code path that fetches a Greek row for a French
// reader, so there is nothing to forget.

export const HELP_BASE_LOCALE = "en";

export const HELP_LOCALES = [
  "en", "el", "es", "fr", "de", "it", "pt", "zh", "ja", "ar",
] as const;
export type HelpLocale = (typeof HELP_LOCALES)[number];

/** Display order for the categories — most-asked first, not alphabetical. */
export const HELP_CATEGORY_ORDER = [
  "getting-started",
  "billing",
  "credits",
  "websites",
  "agents",
  "missions",
  "chat",
  "files",
  "integrations",
  "account",
  "privacy",
] as const;
export type HelpCategory = (typeof HELP_CATEGORY_ORDER)[number];

export type HelpArticle = {
  slug: string;
  /** The language the words below are actually in. */
  locale: string;
  title: string;
  body: string;
  category: string;
  order: number;
  triggers: string[];
  href: string | null;
  /**
   * True when this article is the English one standing in for a missing
   * translation. The page shows a marker; a reader is entitled to know
   * they are reading a different language from the one they chose.
   */
  isFallback: boolean;
};

export type HelpRow = {
  slug: string;
  locale: string;
  title: string;
  body: string;
  category: string;
  order: number;
  triggers: string[] | null;
};

export function isHelpLocale(value: string): value is HelpLocale {
  return (HELP_LOCALES as readonly string[]).includes(value);
}

/**
 * The ONLY place that decides which locales a query may see.
 *
 * Returns at most two entries, and the second is always English. A locale
 * this app does not have becomes English outright rather than falling
 * through to whatever happens to be in the table.
 */
export function localesFor(requested: string): string[] {
  const wanted = isHelpLocale(requested) ? requested : HELP_BASE_LOCALE;
  return wanted === HELP_BASE_LOCALE ? [HELP_BASE_LOCALE] : [wanted, HELP_BASE_LOCALE];
}

/**
 * Pick one row per slug: the reader's language if present, else English.
 *
 * Sorted by category rank, then by the article's own order, then by slug —
 * a category nobody remembered to rank still renders, at the end, rather
 * than being silently dropped. Losing an answer is the worst failure this
 * feature has.
 */
export function mergeByLocale(rows: HelpRow[], requested: string): HelpArticle[] {
  const wanted = isHelpLocale(requested) ? requested : HELP_BASE_LOCALE;
  const allowed = new Set(localesFor(requested));

  const bySlug = new Map<string, HelpRow>();
  for (const row of rows) {
    // A row in a locale nobody asked for is dropped rather than trusted.
    // The query already excludes them; this is the second lock, and it is
    // what makes the guarantee hold even when a caller hands us a wider
    // set than localesFor() would have asked for.
    if (!allowed.has(row.locale)) continue;
    const existing = bySlug.get(row.slug);
    if (!existing || (existing.locale !== wanted && row.locale === wanted)) {
      bySlug.set(row.slug, row);
    }
  }

  const categoryRank = new Map<string, number>(
    HELP_CATEGORY_ORDER.map((c, i) => [c, i])
  );

  return [...bySlug.values()]
    .map((row) => ({
      slug: row.slug,
      locale: row.locale,
      title: row.title,
      body: row.body,
      category: row.category,
      order: row.order ?? 0,
      triggers: row.triggers ?? [],
      href: helpLink(row.slug),
      isFallback: row.locale !== wanted,
    }))
    .sort((a, b) => {
      const ra = categoryRank.get(a.category) ?? HELP_CATEGORY_ORDER.length;
      const rb = categoryRank.get(b.category) ?? HELP_CATEGORY_ORDER.length;
      if (ra !== rb) return ra - rb;
      if (a.order !== b.order) return a.order - b.order;
      return a.slug.localeCompare(b.slug);
    });
}
