/**
 * THE ONE MODULE THE QUESTION IS ACTUALLY ABOUT, READ PROPERLY.
 *
 * V4.6 #1. The product's sentence is "it already knows your work". At
 * five headlines per module that sentence is not true: asked "how were
 * sales this week", the model gets five recent sales headlines with no
 * amounts and no dates, and answers without a single number in it.
 *
 * WHY NOT JUST RAISE THE LIMIT. Measured in scripts/measure-context.mjs:
 * AI Life Context lives in the CACHED per-user block, so growing it is
 * billed at Anthropic's cacheRead rate — a tenth of input. Three options
 * were priced, in full-price-equivalent tokens per message:
 *
 *   A. flat 5 -> 20 everywhere            +302   20 rows in all 13 modules
 *   B. relevance-weighted, same 65 rows  +1247   0 extra characters
 *   C. keep flat 5 cached, append 25      +388   25 deep rows where asked
 *
 * B sends the FEWEST characters and costs the MOST, which is the finding
 * that decided this file: a per-question allocation cannot live in a
 * cached prefix, and moving it there breaks the cache on every turn and
 * puts the whole 1,385-token block back on a full-price line. C is A's
 * price with aim. This is C.
 *
 * SO THE CACHED BLOCK IS NEVER TOUCHED. What this produces is appended to
 * the per-message suffix, beside the entity mentions, for exactly the
 * reason recorded in api/chat/route.ts: a block that changes with the
 * question belongs after the cache boundary, never inside it.
 *
 * AND IT IS USUALLY EMPTY. A question that does not clearly point at one
 * module adds nothing at all — no "best guess" module, because a deep
 * read of the wrong module costs the same as a deep read of the right
 * one and is worse than sending nothing.
 *
 * Pure and react-free so the gate can load it.
 */

/** Rows are capped by CHARACTERS, not by count. A row count caps the
 *  wrong thing: twenty-five short leads and twenty-five long research
 *  notes are the same number and a very different bill. */
export const DEEP_DIVE_CHAR_BUDGET = 2000;
/** A ceiling on rows as well, so a module of one-word entries does not
 *  send two hundred of them to fill the budget. */
export const DEEP_DIVE_ROW_LIMIT = 25;
/**
 * Below this the question is not about anything in particular.
 *
 * ONE, not two. Two was the first guess and it rejected every real
 * question: measured over ten, "Πόσα έξοδα είχα τον τελευταίο μήνα;"
 * scores finance:1, "which of my leads is worth chasing" scores sales:1.
 * People name a module once and then ask their question; requiring them
 * to name it twice is requiring them to write like a search engine.
 *
 * What keeps this safe is not the threshold, it is the clear-winner rule
 * below: a 1 that is the only 1 is evidence, and a 1 tied with another 1
 * is not.
 */
export const DEEP_DIVE_MIN_SCORE = 1;
/** A question shorter than this is "thanks" or "and?" — it has no topic
 *  to match, and matching it anyway is how a greeting pulls a module. */
export const DEEP_DIVE_MIN_QUESTION_CHARS = 15;

/**
 * The same floor for a script that needs a third of the characters.
 *
 * Fifteen is right for English and wrong for Chinese: "总收入是多少？"
 * ("how much revenue in total?") is SEVEN characters and a complete
 * question, and the flat floor rejected it before anything was scored.
 * Measured: Chinese was 0 of 5 while every one of those five scored the
 * correct module — the vocabulary was working and the length gate threw
 * the answer away.
 *
 * Six still rejects the greetings the floor exists for: 谢谢 (thanks) is
 * two characters, ありがとう five.
 */
export const DEEP_DIVE_MIN_QUESTION_CHARS_CJK = 6;

const CJK = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}]/u;

/** How long a question must be to be worth placing, for the script it is
 *  written in. */
export function minQuestionChars(question: string): number {
  return CJK.test(question) ? DEEP_DIVE_MIN_QUESTION_CHARS_CJK : DEEP_DIVE_MIN_QUESTION_CHARS;
}

/**
 * A module's score, with subject words worth twice an associated one.
 *
 * TWO KINDS OF EVIDENCE, and they are not equal. "σχόλια" says the
 * question is about Feedback; "πελάτες" says it involves customers, which
 * is true of questions about feedback, sales, competitors and products
 * alike. Scoring them the same tied "Τι σχόλια έχω πάρει από πελάτες;"
 * at 1-1 and sent it nowhere.
 *
 * The weights are integers so a tie is a real tie: an associated word can
 * only decide a question that has no subject word in it, and can never
 * outvote one that does.
 */
export const SUBJECT_WEIGHT = 2;
export const ASSOCIATED_WEIGHT = 1;

export function deepDiveScore(subjectHits: number, associatedHits: number): number {
  return subjectHits * SUBJECT_WEIGHT + associatedHits * ASSOCIATED_WEIGHT;
}

export type DeepDiveChoice = {
  slug: string;
  score: number;
  /** The runner-up's score, so a caller can log WHY this was clear. */
  runnerUp: number;
};

/**
 * At most this many modules share a split read. Two is the whole of it:
 * "compare X and Y" is a real question and "compare V, W, X and Y" is a
 * request for a report, which a quarter of the rows in each of four
 * modules would answer worse than saying so.
 */
export const DEEP_DIVE_MAX_SPLIT = 2;

/**
 * What to do about this question, including the two ways of doing
 * nothing — which are not the same thing and must not look the same to
 * the user.
 *
 * "none/no-match" is a question about nothing in particular; the flat
 * five per module already cover it and there is nothing to explain.
 * "none/too-many" is a question that named four areas, and a user who
 * gets a shallow answer to THAT deserves to know why. That distinction
 * is the whole reason this is a plan and not a nullable slug.
 */
export type DeepDivePlan =
  | { kind: "one"; slug: string; score: number; runnerUp: number }
  | { kind: "split"; slugs: string[]; score: number }
  | { kind: "none"; reason: "short" | "no-match" | "too-many"; slugs: string[] };

/**
 * Which single module to read deeply, or null.
 *
 * `score` and `words` come from lib/ai/module-relevance.ts — the same two
 * primitives module narrowing and cross-module context use, because a
 * second implementation of "which module is this about" is how two
 * features that claim the same rule quietly stop agreeing.
 *
 * A CLEAR WINNER OR NOTHING. "How are sales and finance doing?" scores
 * two modules alike, and picking either one deep-reads half the question
 * while implying it read all of it. Ties return null: the flat five per
 * module are still there, and the answer is no worse than it was.
 */
export function planDeepDive(
  question: string,
  scored: readonly { slug: string; score: number }[],
  minScore: number = DEEP_DIVE_MIN_SCORE
): DeepDivePlan {
  if (question.trim().length < minQuestionChars(question))
    return { kind: "none", reason: "short", slugs: [] };
  const ranked = [...scored].filter((s) => s.score >= minScore).sort((a, b) => b.score - a.score);
  if (ranked.length === 0) return { kind: "none", reason: "no-match", slugs: [] };
  const top = ranked[0];
  const tied = ranked.filter((r) => r.score === top.score);
  if (tied.length === 1) {
    return { kind: "one", slug: top.slug, score: top.score, runnerUp: ranked[1]?.score ?? 0 };
  }
  // A TIE IS NOT AN ABSENCE OF EVIDENCE. It used to return null, and the
  // user asking "compare my sales and my finance numbers" got a shallow
  // answer with nothing to explain it. Two tied modules are read at half
  // depth each; more than two are not read, and the answer says so.
  if (tied.length <= DEEP_DIVE_MAX_SPLIT) {
    return { kind: "split", slugs: tied.map((t) => t.slug), score: top.score };
  }
  return { kind: "none", reason: "too-many", slugs: tied.map((t) => t.slug) };
}

/** The single-module case, for callers that only handle that one. */
export function pickDeepDiveModule(
  question: string,
  scored: readonly { slug: string; score: number }[],
  minScore: number = DEEP_DIVE_MIN_SCORE
): DeepDiveChoice | null {
  const plan = planDeepDive(question, scored, minScore);
  return plan.kind === "one" ? { slug: plan.slug, score: plan.score, runnerUp: plan.runnerUp } : null;
}

export type DeepDiveRow = Record<string, unknown>;

export type DeepDiveField = { key: string; label: string; money?: true };

/**
 * The rows as prompt text, inside the character budget.
 *
 * ONE LINE PER ROW, dated, with the fields that carry numbers. The point
 * of reading deeply is arithmetic the model can do — "sales this week"
 * needs amounts and dates, not five more titles — so a row that loses its
 * amount to the budget has lost the reason it was fetched.
 *
 * Rows are taken newest-first and stop at the budget. What did NOT fit is
 * returned, not hidden: the caller says so in the prompt, because a model
 * told it has "the entries" will answer as if it has all of them.
 */
export function formatDeepDive(
  title: string,
  headlineKey: string,
  fields: readonly DeepDiveField[],
  rows: readonly DeepDiveRow[],
  budget: number = DEEP_DIVE_CHAR_BUDGET,
  rowLimit: number = DEEP_DIVE_ROW_LIMIT
): { text: string; used: number; omitted: number } {
  const lines: string[] = [];
  let used = 0;
  let i = 0;
  for (; i < rows.length && i < rowLimit; i++) {
    const row = rows[i];
    const headline = String(row[headlineKey] ?? "").trim();
    if (!headline) continue;
    const date = String(row.created_at ?? "").slice(0, 10);
    const parts = fields
      .map((f) => {
        const v = row[f.key];
        if (v === null || v === undefined || v === "") return null;
        return `${f.label}: ${String(v)}`;
      })
      .filter(Boolean);
    const line = `- ${date} | ${headline}${parts.length > 0 ? ` | ${parts.join(" | ")}` : ""}`;
    if (used + line.length > budget) break;
    lines.push(line);
    used += line.length + 1;
  }
  return { text: lines.join("\n"), used, omitted: Math.max(0, rows.length - lines.length) };
}

/**
 * The block, with the honesty about its own edges attached.
 *
 * The count and the omission are stated because a model that is handed
 * "the sales" and given twenty of two hundred will answer "your sales
 * total X" about a fifth of them, and the sentence will look right.
 */
/**
 * "I looked at both of these only briefly" — the sentence (β).
 *
 * It costs 44 tokens against the 431 a split read costs, and it is the
 * part the user is actually missing: not depth, but knowing WHY the
 * answer is shallow. A shallow answer with no explanation reads as the
 * product being weak; the same answer with this line reads as a
 * question that can be asked better.
 */
export function deepDiveBreadthNotice(
  titles: readonly string[],
  split: boolean,
  language: "en" | "el"
): string {
  if (titles.length === 0) return "";
  const list = titles.join(", ");
  if (language === "el") {
    return split
      ? `\n\nΗ ερώτηση αφορά δύο ενότητες (${list}), οπότε διάβασες τις μισές γραμμές από κάθε μία. Αν χρειάζεται πιο βαθιά ανάλυση, πες στον χρήστη να ρωτήσει για μία ενότητα τη φορά.`
      : `\n\nΗ ερώτηση αφορά πολλές ενότητες (${list}) και καμία δεν διαβάστηκε σε βάθος. Πες το ΡΗΤΑ και πρότεινε στον χρήστη να ρωτήσει για μία τη φορά.`;
  }
  return split
    ? `\n\nThis question spans two modules (${list}), so you were given half the rows from each. If a deeper read would help, tell the user to ask about one at a time.`
    : `\n\nThis question spans several modules (${list}) and none was read in depth. SAY SO, and suggest asking about one at a time.`;
}

export function deepDivePromptAddition(
  title: string,
  body: string,
  shown: number,
  omitted: number,
  language: "en" | "el"
): string {
  if (!body) return "";
  if (language === "el") {
    const cut =
      omitted > 0
        ? ` Υπάρχουν κι άλλες ${omitted} που ΔΕΝ βλέπεις — μην δίνεις σύνολα σαν να τις έχεις όλες.`
        : " Αυτές είναι όλες όσες υπάρχουν σε αυτή την ενότητα.";
    return `\n\nΑναλυτικά δεδομένα για «${title}» (${shown} καταχωρήσεις, με ημερομηνίες και ποσά — χρησιμοποίησέ τα για να απαντήσεις με ΝΟΥΜΕΡΑ):\n${body}\n${cut}`;
  }
  const cut =
    omitted > 0
      ? ` There are ${omitted} more you are NOT seeing — do not give totals as if you have them all.`
      : " These are all there are in this module.";
  return `\n\nDetailed data for "${title}" (${shown} entries, with dates and amounts — use these to answer with NUMBERS):\n${body}\n${cut}`;
}
