import { estimateForAction } from "@/lib/billing/estimate";
import { effectiveCreditPriceEurForAccount } from "@/lib/billing/credit-formula";
import { resolvePricingConfig, type PricingConfig } from "@/lib/billing/pricing-config";
import { WEBSITE_BUILDER_MODEL } from "@/lib/ai-models";
import { POSTS_MODEL } from "@/lib/posts/prompt";
import { POST_PLATFORMS, postsEstimateInputChars } from "@/lib/posts/platforms";
import { PRESENTATION_MODEL } from "@/lib/presentations/prompt";
import { DEFAULT_SLIDES, deckEstimateInputChars } from "@/lib/presentations/deck";
import { RESEARCH_MODEL } from "@/lib/files/file-models";
import { RESEARCH_MAX_SEARCHES } from "@/lib/research/research-limits";
import { RESEARCH_BRIEF_CHARS } from "@/lib/research/research-to-slides";
import { imagePrices } from "@/lib/images/image-pricing";
import type { FlowKind } from "@/lib/flows/plan";

/**
 * WHAT A FLOW COSTS, BEFORE IT IS APPROVED (MASTER 6.1: «συνολικό κόστος,
 * έγκριση»; package 36).
 *
 * Each step is priced by the SAME estimate its own route holds before it
 * starts — the same profile, the same model, the same size — so the total
 * on the screen is the sum of what the tools will each hold, and each one
 * settles on what it really used, as it does on its own page:
 *
 *   site      websiteGenerate   (api/websites/generate)
 *   images    the four pictures (api/images/generate, lib/images/image-pricing.ts)
 *   posts     postsGenerate, every platform (api/posts/generate)
 *   research  the plan (agentBuild) and the run (deepResearch), as
 *             api/research quotes them
 *   slides    presentationGenerate; from a research, at the most of a
 *             report that reaches a deck (RESEARCH_BRIEF_CHARS)
 *   analysis  priced once the file is read, as on the Analyze page: what
 *             it costs is what the file says
 *
 * Pure, so the page that shows it and the gate that holds it run the same
 * code. Held by scripts/tests/flows.test.mjs.
 */
export type FlowPrices = Record<Exclude<FlowKind, "analysis">, number> & { slidesFromResearch: number };

/** What one plan costs at most: its steps' holds, a deck after a research priced on the report. */
export function flowTotal(steps: { kind: FlowKind; after: string[] }[], prices: FlowPrices): number {
  return steps.reduce((sum, s) => sum + (s.kind === "analysis" ? 0 : s.kind === "slides" && s.after.includes("research") ? prices.slidesFromResearch : prices[s.kind]), 0);
}

export function flowPrices(
  plan: { slug?: string | null; price: number | "custom"; monthlyCredits: number | "custom" } | null,
  purchasedPackPriceEur: number | null,
  briefChars: number,
  config: PricingConfig = resolvePricingConfig()
): FlowPrices {
  const creditPrice = plan ? effectiveCreditPriceEurForAccount(plan, purchasedPackPriceEur, config) : undefined;
  const planSlug = plan?.slug ?? null;
  const held = (profile: Parameters<typeof estimateForAction>[0], params: Omit<Parameters<typeof estimateForAction>[1], "planSlug">) =>
    estimateForAction(profile, { ...params, planSlug }, config, creditPrice).reserveCredits;
  return {
    site: held("websiteGenerate", { model: WEBSITE_BUILDER_MODEL, inputChars: briefChars, imageCount: 0 }),
    images: imagePrices(plan, purchasedPackPriceEur, config).variants,
    posts: held("postsGenerate", { model: POSTS_MODEL, inputChars: postsEstimateInputChars(briefChars, [...POST_PLATFORMS]) }),
    research:
      held("agentBuild", { model: RESEARCH_MODEL, inputChars: briefChars }) +
      held("deepResearch", { model: RESEARCH_MODEL, inputChars: briefChars, expectedWebSearches: RESEARCH_MAX_SEARCHES }),
    slides: held("presentationGenerate", { model: PRESENTATION_MODEL, inputChars: deckEstimateInputChars(briefChars, DEFAULT_SLIDES) }),
    slidesFromResearch: held("presentationGenerate", { model: PRESENTATION_MODEL, inputChars: deckEstimateInputChars(RESEARCH_BRIEF_CHARS, DEFAULT_SLIDES) }),
  };
}
