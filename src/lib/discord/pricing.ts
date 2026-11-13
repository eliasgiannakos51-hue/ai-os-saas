import { estimateForAction } from "@/lib/billing/estimate";
import { effectiveCreditPriceEurForAccount } from "@/lib/billing/credit-formula";
import { resolvePricingConfig, type PricingConfig } from "@/lib/billing/pricing-config";
import { AGENT_BUILDER_MODEL } from "@/lib/agents/agent-models";

/**
 * WHAT A DISCORD PLAN COSTS, BEFORE IT IS ASKED FOR (the owner's Discord
 * directive, 2026-11-05). One price, from estimateForAction — the function
 * api/discord/plan holds with — so the number under the field is the
 * number held: making a plan from words, or changing a box with words
 * (profile discordPlan, one forced-tool call). Ticks, deleting a box, the
 * apply and the undo call no model and cost nothing.
 */
export const DISCORD_FEATURE = "discord_plan";
export const DISCORD_PLAN_MODEL = AGENT_BUILDER_MODEL;
/** The most of the person's words, plus the current plan when changing one, that reaches the model. */
export const PLAN_INPUT_CHARS = 2000 + 16_000;

export function discordPlanPrice(
  plan: { slug?: string | null; price: number | "custom"; monthlyCredits: number | "custom" } | null,
  purchasedPackPriceEur: number | null,
  config: PricingConfig = resolvePricingConfig()
): number {
  const creditPrice = plan ? effectiveCreditPriceEurForAccount(plan, purchasedPackPriceEur, config) : undefined;
  return estimateForAction("discordPlan", { model: DISCORD_PLAN_MODEL, inputChars: PLAN_INPUT_CHARS, planSlug: plan?.slug ?? null }, config, creditPrice).reserveCredits;
}
