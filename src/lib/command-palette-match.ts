/**
 * WHAT THE COMMAND PALETTE MATCHES A QUERY AGAINST.
 *
 * Extracted from components/dashboard/command-palette.tsx so it can be
 * measured. The palette is a client component that imports React,
 * next/navigation and next-intl; a matcher living inside it can only be
 * checked by reading it, and reading it is how the defect below survived.
 *
 * THE DEFECT, and it is the sharpest instance of a shape this repository
 * has now met four times. The palette RENDERS a translated label and
 * MATCHED the untranslated one. lib/sidebar-label-keys.ts said so out
 * loud — "the underlying strings stay English (state keys, search
 * matching) — only the rendered label goes through messages/*.json" —
 * and that sentence reads as a design note rather than as a bug report,
 * which is why it sat there.
 *
 * So a Greek user saw «Οικονομικά» in the palette, typed «οικο», and got
 * nothing: the matcher was comparing against "Finance". Measured across
 * all ten locales by scripts/tests/command-palette-language.test.mjs
 * before the fix — 9 of 10 languages matched NOTHING they could see.
 *
 * THE RULE THIS FILE EXISTS TO STATE. A string written to be READ and a
 * string written to be MATCHED are not the same string, and a matcher fed
 * the reading one is broken in every language except the one it was
 * written in. `filterAndRankCandidates` is the seam: the palette passes
 * every name an entry answers to — the one on screen AND the English one
 * — and this file matches against all of them.
 */
import { normalizeForSearch } from "@/lib/text/search-match";
import {
  GREEK_LETTER_PATTERN,
  greekSkeleton,
  greeklishSkeletons,
} from "@/lib/text/unicode-patterns";

/**
 * Subsequence match — every character of the query appears in the target,
 * in order, not necessarily contiguous. A plain substring match is just a
 * contiguous special case of this, so "fin" matches "Finance" either way.
 */
export function isFuzzyMatch(query: string, target: string): boolean {
  let qi = 0;
  for (let ti = 0; ti < target.length && qi < query.length; ti++) {
    if (target[ti] === query[qi]) qi++;
  }
  return qi === query.length;
}

/**
 * How well `candidates` answer `rawQuery`, or null for "not a match".
 *
 * A lower number sorts first. Substring hits beat subsequence hits, and an
 * earlier substring position beats a later one — "fin" should reach
 * Finance before it reaches "Define a workflow".
 *
 * EVERY CANDIDATE IS TRIED and the best result wins, because a palette
 * entry has more than one name a user might type. The English label is
 * still one of them: a Greek speaker who knows the product as "Finance",
 * or who has an English keyboard to hand, types that. Dropping it in
 * favour of the translation would have swapped one language's blindness
 * for another's.
 */
export function scoreCandidates(candidates: readonly string[], rawQuery: string): number | null {
  const query = normalizeForSearch(rawQuery).trim();
  if (!query) return null;

  let best: number | null = null;
  for (const candidate of candidates) {
    if (!candidate) continue;
    const target = normalizeForSearch(candidate);
    const index = target.indexOf(query);
    if (index !== -1) {
      if (best === null || index < best) best = index;
      continue;
    }
    // GREEKLISH, for the same reason it is in every other matcher: a
    // Greek user on an English keyboard types "oikonomika", and that is
    // a query about Finance in every sense except the alphabet.
    //
    // NOT textHasGreeklishTerm HERE, and the difference matters. That
    // function asks whether a text contains a WHOLE term; a palette is
    // typed a PREFIX at a time — nobody types «Οικονομικά» in full
    // before expecting a result. So this compares skeletons directly,
    // using the same two functions the rest of the matching uses rather
    // than a fourth spelling of the same idea: the Greek side reduces
    // deterministically, the Latin side branches, and a hit is the query
    // skeleton appearing anywhere in the candidate's.
    const greeklish = greeklishRank(query, candidate);
    if (greeklish !== null) {
      if (best === null || greeklish < best) best = greeklish;
      continue;
    }
    if (isFuzzyMatch(query, target)) {
      if (best === null || best > FUZZY_RANK) best = FUZZY_RANK;
    }
  }
  return best;
}

/**
 * Where a Latin query lands inside a Greek candidate's skeleton, or null.
 *
 * Returns an INDEX, so "oiko" against «Οικονομικά» ranks alongside a
 * plain substring hit rather than being demoted to the fuzzy tier — the
 * user typed the beginning of the word they can see, in the alphabet
 * their keyboard is in, and that is not a worse match than typing it in
 * Greek.
 */
function greeklishRank(query: string, candidate: string): number | null {
  // ONLY LATIN QUERY x GREEK CANDIDATE. A Greek query is already served
  // by the fold above, and running this as well would only add chances
  // to be wrong — the same rule textHasGreeklishTerm states for itself.
  if (!GREEK_LETTER_PATTERN.test(candidate)) return null;
  if (GREEK_LETTER_PATTERN.test(query)) return null;

  const target = greekSkeleton(candidate);
  if (!target) return null;
  let best: number | null = null;
  for (const skeleton of greeklishSkeletons(query)) {
    if (!skeleton) continue;
    const at = target.indexOf(skeleton);
    if (at !== -1 && (best === null || at < best)) best = at;
  }
  return best;
}

/**
 * Sorts after every substring hit. Deliberately a large finite number
 * rather than Infinity: two subsequence-only matches have to compare
 * equal so the caller's stable sort keeps the registry's own order, and
 * Infinity - Infinity is NaN in a comparator.
 */
export const FUZZY_RANK = 1_000_000;

/** An item the palette can navigate to, plus every name it answers to. */
export type MatchableItem<T> = { item: T; candidates: readonly string[] };

/**
 * The palette's page-navigation results, ranked.
 *
 * An empty query returns everything, unranked, which is what the palette
 * shows when it first opens.
 */
export function filterAndRankCandidates<T>(
  entries: readonly MatchableItem<T>[],
  rawQuery: string
): T[] {
  if (!normalizeForSearch(rawQuery).trim()) return entries.map((e) => e.item);

  const scored: { item: T; rank: number; order: number }[] = [];
  entries.forEach((entry, order) => {
    const rank = scoreCandidates(entry.candidates, rawQuery);
    if (rank !== null) scored.push({ item: entry.item, rank, order });
  });
  // Rank first, then the registry's own order — so equally-good matches
  // come back in the order the sidebar lists them rather than in
  // whatever order the scoring happened to produce.
  scored.sort((a, b) => a.rank - b.rank || a.order - b.order);
  return scored.map((s) => s.item);
}
