"use client";

import { estimateForAction, type ActionProfileKey } from "@/lib/billing/estimate";
import { needsLargeActionConfirmation } from "@/lib/billing/credit-formula";
import { DEFAULTS } from "@/lib/billing/pricing-config";
import { WEBSITE_BUILDER_MODEL } from "@/lib/ai-models";
import { useCredits } from "@/components/credits/credits-context";

/**
 * THE HOOK, APART FROM THE DIALOG THAT SHARED ITS FILE.
 *
 * Shared pre-submit estimate, so "how much will this cost me" is answered
 * before the user commits rather than after they are billed.
 * `accountCreditPriceEur` comes from the server (see /api/credits/balance)
 * because a credit is not worth the same on every plan: the same
 * generation charges 26 credits on Free and 64 on Ultimate. Estimating
 * with the list price — which is what the Website Builder did — showed
 * Ultimate users less than half the real number.
 *
 * WHY IT MOVED OUT OF cost-estimate.tsx. That file also exports a
 * confirmation dialog with a filled orange button in it, and
 * scripts/tests/one-primary-action.test.mjs counts accent controls by
 * walking the import graph from a page. Importing the HOOK on Home
 * therefore added the DIALOG's button to Home's census — a control that
 * cannot be on screen at the same time as the thing that pulled it in.
 * Splitting the hook out is the honest fix; raising Home's baseline to
 * cover a button it never draws would have been the other kind.
 */
export function useCostEstimate(
  action: ActionProfileKey,
  params: { inputChars: number; imageCount?: number }
) {
  const { accountCreditPriceEur, planSlug } = useCredits();
  const estimate = estimateForAction(
    action,
    {
      model: WEBSITE_BUILDER_MODEL,
      inputChars: params.inputChars,
      imageCount: params.imageCount,
      planSlug,
    },
    DEFAULTS,
    accountCreditPriceEur ?? undefined
  );
  return {
    credits: estimate.estimatedCredits,
    needsConfirmation: needsLargeActionConfirmation(estimate.estimatedCredits, DEFAULTS),
  };
}
