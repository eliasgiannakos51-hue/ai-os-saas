import { modelForTier } from "@/lib/ai/models";
// Model identifiers for the File Workspace and Deep Research, in a
// client-safe module for the same reason lib/ai-models.ts and
// lib/agents/agent-models.ts exist: the credit estimate shown before the
// user commits runs in the browser and has to price the SAME model the
// server will call.

// STANDARD for Q&A over documents; MAX for Deep Research, whose whole
// job is multi-source synthesis — the shape where the strongest model
// is visibly different (V3 model tiers, lib/ai/models.ts).

export const FILE_ASK_MODEL = modelForTier("standard");
export const RESEARCH_MODEL = modelForTier("max");
