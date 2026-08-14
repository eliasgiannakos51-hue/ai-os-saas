"use client";

import { useState } from "react";

// Shared across every AI-generation entry point that runs the
// "needs clarification?" pre-check (see lib/clarification.ts) — Website
// Builder, Mission Control, Automations, Create Anything, Agents. Pure
// presentational + local answer state; the caller owns what happens on
// submit (always: resubmit the original request with answers appended
// and skipClarification: true, per lib/clarification.ts's
// appendClarificationAnswers).
//
// SUGGESTED ANSWERS ARE WHY ANYONE ANSWERS AT ALL. A clarifying question
// that arrives as an empty text box asks the user to do more work than
// the vague request did — so it gets skipped, and a question everybody
// skips has not been asked. A tappable answer turns "how often should it
// run?" into one press, which is the difference between a check that
// improves the result and a check that only adds a step.
export function ClarificationQuestions({
  questions,
  suggestions,
  onAnswer,
  onSkip,
  submitting,
  title,
  skipLabel,
  continueLabel,
  answerPlaceholder,
}: {
  questions: string[];
  /** Aligned by index with `questions`. Optional, and short arrays are
   *  fine: a question with nothing offered simply gets no chips, which is
   *  exactly how this behaved before suggestions existed. */
  suggestions?: string[][];
  onAnswer: (answers: string[]) => void;
  onSkip: () => void;
  submitting: boolean;
  title: string;
  skipLabel: string;
  continueLabel: string;
  answerPlaceholder: string;
}) {
  const [answers, setAnswers] = useState<string[]>(() => questions.map(() => ""));

  function setAnswer(index: number, value: string) {
    setAnswers((prev) => prev.map((a, i) => (i === index ? value : a)));
  }

  return (
    <div className="space-y-3 rounded-2xl border border-orange-500/30 bg-orange-500/[0.04] p-4">
      <p className="text-sm font-semibold text-foreground">{title}</p>
      <div className="space-y-3">
        {questions.map((question, index) => {
          const options = suggestions?.[index] ?? [];
          const answer = answers[index] ?? "";
          return (
            <div key={index}>
              <label htmlFor={`clarify-${index}`} className="mb-1 block text-xs font-medium text-muted">
                {question}
              </label>
              <input
                id={`clarify-${index}`}
                type="text"
                value={answer}
                onChange={(e) => setAnswer(index, e.target.value)}
                placeholder={answerPlaceholder}
                className="input text-sm"
                autoFocus={index === 0}
              />
              {options.length > 0 && (
                <div className="mt-1.5 flex flex-wrap gap-1.5">
                  {options.map((option) => {
                    const chosen = answer === option;
                    return (
                      <button
                        key={option}
                        type="button"
                        // Pressing the chosen one again clears it, so a
                        // mis-tap is undone the same way it was made
                        // rather than by hunting for the text and
                        // deleting it.
                        onClick={() => setAnswer(index, chosen ? "" : option)}
                        aria-pressed={chosen}
                        disabled={submitting}
                        className={`inline-flex min-h-[36px] items-center rounded-full border px-3 py-1 text-xs transition-colors duration-150 disabled:opacity-50 ${
                          chosen
                            ? "border-orange-500 bg-orange-500/15 font-medium text-orange-300"
                            : "border-border text-muted hover:border-orange-500/50 hover:text-foreground"
                        }`}
                      >
                        {option}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => onAnswer(answers)}
          disabled={submitting}
          className="inline-flex min-h-[36px] items-center justify-center rounded-lg bg-orange-500 px-4 py-1.5 text-xs font-semibold text-black transition-all duration-200 hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {continueLabel}
        </button>
        {/* ALWAYS PRESENT, never conditional. A question the user cannot
            decline is a wall, and this check exists to improve a result,
            not to gate it. Skipping resubmits the original request
            unchanged. */}
        <button
          type="button"
          onClick={onSkip}
          disabled={submitting}
          className="inline-flex min-h-[36px] items-center justify-center rounded-lg border border-border px-4 py-1.5 text-xs font-medium text-muted transition-colors duration-150 hover:text-foreground disabled:cursor-not-allowed disabled:opacity-50"
        >
          {skipLabel}
        </button>
      </div>
    </div>
  );
}
