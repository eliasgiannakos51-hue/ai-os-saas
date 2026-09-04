import { parseAgentDepth, type AgentDepth } from "@/lib/agents/agent-depth";

/**
 * WHICH TIER A "RUN NOW" ACTUALLY RUNS AT — V4.6.
 *
 * WHAT WAS REPORTED. "I created an agent, chose the most expensive tier,
 * pressed Run. It ran the middle one."
 *
 * WHERE THE CHOICE WAS LOST. agents-workspace.tsx kept the per-run tier
 * as ONE piece of state, `runDepth`, initialised to "standard" and reset
 * to the agent's own tier only inside startEditing() — the Edit button.
 * Selecting an agent by clicking its card does not call startEditing, so
 * a person who created a Deep agent and pressed "Run now" from the card
 * menu sent `{ depth: "standard" }`: the route treats any value that
 * differs from the stored one as a deliberate one-off override, held the
 * credits at the standard price, ran Sonnet with four searches, and
 * charged for exactly that. The charge matched the run. Neither matched
 * the choice.
 *
 * The picker in the detail panel showed "Standard" selected for the same
 * reason, which is what made it look like the choice had not been saved.
 * It had been saved: `config.depth` in the row was "deep" throughout.
 *
 * THE FIX IS A DIFFERENT SHAPE OF STATE, not a second reset. An override
 * is a fact about ONE agent — "run this one deeper, this once" — so it is
 * stored WITH the agent's id, and an override for any other agent is
 * simply not an override. There is then nothing to reset: opening another
 * agent, or none, reads that agent's own tier by construction.
 *
 * Pure, so scripts/tests/agent-run-depth.test.mjs can execute it on the
 * exact shapes the workspace passes.
 */
export type RunDepthOverride = { agentId: string; depth: AgentDepth } | null;

type AgentLike = { id: string; config?: { depth?: unknown } | null };

/** The agent's own tier, as the runner will read it. */
export function ownDepth(agent: AgentLike): AgentDepth {
  return parseAgentDepth(agent.config?.depth);
}

/**
 * The tier a run of `agent` will use: the override if — and only if —
 * it was made for THIS agent, otherwise the agent's own.
 */
export function effectiveRunDepth(agent: AgentLike, override: RunDepthOverride): AgentDepth {
  if (override && override.agentId === agent.id) return override.depth;
  return ownDepth(agent);
}

/**
 * The request body for POST /api/agents/[id]/run.
 *
 * SENT ONLY WHEN IT DIFFERS from the agent's own tier. An override equal
 * to the stored depth is not an override; sending it anyway would put
 * depthOverridden: true on a cost row for a run that was entirely
 * ordinary — and, before this file, sending the workspace's stale state
 * was how a Deep agent came to run at Standard.
 */
export function runRequestBody(agent: AgentLike, override: RunDepthOverride): { depth?: AgentDepth } {
  const depth = effectiveRunDepth(agent, override);
  return depth === ownDepth(agent) ? {} : { depth };
}
