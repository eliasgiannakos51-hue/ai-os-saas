"use client";

import { useTranslations } from "next-intl";
import { Zap } from "lucide-react";
import { useRipple } from "@/hooks/use-ripple";

/**
 * Shared pre-submit estimate, so "how much will this cost me" is answered
 * before the user commits rather than after they are billed.
 *
 * `accountCreditPriceEur` comes from the server (see /api/credits/balance)
 * because a credit is not worth the same on every plan: the same
 * generation charges 26 credits on Free and 64 on Ultimate. Estimating
 * with the list price — which is what the Website Builder did — showed
 * Ultimate users less than half the real number.
 */
// The hook now lives in ./use-cost-estimate, so a caller that wants
// only the number does not drag this file's dialog into its page — see
// the note there. Re-exported here because every existing import points
// at this path.
export { useCostEstimate } from "@/components/credits/use-cost-estimate";

/** Small "~N credits" hint, meant to sit directly under a submit button. */
export function CostEstimateHint({ credits }: { credits: number }) {
  const t = useTranslations("credits.estimate");
  if (credits <= 0) return null;
  return (
    <p className="mt-1.5 flex items-center gap-1.5 text-[11px] text-muted">
      <Zap className="h-3 w-3 text-foreground/70" aria-hidden="true" />
      {t("approx", { count: credits })}
    </p>
  );
}

/**
 * Confirmation for an action above LARGE_ACTION_CONFIRM_THRESHOLD.
 *
 * ABOVE THE WORK PANE. On a phone a tool's work covers the screen at
 * z-[60] (components/shell/tool-shell.tsx); at z-50 this sat underneath
 * it, so a large action asked a question nobody could see or answer —
 * found on the Image tool's largest size (image-studio.prodtest.mjs,
 * 2026-10-07).
 *
 * Deliberately blocking: the threshold exists because spending 50+ credits
 * by accident is the kind of surprise that loses trust, and an undoable
 * charge deserves an explicit yes.
 */
export function LargeActionConfirm({
  credits,
  onConfirm,
  onCancel,
}: {
  credits: number;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const t = useTranslations("credits.estimate");
  const ripple = useRipple();

  return (
    <div
      className="overlay-fade-in fixed inset-0 z-[70] flex items-center justify-center bg-background/70 p-4"
      role="dialog"
      aria-modal="true"
    >
      <div className="panel-pop-in w-full max-w-sm surface">
        <div className="flex items-center gap-2.5">
          <span className="flex h-9 w-9 items-center justify-center rounded-card bg-foreground/15 text-foreground">
            <Zap className="h-4 w-4" aria-hidden="true" />
          </span>
          <p className="text-sm font-semibold text-foreground">{t("confirmTitle")}</p>
        </div>
        <p className="mt-3 text-xs leading-relaxed text-muted">
          {t("confirmBody", { count: credits })}
        </p>
        <div className="mt-5 flex gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="min-h-[44px] flex-1 rounded-item border border-border px-4 py-2 text-sm font-medium text-foreground transition-colors duration-200 hover:border-foreground/50"
          >
            {t("cancel")}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            onMouseDown={ripple}
            className="ripple-host min-h-[44px] flex-1 rounded-item bg-button px-4 py-2 text-sm font-semibold text-button-ink transition-all duration-200 hover:opacity-90"
          >
            {t("continue")}
          </button>
        </div>
      </div>
    </div>
  );
}
