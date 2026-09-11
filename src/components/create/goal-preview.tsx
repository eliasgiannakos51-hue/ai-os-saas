"use client";

import { useTranslations } from "next-intl";
import { ArrowRight, Pencil, Zap } from "lucide-react";
import { PRODUCER_SPECS, type ProducerKey } from "@/lib/create-studio/producer-routes";

/**
 * WHAT IT WILL DO, BEFORE IT DOES IT.
 *
 * Redesign phase 1 Γ. The Home field can now recognise six producers for
 * free (lib/create-studio/producer-routes.ts), and recognising is not
 * permission: a person who typed "θέλω e-shop" has not agreed to open the
 * Website Builder, and certainly not to spend anything there.
 *
 * So nothing moves until this card is answered. It names the destination
 * with THE SIDEBAR'S OWN KEY — the same words the menu uses, in the same
 * language — because a receipt that invents a second name for a place is
 * how "Goals & Plans" became "Mission Control" in a confirmation.
 *
 * THE NUMBER IS AN ESTIMATE OF THE DESTINATION'S OWN ACTION, and the card
 * says so: pressing "Yes" navigates and fills the box, it does not spend.
 * The credits go when the person presses the button on the page they land
 * on, which is where the same estimator is shown again. Printing a figure
 * here and charging a different one there is the drift this shares one
 * calculation to avoid.
 */
export function GoalPreview({
  producer,
  credits,
  onConfirm,
  onChange,
}: {
  producer: ProducerKey;
  /** From useCostEstimate on the destination's own profile; 0 means the
   *  destination charges nothing on arrival AND nothing on its button. */
  credits: number;
  onConfirm: () => void;
  onChange: () => void;
}) {
  const t = useTranslations("dashboard.goal");
  const tKey = useTranslations();
  const destination = tKey(PRODUCER_SPECS[producer].destinationKey);

  return (
    <div className="mb-3 rounded-2xl border border-orange-500/30 bg-panel p-4" role="status" aria-live="polite">
      <p className="text-sm text-foreground">{t("willOpen", { destination })}</p>
      <p className="mt-1 flex items-center gap-1.5 text-xs text-muted">
        <Zap className="h-3 w-3 text-orange-400/70" aria-hidden="true" />
        {credits > 0 ? t("costsThere", { credits }) : t("freeThere")}
      </p>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={onConfirm}
          className="inline-flex min-h-[44px] items-center gap-2 rounded-lg bg-orange-500 px-4 text-sm font-semibold text-black hover:bg-orange-400"
        >
          <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
          {t("confirm")}
        </button>
        <button
          type="button"
          onClick={onChange}
          className="inline-flex min-h-[44px] items-center gap-2 rounded-lg border border-border px-4 text-sm font-medium text-foreground"
        >
          <Pencil className="h-3.5 w-3.5" aria-hidden="true" />
          {t("change")}
        </button>
      </div>
    </div>
  );
}

/**
 * THE ONE QUESTION, and there is only ever one.
 *
 * Two cases reach it and neither costs anything: the free ambiguity
 * reader (lib/ai/ambiguity.ts) said the request is too thin to act on, or
 * the free producer matcher found TWO producers named in one sentence.
 * Both are answered here, in the box the person is already looking at,
 * and neither has made a model call to get this far.
 */
export function GoalQuestion({
  choices,
  onPick,
  onDismiss,
}: {
  /** Empty when the request was merely vague — then there is nothing to
   *  pick and the only answer is to say more. */
  choices: ProducerKey[];
  onPick: (producer: ProducerKey) => void;
  onDismiss: () => void;
}) {
  const t = useTranslations("dashboard.goal");
  const tKey = useTranslations();

  return (
    <div className="mb-3 surface-tight" role="status" aria-live="polite">
      <p className="text-sm text-foreground">{choices.length > 0 ? t("which") : t("vague")}</p>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        {choices.map((key) => (
          <button
            key={key}
            type="button"
            onClick={() => onPick(key)}
            className="inline-flex min-h-[44px] items-center rounded-lg border border-border px-3 text-sm font-medium text-foreground hover:border-orange-500/60"
          >
            {tKey(PRODUCER_SPECS[key].destinationKey)}
          </button>
        ))}
        <button
          type="button"
          onClick={onDismiss}
          className="inline-flex min-h-[44px] items-center rounded-lg px-3 text-sm text-muted hover:text-foreground"
        >
          {t("dismiss")}
        </button>
      </div>
    </div>
  );
}
