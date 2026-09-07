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
 * How many questions a user may be asked at once. ONE.
 *
 * It was three, and the comment defending three said "a fourth stops
 * reading like 'one moment' and starts reading like a form". That
 * reasoning is right and the number was wrong: three questions with
 * suggested answers under each is already a form. The user came here to
 * get something done and is being handed a questionnaire.
 *
 * ONE question is a conversation. It also forces the model to pick the
 * detail that actually changes the outcome instead of listing everything
 * it noticed, which is a better question than any of the three would have
 * been on its own — the prompt already says to ask only about things that
 * would materially change the result, and a budget of one is what makes
 * that instruction bite.
 *
 * THIS CHANGES FOUR EXISTING SURFACES, not just chat: Website Builder,
 * Mission Control, Automations and Create Anything all trimmed to three
 * and now trim to one. That is the intended change and it is one number
 * to revert if it turns out a website brief genuinely needs more.
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
