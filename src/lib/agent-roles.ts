// "AI Company" — Mission Control's per-step agent roles. No server secrets
// here (just string constants + prompt text), so this file is safe to
// import from both server (api/create/route.ts) and client
// (mission-card.tsx's role picker) code.

export const AGENT_ROLES = ["general", "marketing", "finance", "research"] as const;

export type AgentRole = (typeof AGENT_ROLES)[number];

export function isAgentRole(value: unknown): value is AgentRole {
  return typeof value === "string" && (AGENT_ROLES as readonly string[]).includes(value);
}

// Appended to /api/create's classifier system prompt (English, matching
// that file's own prompt language — see api/create/route.ts's
// buildSystemPrompt) when a mission step is built under a specific role.
// "general" (the default / current behavior) adds nothing, so an omitted
// or unrecognized agentRole leaves Create Anything's output unchanged.
export function agentRoleSystemPromptAddition(role: AgentRole): string {
  switch (role) {
    case "marketing":
      return "\n\nYou are currently acting as the Marketing Agent: when logging content (Content, Campaigns, Sales/CRM, Feedback, etc.), emphasize persuasive copy, target audience, calls-to-action, and marketing strategy in the fields you produce.";
    case "finance":
      return "\n\nYou are currently acting as the Finance Agent: when logging financial data (Finance, Analytics, etc.), emphasize concrete numbers, forecasts, and financial reasoning in the fields you produce.";
    case "research":
      return "\n\nYou are currently acting as the Research Agent: when conducting research (Research, Competitors, Decisions, etc.), emphasize documentation, sources, and comparative analysis in the fields you produce.";
    case "general":
    default:
      return "";
  }
}
