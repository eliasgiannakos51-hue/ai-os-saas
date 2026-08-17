import { JOB_STEPS, type JobKind } from "@/lib/jobs/job-types";

/**
 * What an AI action is doing right now, as a code.
 *
 * Background jobs already had this: JOB_STEPS names the real stages a
 * worker passes through, the worker writes the index as it finishes each
 * one, and the Files workspace translates the code at the moment the user
 * is waiting. That was the only place it existed. Every other AI action in
 * the app — asking a question about a record, rewriting a selection,
 * classifying free text in Create, suggesting links, generating a site —
 * showed a rotating circle and nothing else.
 *
 * A spinner says "something is happening". It cannot say WHAT, so it also
 * cannot say "this one takes a while because it is reading forty pages",
 * which is the difference between waiting and giving up.
 *
 * THE HONESTY RULE, inherited from JOB_STEPS and worth restating because
 * it is easy to break here: a step is shown because the work reached it,
 * never because time passed. For a background job the worker reports the
 * index. For a single request with no progress reporting, the FIRST step
 * is shown for the whole wait — "Looking for the information" for four
 * seconds is true; walking it through three stages on a timer is a
 * progress bar that keeps moving after the request has already failed.
 * `stepsFor` therefore returns the list, and the caller advances only on
 * something real (a stream event, a poll, a response).
 */

export const AI_STEP_CODES = [
  "understanding",
  "searching",
  "reading",
  "planning",
  "drafting",
  "creating",
  "generating",
  "working",
  "answering",
  "rewriting",
  "summarising",
  "checking",
  "saving",
  "delivering",
  "publishing",
] as const;

export type AiStepCode = (typeof AI_STEP_CODES)[number];

/**
 * The AI actions that are NOT background jobs — a single request the user
 * waits on — and the stages each of them genuinely has.
 *
 * Where a list has more than one entry, the caller has something real to
 * advance on: a streamed response emits its first token (understanding ->
 * answering), an upload finishes before extraction starts. Where it has
 * one, one is the truth.
 */
export const AI_ACTION_STEPS = {
  /** Asking a question about the records in a module. */
  recordsAsk: ["searching", "answering"],
  /** Asking a question about uploaded files, outside the job path. */
  documentsAsk: ["reading", "answering"],
  /** Rewrite / shorten / expand on a selection. */
  textAction: ["rewriting"],
  /** Create Studio working out what the user typed actually is. */
  createDetect: ["understanding"],
  /** Free-text chat, which streams. */
  chat: ["understanding", "answering"],
  /** Knowledge-graph link suggestions. */
  linkSuggest: ["searching"],
  /** A weekly reflection. */
  reflection: ["reading", "drafting"],
  /** Turning a template into real records. */
  template: ["creating", "saving"],
  /** Pushing a generated site live. */
  publish: ["publishing"],
  /** Regenerating part of a site. */
  websiteEdit: ["generating", "checking"],
} as const satisfies Record<string, readonly AiStepCode[]>;

export type AiActionKind = keyof typeof AI_ACTION_STEPS;

/**
 * The steps for anything that reports progress, job or not — so a caller
 * does not need to know which of the two it is holding.
 */
export function stepsFor(kind: AiActionKind | JobKind): readonly string[] {
  if (kind in AI_ACTION_STEPS) return AI_ACTION_STEPS[kind as AiActionKind];
  return JOB_STEPS[kind as JobKind] ?? [];
}

/** Every code either source can produce, for the translation-coverage test. */
export function allStepCodes(): string[] {
  const codes = new Set<string>();
  for (const list of Object.values(AI_ACTION_STEPS)) for (const c of list) codes.add(c);
  for (const list of Object.values(JOB_STEPS)) for (const c of list) codes.add(c);
  return [...codes].sort();
}
