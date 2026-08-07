import { modelForTier } from "@/lib/ai/models";
// Model identifiers for Autonomous Agents, in a client-safe module for
// exactly the reason lib/ai-models.ts exists: the create-an-agent screen
// shows a per-run credit estimate before the user commits, that estimate
// runs in the browser, and it has to price the SAME model the server will
// call. Importing the name from agent-builder.ts/agent-runner.ts is
// impossible — both are `server-only`.

// PREMIUM tier: an agent's config and its runs are deliverables the
// user pays credits for (V3 model tiers, lib/ai/models.ts).

export const AGENT_BUILDER_MODEL = modelForTier("premium");
export const AGENT_RUNNER_MODEL = modelForTier("premium");
