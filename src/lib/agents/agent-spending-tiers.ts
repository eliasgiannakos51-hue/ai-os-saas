import "server-only";

/**
 * AGENT TIERED SPENDING AUTHORIZATION (AG1 Κ7).
 *
 * Three tiers for agent spending, configurable per agent:
 *
 * 1. AUTO — below the auto threshold, the agent spends without asking.
 *    Default: 10 credits.
 * 2. NOTIFY — between auto and approval thresholds, the agent spends
 *    and sends a notification. Default: 50 credits.
 * 3. APPROVE — above the approval threshold, the agent pauses and waits
 *    for human approval. Default: 50+ credits.
 *
 * The thresholds are stored in the agent's approval_settings JSON:
 * {
 *   send: true,
 *   publish: true,
 *   spend: true,
 *   spendAutoThreshold: 10,
 *   spendNotifyThreshold: 50,
 * }
 *
 * When spend approval is OFF (spend: false), all spending is auto.
 * When it's ON (spend: true), the tiers apply.
 */

export type SpendingTier = "auto" | "notify" | "approve";

export type SpendingThresholds = {
  autoThreshold: number;   // auto below this
  notifyThreshold: number; // notify between auto and this, approve above
};

const DEFAULT_AUTO = 10;
const DEFAULT_NOTIFY = 50;

/**
 * Reads spending thresholds from the agent's approval_settings.
 */
export function getSpendingThresholds(
  approvalSettings: Record<string, unknown> | null
): SpendingThresholds {
  if (!approvalSettings) {
    return { autoThreshold: DEFAULT_AUTO, notifyThreshold: DEFAULT_NOTIFY };
  }
  const auto = typeof approvalSettings.spendAutoThreshold === "number"
    ? approvalSettings.spendAutoThreshold
    : DEFAULT_AUTO;
  const notify = typeof approvalSettings.spendNotifyThreshold === "number"
    ? approvalSettings.spendNotifyThreshold
    : DEFAULT_NOTIFY;
  return {
    autoThreshold: Math.max(0, auto),
    notifyThreshold: Math.max(auto, notify),
  };
}

/**
 * Determines the spending tier for a given cost.
 * Returns "auto" (proceed), "notify" (proceed + notify), or "approve" (pause + wait).
 */
export function classifySpending(
  approvalSettings: Record<string, unknown> | null,
  costCredits: number
): SpendingTier {
  // If spending approval is OFF, everything is auto.
  if (approvalSettings && approvalSettings.spend === false) {
    return "auto";
  }

  const { autoThreshold, notifyThreshold } = getSpendingThresholds(approvalSettings);

  if (costCredits <= autoThreshold) return "auto";
  if (costCredits <= notifyThreshold) return "notify";
  return "approve";
}

/**
 * Returns a human-readable description of the spending decision.
 */
export function spendingTierLabel(tier: SpendingTier): string {
  switch (tier) {
    case "auto": return "auto-approved";
    case "notify": return "auto-approved with notification";
    case "approve": return "requires approval";
  }
}
