import { foldForMatch } from "@/lib/text/unicode-patterns";
import { questionWords, scoreTerms } from "@/lib/ai/context-relevance";

/**
 * CODING AND CHAT, EACH SEEING THE OTHER (V4 #36).
 *
 * The workspace context already existed: the Coding module can read
 * headlines from the user's own modules, so "a function that calculates
 * the margin" means what it means in this account. What did not exist is
 * the flow in either direction between the two places the user actually
 * TALKS to the model.
 *
 * The two questions this makes answerable, and neither was:
 *
 *   "Remember the function you wrote?"  — chat could not see one line of
 *   the Coding module, so the honest answer was no.
 *
 *   "Why did you do it that way?"       — the coding session that made
 *   the decision is a row the next request never loads, so the model
 *   would reconstruct a plausible reason rather than recall the real one.
 *
 * ===================== THE LIMIT IS THE FEATURE =====================
 *
 * ONLY THE RELEVANT, NEVER EVERYTHING. A chat request already sends
 * 20,725 characters (scripts/measure-context.mjs). Appending a user's
 * coding history to that is not a feature, it is a regression with a
 * changelog entry: the request doubles, the cost doubles, and the model's
 * attention is spent on fifty snippets to answer a question about one.
 *
 * So selection runs first, and it uses THE SAME matching rule as module
 * selection — questionWords and scoreTerms, imported from
 * context-relevance.ts rather than reimplemented, because two copies of
 * "fold, split, count whole words" is two things to drift.
 *
 * What differs from module selection is the POLICY, and it differs in the
 * direction that matters:
 *
 *   MODULE SELECTION HAS A FLOOR. It keeps at least six modules however
 *   narrow the question, because a question about sales is still asked by
 *   somebody whose business is all of them, and dropping context there
 *   can make an answer worse.
 *
 *   ITEM SELECTION HAS NO FLOOR AND STARTS AT ZERO. Nothing matching
 *   means nothing is added, and that is the correct answer — the chat
 *   request goes out byte-identical to what it was before this feature
 *   existed. Adding "here are three snippets you did not ask about"
 *   cannot improve an answer about last month's revenue, and it can
 *   distract one.
 *
 * Pure. No database, no clock, no SDK — so the build gate exercises every
 * branch and the character budget below is asserted rather than intended.
 */

/**
 * The hard ceiling on what cross-module context may add to ONE request.
 *
 * THE WHOLE BLOCK, HEADER INCLUDED. The first version of this budgeted
 * only the items and left the ~250-character header outside it, so a
 * "900-character budget" rendered 1,151 characters — 28% over, silently,
 * and the number in this comment was wrong. scripts/measure-context.mjs
 * printed the real figure and caught it. What the caller cares about is
 * what lands in the request, so that is what is counted.
 *
 * MEASURED AGAINST 20,725, which is what a chat request already sends
 * (same script). 900 characters is 4.3% of that; the brief's rule is
 * that this must not DOUBLE the context, and this is an order of
 * magnitude inside it.
 *
 * A BUDGET, NOT A TARGET. Most requests add nothing, because most
 * questions are not about code.
 */
export const MAX_CROSS_CONTEXT_CHARS = 900;

/** Per item, so one enormous snippet cannot spend the whole budget and
 *  leave no room for the two that were also relevant. */
export const MAX_ITEM_CHARS = 280;

/** Never more than this many items, whatever the budget allows. Four
 *  snippets is already more than anybody asked about; beyond that the
 *  model is choosing between them instead of using them. */
export const MAX_ITEMS = 4;

/**
 * The score an item must reach to be included at all.
 *
 * TWO, NOT ONE. One shared word is a coincidence — "the", "function" and
 * "code" appear in half of everything — and a threshold of one turns this
 * into "attach the four most recent items", which is the feature this is
 * explicitly not. Two independent terms is a claim about the same
 * subject.
 */
export const MIN_SCORE = 2;

/** Below this many characters a question carries too little to judge.
 *  "why?" is not a request for a specific past session. */
export const MIN_QUESTION_CHARS = 20;

export type ContextCandidate = {
  id: string;
  /** What this item is, in the words it would be recognised by: a title,
   *  a language, an operation, the first line of the code. Scored — never
   *  rendered. */
  terms: string[];
  /** What actually goes in the prompt if this item is chosen. */
  text: string;
  /** Newer wins ties. Nothing else uses it. */
  atMs: number;
};

export type CrossSelection = {
  chosen: ContextCandidate[];
  /** Why, in words, for the log and for a test to assert on. */
  reason: string;
  /** Characters the chosen items will add, INCLUDING the header. The
   *  number the budget is enforced against, so a caller cannot be
   *  surprised by one it did not compute the same way. */
  chars: number;
};

export type ContextKind = "coding" | "chat";

/**
 * The two headers, in one place so the selector can SIZE them and the
 * renderer can EMIT them without the two disagreeing.
 *
 * EACH SAYS WHAT IT IS, WHERE IT CAME FROM, AND WHAT IT IS NOT. A model
 * handed four code snippets with no frame treats them as part of the
 * user's current message; told they are the user's own earlier sessions,
 * it can say "the one you wrote on the 3rd" and can decline when they
 * turn out not to be the ones meant.
 *
 * The last sentence of each is load-bearing. Without it the model
 * answers "no, I have not written you any functions" when the four it
 * was given did not happen to include the one asked about — a confident
 * denial of something that did happen, which is worse than saying
 * nothing at all.
 */
const HEADERS: Record<ContextKind, string> = {
  coding:
    "FROM THIS USER'S OWN AI CODING SESSIONS — their earlier requests and what you produced. Refer to these as your own past work when they are what the user means, and say plainly when they are not. These are only the sessions matching this question, not all of them.",
  chat:
    "FROM THIS USER'S OWN CHAT WITH YOU — earlier turns relevant to this code. Use them to recall what was decided and why. These are only the turns matching this request, not the whole conversation.",
};

const EMPTY: CrossSelection = { chosen: [], reason: "nothing relevant", chars: 0 };

/**
 * Which past items this question is about.
 *
 * RETURNS NOTHING BY DEFAULT, and that is the answer for almost every
 * request. Every early return below is a case where adding context could
 * only be noise.
 */
export function selectCrossContext(params: {
  question: string;
  candidates: readonly ContextCandidate[];
  /** Which header this selection will be rendered under. Required,
   *  because the header counts against the budget and the two are
   *  different lengths — a selector that did not know which one it was
   *  budgeting for could only be right by luck. */
  kind: ContextKind;
  maxChars?: number;
  maxItems?: number;
  minScore?: number;
}): CrossSelection {
  // THE HEADER IS SPENT BEFORE THE FIRST ITEM IS CONSIDERED. It is not
  // optional and it is not free, so an item budget that ignores it is a
  // budget that is always wrong by the size of the header.
  const headerChars = HEADERS[params.kind].length + 1; // + the newline
  const maxChars = (params.maxChars ?? MAX_CROSS_CONTEXT_CHARS) - headerChars;
  const maxItems = params.maxItems ?? MAX_ITEMS;
  const minScore = params.minScore ?? MIN_SCORE;

  if (params.candidates.length === 0) return { ...EMPTY, reason: "no history" };

  const folded = foldForMatch(params.question ?? "");
  if (folded.length < MIN_QUESTION_CHARS) return { ...EMPTY, reason: "question too short to judge" };

  // FOLDED ONCE, REUSED. Folding is the expensive part of matching and
  // doing it inside the loop does it once per candidate.
  const words = questionWords(folded);
  if (words.size === 0) return { ...EMPTY, reason: "no words to match on" };

  const scored = params.candidates
    .map((item) => ({ item, score: scoreTerms(words, folded, item.terms) }))
    .filter((s) => s.score >= minScore)
    // Score first, then recency. Two items that are equally about the
    // question are ordered by which one the user last touched, because
    // that is the one they mean.
    .sort((a, b) => b.score - a.score || b.item.atMs - a.item.atMs);

  if (scored.length === 0) return { ...EMPTY, reason: "nothing scored above the threshold" };

  const chosen: ContextCandidate[] = [];
  // Starts at the header, so `chars` is the size of the BLOCK from the
  // first line of this loop and the caller never has to add anything to
  // it.
  let chars = headerChars;
  for (const { item } of scored) {
    if (chosen.length >= maxItems) break;
    const text = clamp(item.text, MAX_ITEM_CHARS);
    // "- " and the newline the renderer will add. Counted here so the
    // budget matches the rendered block exactly rather than approximately.
    const cost = text.length + 3;
    // THE BUDGET IS CHECKED BEFORE THE ITEM IS ADDED, never trimmed
    // after. A block truncated mid-snippet is a snippet that reads as
    // complete and is not, and the model has no way to know.
    if (chars + cost > (params.maxChars ?? MAX_CROSS_CONTEXT_CHARS)) break;
    chosen.push({ ...item, text });
    chars += cost;
  }

  if (chosen.length === 0) return { ...EMPTY, reason: "first relevant item did not fit the budget" };
  void maxChars;
  void chars;

  return {
    chosen,
    reason: `${chosen.length} of ${params.candidates.length} item(s) matched`,
    // MEASURED FROM THE RENDER, not re-derived from the parts.
    //
    // The loop above budgets conservatively — it charges every item a
    // newline, including the last one, which `join` does not emit. That
    // is the right direction for a CEILING (it can only refuse an item
    // that would have just fitted) and the wrong number to REPORT: it
    // was over by exactly one character per block, and a test comparing
    // the reported size to the rendered size caught it.
    //
    // So the ceiling stays conservative and the report is exact, from
    // the one function that knows how the block is assembled.
    chars: renderCrossContext({ chosen, reason: "", chars: 0 }, params.kind).length,
  };
}

function clamp(text: string, max: number): string {
  const t = (text ?? "").trim();
  return t.length > max ? `${t.slice(0, max - 1)}…` : t;
}

/**
 * The block that goes in the prompt.
 *
 * IT SAYS WHAT IT IS AND WHERE IT CAME FROM. A model handed four code
 * snippets with no frame will treat them as part of the user's current
 * message; told they are the user's own earlier sessions, it can say "the
 * one you wrote on the 3rd" and can decline when they turn out not to be
 * the ones meant.
 *
 * AND IT SAYS THE LIMIT OUT LOUD. Without the last line the model will
 * answer "no, I have not written you any functions" when the four it was
 * given did not happen to include the one asked about — which is worse
 * than saying nothing, because it is a confident denial of something that
 * happened.
 */
export function renderCrossContext(selection: CrossSelection, kind: ContextKind): string {
  if (selection.chosen.length === 0) return "";
  return `${HEADERS[kind]}\n${selection.chosen.map((c) => `- ${c.text}`).join("\n")}`;
}

/** The whole block's size, header included — what the caller budgets. */
export function crossContextChars(selection: CrossSelection, kind: ContextKind): number {
  return renderCrossContext(selection, kind).length;
}
