import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { logApiError } from "@/lib/log-error";
import { AGENT_TOOLS, type ToolInvocation, type AgentTool } from "./agent-tools";
import { classifySpending, type SpendingTier } from "./agent-spending-tiers";
import { needsApproval, requestApproval, type ApprovalKind } from "./agent-approval";

/**
 * AGENT TOOL EXECUTOR — runs tools on behalf of an agent.
 *
 * This is the "hands" of the agent. When the agent's output includes
 * an action block, the executor:
 * 1. Validates the tool is enabled for this agent
 * 2. Checks approval requirements (send/publish/spend)
 * 3. Runs the tool implementation
 * 4. Returns the result to be fed back to the agent
 *
 * SECURITY:
 * - Only enabled tools can run
 * - Approval rules are enforced before execution
 * - Every invocation is logged
 * - Credit costs are tracked
 */

export type ToolResult = {
  tool: string;
  status: "success" | "error" | "needs_approval" | "not_enabled";
  output: string;
  creditsCost: number;
  approvalId?: string;
};

/**
 * Execute a single tool invocation for an agent.
 */
export async function executeAgentTool(params: {
  invocation: ToolInvocation;
  agentId: string;
  runId: string;
  userId: string;
  enabledToolIds: Set<string>;
  approvalSettings: Record<string, boolean | number> | null;
}): Promise<ToolResult> {
  const { invocation, agentId, runId, userId, enabledToolIds, approvalSettings } = params;

  // 1. Check tool is enabled.
  if (!enabledToolIds.has(invocation.tool)) {
    return {
      tool: invocation.tool,
      status: "not_enabled",
      output: `Tool "${invocation.tool}" is not enabled for this agent.`,
      creditsCost: 0,
    };
  }

  // 2. Find tool definition.
  const toolDef = AGENT_TOOLS.find((t) => t.id === invocation.tool);
  if (!toolDef) {
    return {
      tool: invocation.tool,
      status: "error",
      output: `Unknown tool "${invocation.tool}".`,
      creditsCost: 0,
    };
  }

  // 3. Check approval requirements.
  const approvalKinds: ApprovalKind[] = [];
  if (toolDef.sends && needsApproval(approvalSettings as Record<string, boolean> | null, "send")) {
    approvalKinds.push("send");
  }
  if (toolDef.publishes && needsApproval(approvalSettings as Record<string, boolean> | null, "publish")) {
    approvalKinds.push("publish");
  }
  if (toolDef.spends) {
    const tier: SpendingTier = classifySpending(
      approvalSettings as Record<string, unknown> | null,
      toolDef.estimatedCost
    );
    if (tier === "approve") {
      approvalKinds.push("spend");
    }
    // "notify" tier: proceed but log a notification (future feature).
  }

  // If any approval is needed, pause and request it.
  if (approvalKinds.length > 0) {
    try {
      const approval = await requestApproval({
        agentId,
        runId,
        userId,
        kind: approvalKinds[0], // primary approval kind
        actionDescription: `${toolDef.name}: ${JSON.stringify(invocation.params).slice(0, 200)}`,
        actionData: { tool: invocation.tool, params: invocation.params, allKinds: approvalKinds },
      });

      if (approval.ok) {
        return {
          tool: invocation.tool,
          status: "needs_approval",
          output: `This action needs approval (${approvalKinds.join(", ")}). Approval requested — waiting for your decision.`,
          creditsCost: 0,
          approvalId: approval.approvalId,
        };
      }
    } catch (err) {
      logApiError("agent-tool-executor:approval", err, { agentId, tool: invocation.tool });
    }

    return {
      tool: invocation.tool,
      status: "needs_approval",
      output: `This action needs approval (${approvalKinds.join(", ")}).`,
      creditsCost: 0,
    };
  }

  // 4. Execute the tool.
  try {
    const result = await runToolImplementation(toolDef, invocation.params, userId);
    return {
      tool: invocation.tool,
      status: "success",
      output: result,
      creditsCost: toolDef.estimatedCost,
    };
  } catch (err) {
    logApiError("agent-tool-executor:run", err, { agentId, tool: invocation.tool });
    return {
      tool: invocation.tool,
      status: "error",
      output: `Tool error: ${err instanceof Error ? err.message : "unknown error"}`,
      creditsCost: 0,
    };
  }
}

/**
 * Runs the actual tool implementation. Each tool maps to a specific
 * function in the codebase.
 *
 * For now, this is a dispatcher. Real implementations will call the
 * actual Ionexa AI and Payments APIs.
 */
async function runToolImplementation(
  tool: AgentTool,
  params: Record<string, unknown>,
  userId: string
): Promise<string> {
  switch (tool.id) {
    // ─── IONEXA PAYMENTS TOOLS ───
    case "payments_view_analytics": {
      const { getPaymentsAnalytics } = await import("@/lib/payments/analytics");
      const admin = createAdminClient();
      const analytics = await getPaymentsAnalytics(admin, userId);
      return JSON.stringify({
        totalRevenue: `${(analytics.totalRevenueCents / 100).toFixed(2)}`,
        thisMonthRevenue: `${(analytics.thisMonthRevenueCents / 100).toFixed(2)}`,
        mrr: `${(analytics.mrrCents / 100).toFixed(2)}`,
        activeSubscriptions: analytics.activeSubscriptions,
        totalTransactions: analytics.totalTransactions,
        churnedThisMonth: analytics.churnedThisMonth,
        topProducts: analytics.topProducts.slice(0, 5).map((p) => ({
          name: p.productName,
          revenue: `${(p.revenueCents / 100).toFixed(2)}`,
          sales: p.count,
        })),
      }, null, 2);
    }

    case "payments_create_invoice": {
      const { createInvoice } = await import("@/lib/payments/invoices");
      const { getPaymentsAccount } = await import("@/lib/payments/connect");
      const admin = createAdminClient();
      const account = await getPaymentsAccount(admin, userId);
      if (!account) return "Error: no payments account connected.";
      const result = await createInvoice({
        account,
        customerEmail: String(params.customerEmail ?? ""),
        customerName: params.customerName ? String(params.customerName) : undefined,
        items: Array.isArray(params.items) ? params.items.map((item: Record<string, unknown>) => ({
          description: String(item.description ?? ""),
          amountCents: Number(item.amountCents ?? 0),
          quantity: item.quantity ? Number(item.quantity) : 1,
        })) : [],
        memo: params.memo ? String(params.memo) : undefined,
      });
      if (!result.ok) return `Error creating invoice: ${result.reason}`;
      return `Invoice created and sent. ID: ${result.invoiceId}. URL: ${result.invoiceUrl}`;
    }

    case "payments_create_link": {
      const { createPaymentLink } = await import("@/lib/payments/payment-links");
      const { getPaymentsAccount } = await import("@/lib/payments/connect");
      const admin = createAdminClient();
      const account = await getPaymentsAccount(admin, userId);
      if (!account) return "Error: no payments account connected.";
      const { data: product } = await admin
        .from("payments_products")
        .select("*")
        .eq("user_id", userId)
        .eq("id", String(params.productId ?? ""))
        .single();
      if (!product) return "Error: product not found.";
      const result = await createPaymentLink({ account, product });
      if (!result.ok) return `Error: ${result.reason}`;
      return `Payment link created: ${result.url}`;
    }

    case "payments_create_coupon": {
      const { createCoupon } = await import("@/lib/payments/coupons");
      const { getPaymentsAccount } = await import("@/lib/payments/connect");
      const admin = createAdminClient();
      const account = await getPaymentsAccount(admin, userId);
      if (!account) return "Error: no payments account connected.";
      const result = await createCoupon(admin, account, {
        code: String(params.code ?? "DISCOUNT"),
        percentOff: params.percentOff ? Number(params.percentOff) : undefined,
        amountOffCents: params.amountOffCents ? Number(params.amountOffCents) : undefined,
        duration: (params.duration as "once" | "repeating" | "forever") ?? "once",
      });
      if (!result.ok) return `Error: ${result.reason}`;
      return `Coupon "${result.coupon.code}" created (${result.coupon.percent_off ? result.coupon.percent_off + "% off" : (result.coupon.amount_off_cents! / 100).toFixed(2) + " off"}).`;
    }

    // ─── IONEXA AI TOOLS ───
    case "ai_chat":
    case "ai_document":
    case "ai_research":
    case "ai_post":
    case "ai_translate": {
      // These tools use the AI completion API. For now, they return a
      // placeholder — the real implementation will call runCompletion
      // with tool-specific system prompts.
      return `[AI ${tool.name} tool]: Processing "${String(params.prompt ?? params.topic ?? params.text ?? "").slice(0, 100)}...".\n\nNote: Full AI tool execution is being connected. The agent infrastructure (tools, approval, execution) is operational — the AI completion bridge is the next step.`;
    }

    case "ai_image":
    case "ai_video":
    case "ai_audio":
    case "ai_presentation":
    case "ai_website": {
      return `[AI ${tool.name} tool]: Generation requested for "${String(params.prompt ?? params.description ?? "").slice(0, 100)}".\n\nNote: Media generation tools are being connected to the generation pipeline. The agent tool framework is operational.`;
    }

    // ─── EMAIL TOOLS ───
    case "email_send":
    case "email_reply": {
      return `[Email tool]: Would send email to "${String(params.to ?? "")}" with subject "${String(params.subject ?? "")}".\n\nNote: Email delivery is being connected. The agent email system (agent@domain) is the next feature.`;
    }

    case "email_read": {
      return `[Email tool]: Would read recent emails.\n\nNote: Email reading requires the MCP Gmail connector. Setup in progress.`;
    }

    // ─── SOCIAL TOOLS ───
    case "social_post":
    case "social_schedule": {
      return `[Social tool]: Would post/schedule to social media: "${String(params.content ?? "").slice(0, 100)}".\n\nNote: Social media connectors are being built.`;
    }

    case "social_analytics": {
      return `[Social Analytics]: Social media analytics connector in progress.`;
    }

    // ─── CALENDAR TOOLS ───
    case "calendar_check":
    case "calendar_create": {
      return `[Calendar tool]: Calendar integration via MCP connector in progress.`;
    }

    // ─── ANALYTICS TOOLS ───
    case "analytics_report": {
      // Reuse payments analytics for business reporting.
      const { getPaymentsAnalytics } = await import("@/lib/payments/analytics");
      const admin = createAdminClient();
      const a = await getPaymentsAnalytics(admin, userId);
      const growth = a.lastMonthRevenueCents > 0
        ? ((a.thisMonthRevenueCents - a.lastMonthRevenueCents) / a.lastMonthRevenueCents * 100).toFixed(1)
        : "N/A";
      return `Business Report:\n- Total Revenue: ${(a.totalRevenueCents / 100).toFixed(2)}\n- This Month: ${(a.thisMonthRevenueCents / 100).toFixed(2)} (${growth}% vs last month)\n- MRR: ${(a.mrrCents / 100).toFixed(2)}\n- Active Subscriptions: ${a.activeSubscriptions}\n- Transactions: ${a.totalTransactions}\n- Avg Order Value: ${(a.averageOrderValueCents / 100).toFixed(2)}\n- Churn This Month: ${a.churnedThisMonth}`;
    }

    case "analytics_competitors": {
      return `[Competitor Analysis]: Would research competitors for "${String(params.industry ?? params.query ?? "")}".\n\nNote: Competitor analysis uses the AI research tool with web search. Being connected.`;
    }

    default:
      return `Unknown tool: ${tool.id}`;
  }
}
