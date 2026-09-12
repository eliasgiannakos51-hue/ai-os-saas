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

export function memoryFold(text: string): string {
  return foldForMatch(String(text ?? "")).replace(/\s+/g, " ").trim();
}
