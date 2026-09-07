// Pure, no-I/O logic shared between server routes and client components —
// deliberately WITHOUT the "server-only" guard lib/clarification.ts has
// (that guard blocks any client-side import, even of code that has
// nothing to do with the actual Anthropic call). lib/clarification.ts
// re-exports everything here so server code has one place to import from.
import { truncate } from "@/lib/text/truncate";
export type ClarificationKind = "website" | "mission" | "automation" | "create" | "agent";

export type ClarificationCheckResult =
  | {
      needsClarification: true;
      questions: string[];
      /**
       * Answers the user can click instead of typing, aligned by index
       * with `questions` — ALWAYS the same length, so `suggestions[i]`
       * belongs to `questions[i]` and never to its neighbour. A question
       * the model offered nothing for gets an empty array rather than
       * being missing, because a shorter array is how index alignment
       * silently becomes an off-by-one that shows one question's options
       * under another.
       */
      suggestions: string[][];
    }
  | { needsClarification: false };

/**
 * How many questions a user may be asked at once, PER SURFACE.
 *
 * It was a single 3, defended by a comment saying a fourth "starts
 * reading like a form". The reasoning was right and one number for five
 * different surfaces was wrong in both directions: three is a form
 * everywhere, and one is too few in exactly one place.
 *
 * THE NUMBER IS THE COUNT OF UNKNOWNS THE SURFACE CANNOT DEFAULT.
 * Everything a surface can pick a sensible default for is not a question,
 * it is a default; what is left is what has to be asked. So each entry
 * below carries the reason for its own number, and a surface that gains
 * or loses an unknown changes its number here rather than acquiring an
 * exception somewhere else.
 */
export const CLARIFICATION_QUESTION_CAP: Record<ClarificationKind, number> = {
  // TWO. A website brief carries four unknowns that no default covers —
  // what the business actually is, which pages it needs, whether it takes
  // form submissions, and whether there are photographs to use. One
  // question cannot reach two of those, and the result of guessing is a
  // whole generated site that is wrong rather than one paragraph. Two is
  // the point where the model has to pick the two that matter instead of
  // listing what it noticed.
  website: 2,
  // ONE, everywhere else. Each of these has a single dominant unknown
  // and a cheap failure: a plan, an automation, an agent or a chat answer
  // that misses is one artefact to redo, not a site to rebuild. A second
  // question here buys less than it costs in the reading of it.
  mission: 1,
  automation: 1,
  create: 1,
  agent: 1,
};

/**
 * The cap for a surface. A kind with no entry gets the strictest number
 * rather than the most generous one — a new surface should have to argue
 * for a second question, not inherit it.
 */
export function questionCapFor(kind: ClarificationKind): number {
  return CLARIFICATION_QUESTION_CAP[kind] ?? 1;
}

/**
 * The default when no kind is known — the parser is callable without one
 * (see parseClarificationResult), and the safe answer there is the
 * strictest cap rather than the widest.
 */
export const MAX_CLARIFICATION_QUESTIONS = 1;
/** Suggestions per question. Enough to cover the common answers without
 *  turning a question into a menu the user has to read carefully. */
const MAX_SUGGESTIONS_PER_QUESTION = 4;
const MAX_QUESTION_LENGTH = 200;
const MAX_SUGGESTION_LENGTH = 60;

/**
 * One question as the model may return it: either a bare string (the
 * shape this used to be) or an object carrying clickable answers.
 *
 * BOTH ARE ACCEPTED ON PURPOSE. A background job that finished before
 * this deploy has `questions: ["…"]` sitting in its result, and since
 * finished-but-unseen jobs are now offered back to the user for 24 hours
 * (lib/jobs/resumable.ts) that old shape can still arrive at a screen
 * running the new code. Refusing it would turn a resumed build into a
 * blank panel.
 */
type RawQuestion = string | { question?: unknown; suggestions?: unknown };

function cleanText(value: unknown, maxLength: number): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  // The NULL is this function's own contract — "there was nothing here"
  // is different from "here is an empty string". The CUT is shared: see
  // lib/text/truncate.ts, and the seven copies that disagreed about it.
  return truncate(trimmed, maxLength);
}

// Pure, deterministic interpretation of the tool_use input — separated
// from the Anthropic call itself so it's unit-testable without a live API
// call, same split as lib/website-builder.ts's parseWebsiteClassification.
export function parseClarificationResult(
  input: {
    needsClarification?: unknown;
    questions?: unknown;
  },
  /**
   * How many questions to keep. Defaults to the product's cap.
   *
   * A PARAMETER, because parsing and policy are different jobs. This
   * function's other work — accepting both question shapes, keeping
   * suggestions aligned by index, dropping blanks, truncating — can only
   * be demonstrated on more than one question, and with the cap hard-wired
   * at one those behaviours became untestable the moment the cap changed.
   * Wiring them together would have meant either a weaker parser test or a
   * cap that is not the product's.
   */
  maxQuestions: number = MAX_CLARIFICATION_QUESTIONS
): ClarificationCheckResult {
  if (input.needsClarification !== true) return { needsClarification: false };

  const raw: RawQuestion[] = Array.isArray(input.questions) ? (input.questions as RawQuestion[]) : [];
  const questions: string[] = [];
  const suggestions: string[][] = [];

  for (const entry of raw) {
    if (questions.length >= maxQuestions) break;
    const text = cleanText(typeof entry === "string" ? entry : entry?.question, MAX_QUESTION_LENGTH);
    if (!text) continue;
    const offered =
      typeof entry === "string" || !Array.isArray(entry?.suggestions)
        ? []
        : (entry.suggestions as unknown[])
            .map((s) => cleanText(s, MAX_SUGGESTION_LENGTH))
            .filter((s): s is string => s !== null)
            // A suggestion repeated twice is two identical buttons, which
            // reads as a bug rather than as a choice.
            .filter((s, i, all) => all.indexOf(s) === i)
            .slice(0, MAX_SUGGESTIONS_PER_QUESTION);
    questions.push(text);
    suggestions.push(offered);
  }

  // A "needs clarification" verdict with no actual questions is not
  // actionable — treat it the same as false rather than showing the user
  // an empty prompt.
  if (questions.length === 0) return { needsClarification: false };
  return { needsClarification: true, questions, suggestions };
}

/**
 * The suggestions for a set of questions, from whatever a job result
 * happens to carry.
 *
 * Every screen that renders questions reads them through here, so a
 * result written before suggestions existed — or one whose suggestions
 * array drifted out of step with its questions — renders as questions
 * with no chips rather than as chips under the wrong question.
 */
export function alignSuggestions(questions: string[], raw: unknown): string[][] {
  const source = Array.isArray(raw) ? raw : [];
  return questions.map((_, index) => {
    const entry = source[index];
    if (!Array.isArray(entry)) return [];
    return entry
      .map((s) => cleanText(s, MAX_SUGGESTION_LENGTH))
      .filter((s): s is string => s !== null)
      .slice(0, MAX_SUGGESTIONS_PER_QUESTION);
  });
}

// Shared formatting for "resubmit with answers appended" — every route
// uses this exact shape so a user's answers are folded back into the
// original text the same way everywhere, and so the second-pass request
// (skipClarification: true) reads naturally to the generation call that
// receives it. Used client-side (each workspace component) to build the
// resubmitted description/goal/message.
export function appendClarificationAnswers(
  originalText: string,
  questions: string[],
  answers: string[]
): string {
  const qa = questions
    .map((q, i) => (answers[i]?.trim() ? `Q: ${q}\nA: ${answers[i].trim()}` : null))
    .filter((line): line is string => line !== null);
  if (qa.length === 0) return originalText;
  return `${originalText}\n\nAdditional details:\n${qa.join("\n")}`;
}
