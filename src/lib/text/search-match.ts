// Accent- and case-insensitive matching and locale-correct ordering, for
// every list in the app.
//
// WHAT WAS WRONG. Nine list components each did the same thing:
//
//     items.filter((x) => x.name.toLowerCase().includes(query.toLowerCase()))
//
// `toLowerCase()` handles case and nothing else, so a Greek user typing
// "καφε" got no results for "Καφές" — the accent on the έ makes the two
// strings different, and lower-casing does not remove it. Worse, upper-case
// Greek drops accents in ordinary writing ("ΚΑΦΕΣ") while lower case keeps
// them, so the same word typed two natural ways never matched itself.
// Exactly the same failure hit the server's `ilike` (see
// supabase/migrations/20260813_accent_insensitive_search.sql).
//
// The brief asks for `normalize("NFD").replace(/\p{Diacritic}/gu, "")` on
// both sides of the comparison. That is what foldForMatch does, with two
// differences that both matter here:
//
//   - it also folds Greek FINAL SIGMA. "ΚΑΦΕΣ".toLowerCase() is "καφεσ"
//     but "καφές" ends in ς, so NFD-stripping alone still leaves the two
//     unequal. ς and σ are the same letter in different positions.
//   - it is index-stable, which the sanitiser needs and this does not —
//     but sharing one fold is what keeps client search, server search and
//     the injection patterns from drifting apart.
//
// Client-safe (no `server-only`): these run in the browser.
import { foldForMatch } from "@/lib/text/unicode-patterns";

/** The comparable form of a piece of text: case-, accent- and sigma-folded. */
export function normalizeForSearch(text: string | null | undefined): string {
  return foldForMatch(String(text ?? ""));
}

/**
 * Substring match with both sides normalised.
 *
 * An empty or whitespace-only query matches everything, which is what every
 * call site already assumed — the search box being empty is not a filter.
 */
export function matchesSearch(haystack: string | null | undefined, query: string): boolean {
  const q = normalizeForSearch(query).trim();
  if (!q) return true;
  return normalizeForSearch(haystack).includes(q);
}

/**
 * Comparator for ordering text the way the reader's language orders it.
 *
 * `a < b` and the default `Array.prototype.sort()` compare UTF-16 code
 * units, which puts every accented Greek letter after every unaccented one
 * ("Ωμέγα" before "Άλφα") and every capital before every lower-case letter.
 * Intl.Collator is the only thing that gets this right, and it needs the
 * user's locale to do it — Swedish and German disagree about ä, Greek and
 * English disagree about accents.
 *
 * `sensitivity: "base"` so ordering ignores case and accents, matching what
 * search already does; `numeric: true` so "Item 2" precedes "Item 10".
 */
export function textComparator(locale: string): (a: string, b: string) => number {
  // A bad locale tag from a URL segment would throw; falling back to the
  // environment default is better than a list that fails to render.
  let collator: Intl.Collator;
  try {
    collator = new Intl.Collator(locale, { sensitivity: "base", numeric: true });
  } catch {
    collator = new Intl.Collator(undefined, { sensitivity: "base", numeric: true });
  }
  return (a, b) => collator.compare(String(a ?? ""), String(b ?? ""));
}
