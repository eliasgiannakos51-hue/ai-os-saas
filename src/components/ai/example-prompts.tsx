"use client";

import { useTranslations } from "next-intl";
import { exampleKeys, type AiSurface } from "@/lib/ai/example-prompts";

/**
 * Three or four things this box actually accepts, pressable — and one line
 * saying what it will not do.
 *
 * WHY THE LIMITS LINE SITS HERE and not in a help article: the examples
 * raise expectations by design, and a raised expectation with nothing
 * bounding it is how somebody comes to believe the Website Builder makes
 * shops or that Agents can log into their accounting software. The two
 * halves are one component because shipping the encouraging half without
 * the honest half is the failure mode.
 *
 * EVERY LIMITS LINE IS CHECKED AGAINST THE CODE, not written to sound
 * modest. Files says it does not search the web because its handler sends
 * no tools; Deep Research says it cannot see your files because it has
 * web_search and no file access; Agents says it sends only where you chose
 * because the delivery target is resolved from the owner's own rows. A
 * reassuring sentence that is not true is worse than no sentence, because
 * this is the one place a user decides what to trust the product with.
 */
export function ExamplePrompts({
  surface,
  onPick,
  className = "",
}: {
  surface: AiSurface;
  /** Fills the input. The caller decides which input — this component
   *  deliberately does not reach for one, so the same chips work above a
   *  textarea, inside a wizard step and in a chat composer. */
  onPick: (example: string) => void;
  className?: string;
}) {
  const t = useTranslations(`aiExamples.${surface}`);
  const tCommon = useTranslations("common");
  const examples = exampleKeys(surface).map((key) => t(key));

  return (
    <div className={`space-y-1.5 ${className}`} data-testid={`examples-${surface}`}>
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="text-[11px] text-muted">{tCommon("examplesLabel")}</span>
        {examples.map((example) => (
          <button
            key={example}
            type="button"
            data-testid="ai-example"
            onClick={() => onPick(example)}
            // 36px rather than the 30px Files used: this is a real touch
            // target on a phone, and it is the first thing a new user is
            // invited to press.
            className="inline-flex min-h-[36px] items-center rounded-full border border-border px-3 py-1 text-[11px] leading-tight text-muted transition-colors duration-150 hover:border-orange-500/50 hover:text-orange-300"
          >
            {example}
          </button>
        ))}
      </div>
      <p data-testid="ai-limits" className="text-[11px] leading-relaxed text-muted/80">
        {t("limits")}
      </p>
    </div>
  );
}
