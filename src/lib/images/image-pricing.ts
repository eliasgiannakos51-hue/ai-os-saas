import { creditsForRealCostOnAccount, usdToEur } from "@/lib/billing/credit-formula";
import { resolveMarginFor } from "@/lib/billing/margin-policy";
import { resolvePricingConfig, type PricingConfig } from "@/lib/billing/pricing-config";
import { IMAGE_VARIANTS } from "@/lib/images/image-studio";

/**
 * WHAT A PICTURE COSTS, AND WHAT IT IS SOLD FOR (MASTER 16, package 19).
 *
 * One number per kind of picture, in USD, the provider's published list
 * rate as known when this was written (2026-10-07) — NOT measured on an
 * account, because no image key is in the environment yet (NEEDS 5). The
 * first real call settles on these rates; the first invoice is where they
 * are checked, and they live here, in one place, so that check changes one
 * line.
 *
 *   preview  gemini-2.5-flash-image, one 1024px picture: $0.039
 *   full     gemini-3-pro-image-preview, one 4K picture:  $0.24
 *
 * THE SAME FORMULA AS EVERY OTHER CHARGE. The credits are
 * creditsForRealCostOnAccount over resolveMarginFor("image_generate", …),
 * the exact two calls settleReservation makes — so the price on the button
 * is the price taken, for this plan and this account's credit size, and
 * no margin is decided here.
 */
export const IMAGE_PREVIEW_MODEL = "gemini-2.5-flash-image";
export const IMAGE_FULL_MODEL = "gemini-3-pro-image-preview";

export const IMAGE_RATES_USD = {
  preview: 0.039,
  full: 0.24,
} as const;

/** The name the hold, the charge and the margin are filed under. */
export const IMAGE_FEATURE = "image_generate";

export type ImagePrices = {
  /** The four pictures of one description. */
  variants: number;
  /** One picture changed with words. */
  edit: number;
  /** One picture at the largest size. */
  full: number;
};

export function imageCostUsd(kind: "preview" | "full", count = 1): number {
  return IMAGE_RATES_USD[kind] * Math.max(0, count);
}

export function imageCreditsOnAccount(
  usd: number,
  plan: { slug?: string | null; price: number | "custom"; monthlyCredits: number | "custom" } | null,
  purchasedPackPriceEur: number | null,
  config: PricingConfig = resolvePricingConfig()
): number {
  const margin = resolveMarginFor(IMAGE_FEATURE, plan?.slug ?? null, config).margin;
  return creditsForRealCostOnAccount(usdToEur(usd, config), plan, purchasedPackPriceEur, config, margin);
}

export function imagePrices(
  plan: { slug?: string | null; price: number | "custom"; monthlyCredits: number | "custom" } | null,
  purchasedPackPriceEur: number | null,
  config: PricingConfig = resolvePricingConfig()
): ImagePrices {
  return {
    variants: imageCreditsOnAccount(imageCostUsd("preview", IMAGE_VARIANTS), plan, purchasedPackPriceEur, config),
    edit: imageCreditsOnAccount(imageCostUsd("preview"), plan, purchasedPackPriceEur, config),
    full: imageCreditsOnAccount(imageCostUsd("full"), plan, purchasedPackPriceEur, config),
  };
}
