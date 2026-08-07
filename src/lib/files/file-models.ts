// Model identifiers for the File Workspace and Deep Research, in a
// client-safe module for the same reason lib/ai-models.ts and
// lib/agents/agent-models.ts exist: the credit estimate shown before the
// user commits runs in the browser and has to price the SAME model the
// server will call.

export const FILE_ASK_MODEL = "claude-sonnet-4-6";
export const RESEARCH_MODEL = "claude-sonnet-4-6";
