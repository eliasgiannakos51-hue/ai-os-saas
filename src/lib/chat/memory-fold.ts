// The dedup key for a remembered fact.
//
// SPLIT OUT OF ./memory.ts, and not for tidiness: that module imports
// "server-only" and reaches for the Anthropic SDK the moment it loads, so
// nothing in the browser can call it — and the correction flow on
// /dashboard/ai-memory writes a new remembered line from a client
// component, which has to compute the same fold the extractor does or the
// two would stop deduplicating against each other. This is also what puts
// it within reach of a build gate, exactly as memory-policy.ts is.
//
// ONE FOLD, SHARED. foldForMatch() is what the search box, the greeklish
// matcher and the injection patterns already use, so "Με λένε Ηλία" and
// "με λενε ηλια" compare equal here for the same reason they do there.
// Whitespace is collapsed on top of it, because the extractor's output is
// a sentence and a stray newline is not a different fact.
//
// The migration's backfill folds legacy rows with SQL's
// public.search_fold() instead, which cannot import this. The two agree on
// Latin and Greek — scripts/tests/chat-memory-store.itest.mjs pins them
// against each other on the shapes that matter, so a disagreement is a
// failing gate rather than a duplicate row nobody notices.
import { foldForMatch } from "@/lib/text/unicode-patterns";

/**
 * TRAILING SENTENCE PUNCTUATION IS TRIMMED, and that is a real defect
 * found by measurement on 2026-09-25, not a tidy-up.
 *
 * The extractor is asked for "1-2 σύντομες προτάσεις", so its output is a
 * SENTENCE — and a model ends a sentence with a full stop most of the
 * time and not always. Measured:
 *
 *   "Τον λένε Ηλία και φτιάχνει ένα SaaS."  ->  ...saas.
 *   "Τον λένε Ηλία και φτιάχνει ένα SaaS"   ->  ...saas
 *
 * Two rows, for one fact, differing by one character nobody typed. And it
 * is worse than untidy: the read takes the newest N by last_seen_at, so a
 * fact split in two occupies two of the twenty slots the prompt gets, and
 * BOTH read as "mentioned once" — which is exactly the distinction
 * times_seen exists to make. The feature degrades the more consistently
 * somebody talks about themselves, which is the same failure
 * 20261003000000 was written to fix at the row level.
 *
 * WHAT IS NOT TRIMMED, and the measurement is the argument: everything
 * that carries meaning survives. "Δεν προτιμά μαύρο" and "Προτιμά μαύρο"
 * stay apart, "10 ώρες" and "12 ώρες" stay apart, "μαύρο" and "μπλε" stay
 * apart, and one extra word stays apart. Only the mark at the END of the
 * sentence goes.
 *
 * THE SQL FOLD DOES NOT DO THIS, and the divergence is bounded and
 * written down rather than hidden. public.search_fold() folded the legacy
 * rows during the 20261003000000 backfill; a legacy row whose text ended
 * in a stop keeps a fold that ends in one, and a new extraction of the
 * same fact will not match it. That is one extra line on
 * /dashboard/ai-memory which the person can delete — not lost data, and
 * not worse than the state before this change, where EVERY repetition
 * could split. scripts/tests/chat-memory-store.itest.mjs pins the two
 * folds on unpunctuated samples, which is where they still agree exactly.
 */
export function memoryFold(text: string): string {
  return foldForMatch(String(text ?? ""))
    .replace(/\s+/g, " ")
    .trim()
    // Latin and Greek sentence marks, plus the Arabic full stop and the
    // CJK ideographic one — the extractor writes in the user's language.
    .replace(/[.!?;··。！？]+$/u, "")
    .trim();
}
