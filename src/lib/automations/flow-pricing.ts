import { estimateForAction } from "@/lib/billing/estimate";
import { effectiveCreditPriceEurForAccount } from "@/lib/billing/credit-formula";
import { resolvePricingConfig, type PricingConfig } from "@/lib/billing/pricing-config";
import { AGENT_BUILDER_MODEL, AGENT_RUNNER_MODEL } from "@/lib/agents/agent-models";

/**
 * WHAT AN AUTOMATION COSTS, BEFORE IT IS ASKED FOR (MASTER 16, package 30).
 *
 * Two prices, both from estimateForAction — the function the routes hold
 * with — so the number under the field is the number held:
 *
 *   build  making one from words, or changing one box with words
 *          (profile automationBuild, one forced-tool call)
 *   step   one AI box of one run, at the most it reads
 *          (profile automationStep): a run costs this times its AI boxes,
 *          at most, and settles on what was really used.
 *
 * The automation's own limit (automation_flows.cost_limit) is checked
 * against the same `step` before each AI box (lib/automations/runner.ts).
 */
export const FLOW_FEATURE = "automation_run";
/** The most of one read that reaches a model (lib/automations/runner.ts, MAX_READ_CHARS). */
export const STEP_MAX_INPUT_CHARS = 24_000;

export type FlowPrices = { build: number; step: number };

export function flowPrices(
  plan: { slug?: string | null; price: number | "custom"; monthlyCredits: number | "custom" } | null,
  purchasedPackPriceEur: number | null,
  config: PricingConfig = resolvePricingConfig()
): FlowPrices {
  const creditPrice = plan ? effectiveCreditPriceEurForAccount(plan, purchasedPackPriceEur, config) : undefined;
  const planSlug = plan?.slug ?? null;
  return {
    build: estimateForAction("automationBuild", { model: AGENT_BUILDER_MODEL, inputChars: 2000, planSlug }, config, creditPrice).reserveCredits,
    step: estimateForAction("automationStep", { model: AGENT_RUNNER_MODEL, inputChars: STEP_MAX_INPUT_CHARS, planSlug }, config, creditPrice).reserveCredits,
  };
}
