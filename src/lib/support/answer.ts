import "server-only";
import { buildPlanFacts, PRODUCT_FACTS } from "@/lib/support/facts";
import { NO_ANSWER_MARKER } from "@/lib/support/grounding";
import { MAX_QUESTION_CHARS } from "@/lib/support/limits";
import type { HelpArticle } from "@/lib/support/rank";

// Re-exported so server-side callers need one import; the constant itself
// lives in the client-safe module because the widget's input shares it.
export { MAX_QUESTION_CHARS };

// The support assistant's prompt and its grounding material, assembled in
// one place so the string the model is shown and the string the grounding
// check searches are provably the same object.
//
// THAT IS THE WHOLE POINT. If the prompt were built here and the check ran
// against a separately-rebuilt copy, the two could drift and a "grounded"
// verdict would stop meaning anything. buildSupportContext returns the one
// text; the route passes it to Anthropic and to checkGrounding without
// touching it in between.

export const SUPPORT_MODEL = "claude-sonnet-4-6";
export const SUPPORT_MAX_OUTPUT_TOKENS = 500;

/** Everything the assistant is allowed to know, as one block of text. */
export function buildSupportContext(articles: HelpArticle[]): string {
  const parts = [PRODUCT_FACTS, buildPlanFacts()];
  for (const article of articles) {
    parts.push(`HELP ARTICLE — ${article.title}\n${article.body}`);
  }
  return parts.join("\n\n---\n\n");
}

/**
 * The system prompt.
 *
 * It says "only from the material" because that helps. It is not what
 * MAKES it true — lib/support/grounding.ts is, by throwing the answer away
 * when it isn't. The prompt's real job is to make the NO_ANSWER path
 * attractive, so the common case for a question we cannot answer is a
 * clean refusal rather than a confident guess that then gets binned.
 */
export function supportSystemPrompt(language: string): string {
  return `You are the support assistant for Ionexa AI. You answer questions about Ionexa itself — what it does, how a feature works, what a plan includes, how billing or privacy works.

ANSWER ONLY FROM THE MATERIAL YOU ARE GIVEN.

- If the material answers the question, answer it in two or three short sentences. Plain language, no marketing, no lists unless the question is genuinely a list.
- If the material does not answer it — or answers it only partly, or you would have to estimate a number, a price, a limit or a date — reply with exactly ${NO_ANSWER_MARKER} and nothing else.
- Never state a price, a credit amount, a limit or any other number that is not written in the material. If you find yourself about to work one out, reply ${NO_ANSWER_MARKER} instead.
- Never say Ionexa can do something the material does not say it does. "I don't know" is a good answer here; a confident wrong one is not.
- Do not apologise, do not pad, do not offer to help further. The interface handles that.

Reply in ${language}.`;
}

/**
 * What the user sees when the assistant will not answer.
 *
 * Deliberately NOT model-generated: the one moment the system has decided
 * it cannot be trusted to write prose is not the moment to ask it for
 * some. The wording comes from the translated UI string, and this function
 * only decides that the escalation path is what happens next.
 */
export type SupportOutcome =
  | { kind: "answer"; text: string; sources: { slug: string; title: string }[] }
  | { kind: "escalate"; reason: string };
