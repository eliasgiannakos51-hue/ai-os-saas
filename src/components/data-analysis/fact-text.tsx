"use client";

import { Fragment, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { formatFact, type Fact, type TextPart } from "@/lib/data-analysis/facts";

/**
 * A FINDING'S WORDS WITH ITS NUMBERS PRESSABLE (package 16, behind the
 * switch "analysis-provenance"). Every number in `parts` is a fact
 * computed from the file (lib/data-analysis/facts.ts); pressing it says,
 * under the sentence, what it is and over how many rows.
 */
export function FactText({ parts, facts }: { parts: readonly TextPart[]; facts: readonly Fact[] }) {
  const locale = useLocale();
  const explain = useExplainFact();
  const [open, setOpen] = useState<string | null>(null);
  const byId = new Map(facts.map((f) => [f.id, f]));
  const shown = open ? byId.get(open) : undefined;
  return (
    <>
      {parts.map((part, i) => {
        if ("text" in part) return <Fragment key={i}>{part.text}</Fragment>;
        const fact = byId.get(part.fact);
        if (!fact) return null;
        return (
          <button
            key={i}
            type="button"
            data-testid="fact"
            data-fact={fact.id}
            aria-expanded={open === fact.id}
            onClick={() => setOpen((v) => (v === fact.id ? null : fact.id))}
            className="font-medium text-foreground underline decoration-dotted underline-offset-4"
          >
            {formatFact(fact, locale)}
          </button>
        );
      })}
      {shown ? (
        <span data-testid="fact-how" className="mt-1 block text-[11px] text-muted" aria-live="polite">
          {formatFact(shown, locale)} — {explain(shown)}
        </span>
      ) : null}
    </>
  );
}

/** "The sum of the column «Έσοδα» (rows with a value: 7)." — in the reader's language. */
export function useExplainFact(): (fact: Fact) => string {
  const t = useTranslations("dataAnalysis.how");
  return (fact) =>
    t(fact.kind, {
      column: fact.column ?? "",
      other: fact.other ?? "",
      label: fact.label ?? "",
      rows: fact.rows ?? 0,
    });
}
