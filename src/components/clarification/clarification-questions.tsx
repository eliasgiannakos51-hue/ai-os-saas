"use client";

import { useState } from "react";

// Shared across every AI-generation entry point that runs the
// "needs clarification?" pre-check (see lib/clarification.ts) — Website
// Builder, Mission Control, Automations, Create Anything. Pure
// presentational + local answer state; the caller owns what happens on
// submit (always: resubmit the original request with answers appended
// and skipClarification: true, per lib/clarification.ts's
// appendClarificationAnswers).
export function ClarificationQuestions({
  questions,
  onAnswer,
  onSkip,
  submitting,
  title,
  skipLabel,
  continueLabel,
  answerPlaceholder,
}: {
  questions: string[];
  onAnswer: (answers: string[]) => void;
  onSkip: () => void;
  submitting: boolean;
  title: string;
  skipLabel: string;
  continueLabel: string;
  answerPlaceholder: string;
}) {
  const [answers, setAnswers] = useState<string[]>(() => questions.map(() => ""));

  return (
    <div className="space-y-3 rounded-2xl border border-orange-500/30 bg-orange-500/[0.04] p-4">
      <p className="text-sm font-semibold text-foreground">{title}</p>
      <div className="space-y-2.5">
        {questions.map((question, index) => (
          <div key={index}>
            <label className="mb-1 block text-xs font-medium text-muted">{question}</label>
            <input
              type="text"
              value={answers[index] ?? ""}
              onChange={(e) =>
                setAnswers((prev) => prev.map((a, i) => (i === index ? e.target.value : a)))
              }
              placeholder={answerPlaceholder}
              className="input text-sm"
              autoFocus={index === 0}
            />
          </div>
        ))}
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
