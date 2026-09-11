import { Check } from "lucide-react";
import { useTranslations } from "next-intl";
import { STEP_FLOWS, type FlowName } from "@/lib/ui/step-flows";

/**
 * THE PROGRESS SHAPE, ONE OF THEM, FOR ALL FOUR FLOWS.
 *
 * A numbered row: done steps carry a tick, the step you are on carries
 * the accent, the rest are grey. It wraps instead of scrolling, because
 * five steps and a Greek or Arabic label do not fit 390px in a line and
 * a progress indicator that needs scrolling to be read has stopped being
 * one.
 *
 * NO FILLED ACCENT ANYWHERE IN HERE, deliberately. The current step is a
 * 15% wash and accent text; the screen's one filled control is its
 * primary action and this must not compete with it — see
 * scripts/tests/one-primary-action.test.mjs, which counts exactly that.
 * For the same reason there is no border on any part of it: the border
 * census in design-density.test.mjs is a ceiling with no slack, and a
 * decoration is not what should spend it.
 *
 * `current` is an index into the flow. Steps before it are done.
 */
export function StepFlow({ flow, current }: { flow: FlowName; current: number }) {
  const t = useTranslations("stepFlow");
  const steps = STEP_FLOWS[flow];
  return (
    <div className="mb-4" data-testid={`step-flow-${flow}`}>
      <ol
        aria-label={t("label")}
        className="flex flex-wrap items-center gap-x-2 gap-y-1.5 text-xs"
      >
        {steps.map((step, i) => {
          const done = i < current;
          const here = i === current;
          return (
            <li key={step} className="flex items-center gap-1.5" aria-current={here ? "step" : undefined}>
              {i > 0 && <span className="me-1 h-px w-3 bg-border" aria-hidden="true" />}
              <span
                className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold ${
                  here ? "bg-orange-500/15 text-orange-300" : "bg-panel-hover text-muted"
                }`}
                aria-hidden="true"
              >
                {done ? <Check className="h-3 w-3" /> : i + 1}
              </span>
              <span className={here ? "font-semibold text-foreground" : "text-muted"}>
                {t(`steps.${step}`)}
              </span>
            </li>
          );
        })}
      </ol>
      {/* ONE LINE, FOR THE STEP YOU ARE ON. This is what the Files page
          already had and the other three did not: the report that made
          Files grow a step list was "I do not understand how it works
          and I cannot ask a question", and the part that answered it was
          the hint under each step, not the numbers. Only the current
          one is shown — five hints at once is the wall of text the
          numbers were supposed to replace. */}
      <p className="mt-1.5 text-xs text-muted">{t(`hints.${steps[current] ?? steps[0]}`)}</p>
    </div>
  );
}
