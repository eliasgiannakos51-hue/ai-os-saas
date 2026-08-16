import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Help Centre articles, read from the database, in the reader's language.
 *
 * WHY THIS EXISTS. The 27 articles used to be string literals in
 * knowledge-base.ts, written entirely in Greek, and /help rendered them
 * verbatim to every visitor — so nine of the ten locales were shown a
 * language they had not asked for. The chat had already solved its half
 * (it declined to use a Greek canned answer for a non-Greek user and fell
 * through to the model); the page never did.
 *
 * THE FALLBACK GOES TO ENGLISH, NEVER TO GREEK. That is the whole point
 * of the migration and it is enforced here rather than in SQL, because
 * SQL has no opinion about which language is the base one. English is
 * seeded complete for all 27 slugs precisely so this can never land on
 * nothing.
 *
 * AND THE FALLBACK IS VISIBLE. A Spanish reader who gets the English
 * article is told so, and the element carries lang="en" so a screen
 * reader switches voice instead of reading English words with Spanish
 * phonetics. Silently serving another language is how the original bug
 * survived for as long as it did — it looked like content, not like a
 * gap.
 */
export type HelpArticle = {
  slug: string;
  /** The locale this row was actually written in — not the one asked for. */
  locale: string;
  title: string;
  body: string;
  category: string;
  order: number;
  triggers: string[];
  /** True when this is the English article standing in for a missing one. */
  isFallback: boolean;
};

export const HELP_FALLBACK_LOCALE = "en";

type Row = {
  slug: string;
  locale: string;
  title: string;
  body: string;
  category: string;
  order: number;
  triggers: string[] | null;
};

function toArticle(row: Row, requested: string): HelpArticle {
  return {
    slug: row.slug,
    locale: row.locale,
    title: row.title,
    body: row.body,
    category: row.category,
    order: row.order,
    triggers: row.triggers ?? [],
    isFallback: row.locale !== requested,
  };
}

/**
 * Every published article for one locale, English filling any gaps.
 *
 * ONE QUERY, not one per slug: the row set is small (a couple of hundred
 * at ten languages) and two round trips per page load to save a few
 * kilobytes would be the wrong trade. The merge happens here, where the
 * fallback rule is written down, rather than in SQL where it would be a
 * clever join nobody can read.
 */
export async function loadHelpArticles(locale: string): Promise<HelpArticle[]> {
  const admin = createAdminClient();
  const wanted = [locale, HELP_FALLBACK_LOCALE];

  const { data, error } = await admin
    .from("help_articles")
    .select("slug, locale, title, body, category, order:\"order\", triggers")
    .eq("published", true)
    .in("locale", wanted);

  if (error || !data) return [];

  const rows = data as unknown as Row[];
  const bySlug = new Map<string, Row>();
  for (const row of rows) {
    const existing = bySlug.get(row.slug);
    // The requested locale always wins; English only fills a gap. Written
    // as an explicit preference rather than relying on row order, which a
    // query without an ORDER BY does not promise.
    if (!existing || (existing.locale !== locale && row.locale === locale)) {
      bySlug.set(row.slug, row);
    }
  }

  return [...bySlug.values()]
    .map((row) => toArticle(row, locale))
    .sort((a, b) => a.category.localeCompare(b.category) || a.order - b.order);
}

/**
 * The articles the canned-answer matcher may use for one locale.
 *
 * NO FALLBACK HERE, and that is the difference from the page. /help shows
 * an English article to a Spanish reader because a real answer in the
 * wrong language beats a blank space on a page they came to read. The
 * chat is the opposite case: a Spanish user typing a Spanish question has
 * a working alternative one step away — the model, which answers in
 * Spanish — so handing them English prose would be a downgrade chosen on
 * their behalf to save a model call.
 *
 * It also closes the trapdoor that made this necessary. The Greek trigger
 * lists legitimately contain English product nouns ("pricing", "credits",
 * "cancel"), which is right for a Greek speaker; when every locale shared
 * one list, an English user typing "pricing" scored 0.975 against a 0.85
 * threshold and was handed a Greek paragraph. Triggers are per-locale
 * now, so a French user is only ever matched against French phrasings.
 */
export async function loadCannedArticles(locale: string): Promise<HelpArticle[]> {
  const admin = createAdminClient();

  const { data, error } = await admin
    .from("help_articles")
    .select("slug, locale, title, body, category, order:\"order\", triggers")
    .eq("published", true)
    .eq("locale", locale);

  if (error || !data) return [];
  return (data as unknown as Row[]).map((row) => toArticle(row, locale));
}
