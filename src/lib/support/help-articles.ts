import "server-only";
import { createClient } from "@/lib/supabase/server";
import { localesFor, mergeByLocale, isHelpLocale, type HelpRow } from "@/lib/support/help-fallback";

// The Help Centre's reader — the part that touches the database.
//
// The RULE lives next door, in help-fallback.ts, with no client and no
// `server-only`, so it can be tested across every locale without standing
// anything up. This file is the plumbing: fetch, cache, hand the rows to
// the rule.
//
// ============================================================================
// TWO READERS, TWO RULES
// ============================================================================
// /help and the contextual "?" fall back to English, because a page with
// the answer in the wrong language still answers the question — and says
// so on screen.
//
// The support chat does NOT fall back — see loadHelpArticlesForLocaleOnly().
// Matching an English trigger and replying with an English canned
// paragraph is exactly the bug being fixed here, in a different language.

export {
  HELP_BASE_LOCALE,
  HELP_LOCALES,
  HELP_CATEGORY_ORDER,
  isHelpLocale,
  localesFor,
  mergeByLocale,
} from "@/lib/support/help-fallback";
export type { HelpArticle, HelpLocale, HelpCategory } from "@/lib/support/help-fallback";

import type { HelpArticle } from "@/lib/support/help-fallback";

const SELECT = 'slug, locale, title, body, category, "order", triggers';

// A small in-process cache, because the support chat consults this table
// before EVERY message — ahead of the credit check, so that someone out of
// credits can still be told how to cancel. Without it, a table that changes
// a few times a year would be read on every request.
//
// Failures are never cached: a database that was briefly unavailable must
// not turn into five minutes of an empty Help Centre.
const CACHE_TTL_MS = 5 * 60 * 1000;
const cache = new Map<string, { at: number; rows: HelpRow[] }>();

async function fetchRows(key: string, locales: string[]): Promise<HelpRow[] | null> {
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < CACHE_TTL_MS) return hit.rows;

  try {
    const supabase = createClient();
    const { data, error } = await supabase
      .from("help_articles")
      .select(SELECT)
      .in("locale", locales)
      .eq("published", true);

    if (error || !data) return null;
    const rows = data as unknown as HelpRow[];
    cache.set(key, { at: Date.now(), rows });
    return rows;
  } catch {
    return null;
  }
}

/** Test seam — drops the cache so a content change is visible immediately. */
export function clearHelpArticleCache(): void {
  cache.clear();
}

/**
 * Every published article for a reader, their language first, English
 * standing in for what is missing.
 *
 * Never throws, and returns null rather than [] when the read failed. The
 * page needs to tell those two apart: an empty table and an unreachable
 * one look identical to a reader otherwise, and "there is no help" is a
 * much worse thing to say than "help is not loading".
 */
export async function loadHelpArticles(requested: string): Promise<HelpArticle[] | null> {
  const locales = localesFor(requested);
  const rows = await fetchRows(`page:${locales.join(",")}`, locales);
  if (!rows) return null;
  return mergeByLocale(rows, requested);
}

/** One article, for the contextual "?" . Null when there is nothing to show. */
export async function loadHelpArticle(
  slug: string,
  requested: string
): Promise<HelpArticle | null> {
  const all = await loadHelpArticles(requested);
  if (!all) return null;
  return all.find((a) => a.slug === slug) ?? null;
}

/**
 * Articles for the support chat's canned answers — THE READER'S OWN
 * LANGUAGE ONLY.
 *
 * No fallback here, and the missing fallback is the feature. /help can
 * show an English article to a French reader because the page says so on
 * screen. A chat reply cannot: it arrives as a bare sentence from the
 * product, in the wrong language, with nothing around it to explain why.
 * The reader asked in French and is entitled to French, so when French has
 * no article the model answers instead — at the cost of one call.
 */
export async function loadHelpArticlesForLocaleOnly(
  locale: string
): Promise<HelpArticle[]> {
  if (!isHelpLocale(locale)) return [];
  const rows = await fetchRows(`chat:${locale}`, [locale]);
  if (!rows) return [];
  // Belt and braces: the fetch asked for one locale, and anything that
  // still came back marked as a fallback is by definition not it.
  return mergeByLocale(rows, locale).filter((a) => !a.isFallback);
}
