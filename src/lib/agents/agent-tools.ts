import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { logApiError } from "@/lib/log-error";

/**
 * AGENT TOOLS — the tool system that makes agents into employees.
 *
 * Each agent has a set of enabled tools. Tools are grouped into categories
 * (connectors) that map to external services or internal capabilities.
 *
 * SECURITY MODEL:
 * - Tools are declared, not arbitrary code. Each tool has a fixed
 *   implementation in this codebase.
 * - An agent can only use tools the owner has enabled for it.
 * - Each tool invocation is logged in the run report.
 * - Spending-tier rules apply: a tool that costs credits or sends
 *   something externally goes through the approval system.
 * - The agent never sees API keys — the tool implementation handles auth.
 *
 * TOOL CATEGORIES:
 * - ionexa_ai: use any Ionexa AI tool (image, video, website, etc.)
 * - ionexa_payments: interact with the payments system
 * - email: send/read emails
 * - calendar: manage calendar events
 * - drive: create/read documents
 * - social: post to social media
 * - crm: manage customer relationships
 * - analytics: read business analytics
 */

export type AgentToolCategory =
  | "ionexa_ai"
  | "ionexa_payments"
  | "email"
  | "calendar"
  | "drive"
  | "social"
  | "crm"
  | "analytics";

export type AgentTool = {
  id: string;
  category: AgentToolCategory;
  name: string;
  description: string;
  /** Whether this tool sends data externally (needs "send" approval). */
  sends: boolean;
  /** Whether this tool spends credits (needs "spend" approval). */
  spends: boolean;
  /** Whether this tool publishes content (needs "publish" approval). */
  publishes: boolean;
  /** Estimated credit cost per invocation (0 = free). */
  estimatedCost: number;
};

/**
 * All available agent tools. The owner enables a subset per agent.
 */
export const AGENT_TOOLS: AgentTool[] = [
  // — Ionexa AI tools —
  { id: "ai_chat", category: "ionexa_ai", name: "AI Chat", description: "Generate text responses and answers", sends: false, spends: true, publishes: false, estimatedCost: 1 },
  { id: "ai_image", category: "ionexa_ai", name: "AI Image", description: "Generate images from descriptions", sends: false, spends: true, publishes: false, estimatedCost: 5 },
  { id: "ai_document", category: "ionexa_ai", name: "AI Document", description: "Generate documents, reports, articles", sends: false, spends: true, publishes: false, estimatedCost: 10 },
  { id: "ai_website", category: "ionexa_ai", name: "Website Builder", description: "Create and update websites", sends: false, spends: true, publishes: true, estimatedCost: 30 },
  { id: "ai_presentation", category: "ionexa_ai", name: "AI Presentation", description: "Generate slide decks", sends: false, spends: true, publishes: false, estimatedCost: 15 },
  { id: "ai_video", category: "ionexa_ai", name: "AI Video", description: "Generate short videos", sends: false, spends: true, publishes: false, estimatedCost: 50 },
  { id: "ai_audio", category: "ionexa_ai", name: "AI Audio", description: "Generate voiceovers and audio", sends: false, spends: true, publishes: false, estimatedCost: 10 },
  { id: "ai_research", category: "ionexa_ai", name: "AI Research", description: "Deep research on any topic", sends: false, spends: true, publishes: false, estimatedCost: 20 },
  { id: "ai_translate", category: "ionexa_ai", name: "AI Translate", description: "Translate content to any language", sends: false, spends: true, publishes: false, estimatedCost: 2 },
  { id: "ai_post", category: "ionexa_ai", name: "AI Post", description: "Generate social media posts", sends: false, spends: true, publishes: false, estimatedCost: 3 },

  // — Ionexa Payments tools —
  { id: "payments_create_product", category: "ionexa_payments", name: "Create Product", description: "Create a new product with price in Ionexa Payments", sends: false, spends: false, publishes: true, estimatedCost: 0 },
  { id: "payments_create_link", category: "ionexa_payments", name: "Create Payment Link", description: "Generate a shareable payment link for a product", sends: false, spends: false, publishes: false, estimatedCost: 0 },
  { id: "payments_create_invoice", category: "ionexa_payments", name: "Create Invoice", description: "Generate and send an invoice to a customer", sends: true, spends: false, publishes: false, estimatedCost: 0 },
  { id: "payments_view_analytics", category: "ionexa_payments", name: "View Analytics", description: "Read payments analytics (revenue, MRR, churn)", sends: false, spends: false, publishes: false, estimatedCost: 0 },
  { id: "payments_create_coupon", category: "ionexa_payments", name: "Create Coupon", description: "Create a discount coupon for customers", sends: false, spends: false, publishes: false, estimatedCost: 0 },
  { id: "payments_process_refund", category: "ionexa_payments", name: "Process Refund", description: "Issue a refund for a transaction", sends: true, spends: true, publishes: false, estimatedCost: 0 },

  // — Email tools —
  { id: "email_send", category: "email", name: "Send Email", description: "Send an email to a recipient", sends: true, spends: true, publishes: false, estimatedCost: 1 },
  { id: "email_read", category: "email", name: "Read Emails", description: "Read recent emails from inbox", sends: false, spends: false, publishes: false, estimatedCost: 0 },
  { id: "email_reply", category: "email", name: "Reply to Email", description: "Reply to an email thread", sends: true, spends: true, publishes: false, estimatedCost: 1 },

  // — Calendar tools —
  { id: "calendar_check", category: "calendar", name: "Check Calendar", description: "Check availability on the calendar", sends: false, spends: false, publishes: false, estimatedCost: 0 },
  { id: "calendar_create", category: "calendar", name: "Create Event", description: "Schedule a new calendar event", sends: true, spends: false, publishes: false, estimatedCost: 0 },

  // — Social media tools —
  { id: "social_post", category: "social", name: "Post to Social", description: "Publish a post to connected social accounts", sends: false, spends: true, publishes: true, estimatedCost: 3 },
  { id: "social_schedule", category: "social", name: "Schedule Post", description: "Schedule a post for later", sends: false, spends: true, publishes: false, estimatedCost: 3 },
  { id: "social_analytics", category: "social", name: "Social Analytics", description: "Read social media engagement metrics", sends: false, spends: false, publishes: false, estimatedCost: 0 },

  // — Analytics tools —
  { id: "analytics_report", category: "analytics", name: "Business Report", description: "Generate a business analytics report", sends: false, spends: true, publishes: false, estimatedCost: 5 },
  { id: "analytics_competitors", category: "analytics", name: "Competitor Analysis", description: "Research and compare competitors", sends: false, spends: true, publishes: false, estimatedCost: 10 },
];

/**
 * Gets the tool IDs enabled for an agent from its config.
 */
export function getEnabledTools(
  config: Record<string, unknown> | null
): string[] {
  if (!config) return [];
  // Reads both field names: enabledToolIds (from UI/PATCH) and
  // enabledTools (from POST /api/agents/tools) for backward compatibility.
  const tools = config.enabledToolIds ?? config.enabledTools;
  if (!Array.isArray(tools)) return [];
  return tools.filter((t): t is string => typeof t === "string");
}

/**
 * Gets the full tool definitions for an agent's enabled tools.
 */
export function resolveAgentTools(
  config: Record<string, unknown> | null
): AgentTool[] {
  const ids = new Set(getEnabledTools(config));
  return AGENT_TOOLS.filter((t) => ids.has(t.id));
}

/**
 * Formats tools as a system prompt section for the AI model.
 * This is what makes the agent "aware" of its capabilities.
 */
export function formatToolsForPrompt(tools: AgentTool[]): string {
  if (tools.length === 0) return "";

  const lines = tools.map((t) => {
    const flags = [
      t.sends ? "SENDS externally" : null,
      t.publishes ? "PUBLISHES publicly" : null,
      t.spends ? `costs ~${t.estimatedCost} credits` : null,
    ]
      .filter(Boolean)
      .join(", ");
    return `- ${t.name}: ${t.description}${flags ? ` [${flags}]` : ""}`;
  });

  return `\n## Your Available Tools\n\nYou have the following tools enabled. To use a tool, output a structured action block:\n\n\`\`\`action\n{"tool": "tool_id", "params": {...}}\n\`\`\`\n\nAvailable tools:\n${lines.join("\n")}\n\nIMPORTANT:\n- Tools marked SENDS will send data to external recipients.\n- Tools marked PUBLISHES will make content publicly visible.\n- Both require approval unless your owner has turned off approval for that action type.\n- Stay within your credit cap.\n`;
}

/**
 * Parses tool invocations from the agent's output text.
 * Returns structured action blocks.
 */
export type ToolInvocation = {
  tool: string;
  params: Record<string, unknown>;
};

export function parseToolInvocations(output: string): ToolInvocation[] {
  const blocks: ToolInvocation[] = [];
  const re = /```action\s*\n([\s\S]*?)```/g;
  let match;
  while ((match = re.exec(output)) !== null) {
    try {
      const parsed = JSON.parse(match[1].trim());
      if (typeof parsed.tool === "string") {
        blocks.push({
          tool: parsed.tool,
          params: typeof parsed.params === "object" && parsed.params ? parsed.params : {},
        });
      }
    } catch {
      // Malformed JSON — skip.
    }
  }
  return blocks;
}

/**
 * Saves the enabled tools for an agent.
 */
export async function saveAgentTools(
  admin: ReturnType<typeof createAdminClient>,
  agentId: string,
  userId: string,
  toolIds: string[]
): Promise<{ ok: boolean }> {
  // Validate that all tool IDs are real.
  const validIds = new Set(AGENT_TOOLS.map((t) => t.id));
  const filtered = toolIds.filter((id) => validIds.has(id));

  try {
    const { data: agent, error: readErr } = await admin
      .from("user_agents")
      .select("config")
      .eq("id", agentId)
      .eq("user_id", userId)
      .single();

    if (readErr || !agent) return { ok: false };

    const config = (agent.config as Record<string, unknown>) ?? {};
    config.enabledToolIds = filtered;
    // Clean up old field name if present.
    delete config.enabledTools;

    const { error } = await admin
      .from("user_agents")
      .update({ config })
      .eq("id", agentId)
      .eq("user_id", userId);

    if (error) {
      logApiError("agent-tools:save", error, { agentId });
      return { ok: false };
    }
    return { ok: true };
  } catch (err) {
    logApiError("agent-tools:save", err, { agentId });
    return { ok: false };
  }
}
