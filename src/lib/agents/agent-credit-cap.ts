/**
 * AGENT CREDIT CAP — «μέχρι Χ, μετά σταματά και ρωτά» (the market
 * research, idea #4, 2026-11-11; Rework's finding that agents' credits
 * run out unpredictably).
 *
 * A per-agent ceiling the user sets, in credits. The agent STOPS when it
 * reaches it — not "slows down", not "warns", STOPS — and the run report
 * says why. The user can raise the cap and re-run.
 *
 * THIS IS NOT THE BUDGET. The budget (agent-budget.ts) is a per-run cost
 * cap in EUR derived from the model's worst case. This is a per-agent
 * credit cap the USER sets, in the unit they see on their screen. The two
 * are separate because the budget protects the platform (a runaway run
 * does not drain the account) and the cap protects the user (they decide
 * how much an agent may spend, period).
 *
 * THE CAP IS CHECKED BEFORE THE RUN STARTS. If the agent has already
 * spent more than its cap across all previous runs, it does not start —
 * the cron skips it and the "Run now" button says why. This is the
 * "μέχρι Χ" part. The "μετά σταματά" is the budget check inside the run.
 *
 * THE DEFAULT IS NO CAP. An agent without a credit_cap runs as before.
 * Setting a cap is a choice, not a surprise — which is how it differs
 * from the budget, which is always on.
 */

/** The per-agent credit cap, read from the agent row. null = no cap. */
export type AgentCreditCap = number | null;

/** Credits this agent has spent across all runs. */
export async function agentTotalSpent(
  admin: { from: (table: string) => { select: (cols: string) => { eq: (col: string, val: string) => { single: () => Promise<{ data: { total: number } | null; error: unknown }> } } } },
  agentId: string
): Promise<number> {
  // Read from ai_cost_log, which is the settled cost — never the hold.
  const { data, error } = await admin
    .from("ai_cost_log")
    .select("total:credits_charged.sum()")
    .eq("metadata->>agent_id", agentId)
    .single();
  if (error || !data) return 0;
  return data.total ?? 0;
}

/**
 * Whether the agent may start a new run, given its cap and its history.
 *
 * Returns the remaining credits under the cap (positive = go, zero or
 * negative = stop), and the total already spent.
 */
export function capCheck(
  cap: AgentCreditCap,
  totalSpent: number
): { allowed: boolean; remaining: number; totalSpent: number; cap: AgentCreditCap } {
  if (cap === null || cap <= 0) {
    // No cap set — always allowed.
    return { allowed: true, remaining: Infinity, totalSpent, cap };
  }
  const remaining = cap - totalSpent;
  return { allowed: remaining > 0, remaining, totalSpent, cap };
}

/**
 * A human-readable reason for a cap stop, in the user's locale.
 */
export function capStopReason(cap: number, totalSpent: number): string {
  return `Credit cap reached: ${totalSpent} of ${cap} credits used. Raise the cap in the agent's settings to continue.`;
}
