// WHICH cross-module material reaches a prompt, and what it costs.
//
// RENAMED FROM lib/context-relevance.ts, AND THAT MATTERS. There was a
// second file called lib/ai/context-relevance.ts — a different module with
// a different API, deciding which MODULES are relevant rather than scoring
// text against a budget. Two live files one directory apart with the same
// name is how cross-module-context-chat-coding.mutation.mjs came to name
// cross-module-context.test.mjs: the string is one suffix away from the
// right one, the wrong gate loaded the wrong file, and fourteen mutations
// went unnoticed for months while the suite reported them as holes.
//
// So this one is named for what it does — score terms and spend a
// character budget — and the other is lib/ai/module-relevance.ts.
//
// The brief for this work said "use context-relevance.ts from #11". There
// is no such file: it has never existed on any branch and the word
// "relevance" does not appear anywhere in src/. What DOES exist is
// lib/chat/entity-mentions.ts, which solves one instance of this problem
// (find the user's records named in a chat message) with the selection
// rule welded into the same function as the database scan. This file is
// that rule pulled out on its own, so the two directions of cross-module
// context can share it instead of each inventing one.
//
// LEXICAL, NOT SEMANTIC, AND SAID OUT LOUD. There are no embeddings in
// this repo — entity-mentions.ts says so in its own header ("no
// embeddings/semantic search yet, per the brief"). A file called
// context-relevance that quietly did substring matching while its name
// implied meaning would be worse than one that says which it is. "Πόσο
// χρεώνω" will not match a note about "pricing" here, and it should not
// pretend to.
//
// THE BUDGET IS THE POINT. Every cross-module addition is tokens on every
// request that triggers it, and the instruction attached to this work was
// explicit: measure before and after, and narrow the criterion if the
// context doubles. So selection returns not just what it kept but what it
// dropped and why, and the caller can print the number. A gate whose cost
// cannot be read is a gate nobody will keep tight.
//
// Client-safe (no `server-only`): pure functions over strings, so the
// tests can load it directly and so a future client-side preview can use
// the same rule the server does.
import { normalizeForSearch } from "@/lib/text/search-match";

/** Terms shorter than this are noise — articles, particles, "ένα", "the". */
const MIN_TERM_LENGTH = 3;

/**
 * The comparable term set of a piece of text.
 *
 * Case-, accent- and sigma-folded through the SAME normaliser the app's
 * search and entity mentions use (lib/text/search-match.ts). Sharing it is
 * not tidiness: a second fold here is how "καφε" would match a record in
 * search and fail to match the same record in context selection.
 */
export function termsOf(text: string | null | undefined): Set<string> {
  const normalized = normalizeForSearch(text);
  if (!normalized) return new Set();
  const out = new Set<string>();
  for (const term of normalized.split(/[^\p{L}\p{N}]+/u)) {
    if (term.length >= MIN_TERM_LENGTH) out.add(term);
  }
  return out;
}

/**
 * How much of the QUERY this candidate covers, 0..1.
 *
 * Deliberately asymmetric. Scoring by overlap of the two term sets would
 * let a long note beat a short exact one simply by containing more words,
 * and a record's description is routinely twenty times the length of the
 * question. What matters is "does this material answer what was asked",
 * which is the share of the question's terms the candidate accounts for.
 *
 * Returns 0 for an empty query rather than 1: no question means nothing
 * is relevant, not everything is.
 */
export function relevanceScore(query: string, candidate: string): number {
  const q = termsOf(query);
  if (q.size === 0) return 0;
  const c = termsOf(candidate);
  if (c.size === 0) return 0;
  let hits = 0;
  for (const term of q) if (c.has(term)) hits++;
  return hits / q.size;
}

export type SelectionOptions = {
  /** Below this score a candidate is not relevant at all. */
  minScore: number;
  /** Hard ceiling on the characters the selection may contribute. */
  budgetChars: number;
  /** Hard ceiling on the number of items, regardless of budget. */
  maxItems: number;
};

export type Selection<T> = {
  selected: T[];
  /** Characters the selected items actually contribute. */
  chars: number;
  /** Considered but scored below minScore. */
  droppedForScore: number;
  /** Relevant enough, but the budget or the item cap was already spent. */
  droppedForBudget: number;
  /** Highest score seen, selected or not — tells you whether a miss was
   *  "nothing matched" or "the budget ran out". */
  topScore: number;
};

/**
 * Rank by relevance, keep what fits, report the rest.
 *
 * Stable and deterministic: ties break on the caller's original order, so
 * the same request produces the same prompt, which is what makes the token
 * measurement reproducible and the tests possible. A selection that
 * shuffled on equal scores would make the cost a range instead of a
 * number.
 *
 * The budget is checked against the item's own length BEFORE it is taken,
 * and an item that does not fit does not stop the loop — a shorter,
 * slightly less relevant one after it still gets its chance. Stopping at
 * the first over-budget item would let one long note starve everything
 * behind it.
 */
export function selectWithinBudget<T>(
  query: string,
  items: T[],
  textOf: (item: T) => string,
  options: SelectionOptions
): Selection<T> {
  const scored = items.map((item, index) => ({
    item,
    index,
    text: textOf(item),
    score: relevanceScore(query, textOf(item)),
  }));

  const topScore = scored.reduce((max, s) => (s.score > max ? s.score : max), 0);
  const relevant = scored.filter((s) => s.score >= options.minScore);
  const droppedForScore = scored.length - relevant.length;

  relevant.sort((a, b) => (b.score - a.score) || (a.index - b.index));

  const selected: T[] = [];
  let chars = 0;
  let droppedForBudget = 0;
  for (const candidate of relevant) {
    const cost = candidate.text.length;
    if (selected.length >= options.maxItems || chars + cost > options.budgetChars) {
      droppedForBudget++;
      continue;
    }
    selected.push(candidate.item);
    chars += cost;
  }

  return { selected, chars, droppedForScore, droppedForBudget, topScore };
}

/**
 * The repo's own chars-to-tokens convention (lib/billing/estimate.ts's
 * CHARS_PER_TOKEN = 4), re-exported here so a measurement of this gate and
 * a bill for the same request cannot use two different numbers.
 *
 * IT IS AN ESTIMATE, and for Greek an optimistic one — Claude's tokeniser
 * splits Greek far finer than four characters per token, so the real cost
 * of a Greek description is higher than this returns. It is the right
 * number to use anyway, because it is the number the billing path uses;
 * a truer count here and a looser one there would make the two disagree
 * about the same prompt.
 */
export const CHARS_PER_TOKEN = 4;

export function estimateTokens(chars: number): number {
  return Math.ceil(Math.max(0, chars) / CHARS_PER_TOKEN);
}
