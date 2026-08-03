// Pure, no-I/O logic shared between server routes and client components —
// deliberately WITHOUT the "server-only" guard lib/clarification.ts has
// (that guard blocks any client-side import, even of code that has
// nothing to do with the actual Anthropic call). lib/clarification.ts
// re-exports everything here so server code has one place to import from.
export type ClarificationKind = "website" | "mission" | "automation" | "create";

export type ClarificationCheckResult =
  | { needsClarification: true; questions: string[] }
  | { needsClarification: false };

// Pure, deterministic interpretation of the tool_use input — separated
// from the Anthropic call itself so it's unit-testable without a live API
// call, same split as lib/website-builder.ts's parseWebsiteClassification.
export function parseClarificationResult(input: {
  needsClarification?: unknown;
  questions?: unknown;
}): ClarificationCheckResult {
  if (input.needsClarification !== true) return { needsClarification: false };
  const questions = Array.isArray(input.questions)
    ? input.questions.filter((q): q is string => typeof q === "string" && q.trim().length > 0).slice(0, 3)
    : [];
  // A "needs clarification" verdict with no actual questions is not
  // actionable — treat it the same as false rather than showing the user
  // an empty prompt.
  if (questions.length === 0) return { needsClarification: false };
  return { needsClarification: true, questions };
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
