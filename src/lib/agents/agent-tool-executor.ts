import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { logApiError } from "@/lib/log-error";
import { CostAccumulator } from "@/lib/billing/cost-accumulator";
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
  costs?: CostAccumulator | null;
}): Promise<ToolResult> {
  const { invocation, agentId, runId, userId, enabledToolIds, approvalSettings, costs } = params;

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
    const result = await runToolImplementation(toolDef, invocation.params, userId, costs);
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
  userId: string,
  costs?: CostAccumulator | null,
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

    // ─── IONEXA AI TOOLS (text-based) ───
    case "ai_chat":
    case "ai_document":
    case "ai_post":
    case "ai_translate": {
      const { runCompletion } = await import("@/lib/ai/providers/complete");
      const prompt = String(params.prompt ?? params.topic ?? params.text ?? "");
      if (!prompt) return "Error: no prompt provided.";

      const systemPrompts: Record<string, string> = {
        ai_chat: "You are a helpful business assistant. Answer clearly and concisely.",
        ai_document: "You are a professional document writer. Write well-structured, clear documents. Use headings and paragraphs. Output the complete document.",
        ai_post: "You are a social media expert. Write engaging, platform-appropriate posts. Keep them concise and include relevant hashtags.",
        ai_translate: `You are a professional translator. Translate the following text to ${String(params.targetLanguage ?? params.language ?? "English")}. Output ONLY the translation, nothing else.`,
      };

      const result = await runCompletion(
        {
          purpose: "agent_run",
          model: "default",
          maxTokens: tool.id === "ai_document" ? 4096 : 1024,
          system: [{ type: "text", text: systemPrompts[tool.id] ?? systemPrompts.ai_chat }],
          messages: [{ role: "user", content: prompt }],
        },
        { userId }
      );

      const outcome = result;
      if (!outcome.ok) return `AI error: ${outcome.detail ?? "generation failed"}`;
      // @billing: runCompletion handles reserve-and-settle internally
      // (the provider's own CostAccumulator). The tool executor is not a
      // reservation site — it trusts the provider layer to charge the owner.
      // The line below records onto the caller's accumulator when one is
      // passed (agent runs pass theirs from execute-agent.ts); outside a
      // run, the provider layer's own settlement is the only charge.
      costs?.record("generation", outcome.usage, outcome.reportedModel || outcome.model);
      return outcome.text;
    }

    case "ai_research": {
      const { runCompletion } = await import("@/lib/ai/providers/complete");
      const prompt = String(params.prompt ?? params.topic ?? params.query ?? "");
      if (!prompt) return "Error: no research query provided.";

      const outcome = await runCompletion(
        {
          purpose: "research",
          model: "default",
          maxTokens: 4096,
          system: [{ type: "text", text: "You are a research analyst. Search the web for current, factual information on the topic. Report findings as bullet points with sources. Be thorough and accurate." }],
          messages: [{ role: "user", content: prompt }],
          serverWebSearch: { maxUses: 5 },
          requires: ["server_web_search"],
        },
        { userId }
      );

      if (!outcome.ok) return `Research error: ${outcome.detail ?? "search failed"}`;
      // @billing: same as ai_chat — runCompletion handles billing internally;
      // the caller's accumulator gets the breakdown when present.
      costs?.record("generation", outcome.usage, outcome.reportedModel || outcome.model);
      return outcome.text;
    }

    case "ai_image": {
      // Calls the real Gemini image generation pipeline. The agent gets
      // back confirmation + the image ID; the image is stored in the
      // user's library exactly as if they had used the Image tool.
      const prompt = String(params.prompt ?? params.description ?? "");
      if (!prompt) return "Error: no image prompt provided.";
      try {
        const { callImage, imageApiKey, IMAGE_CALL_TIMEOUT_MS } = await import("@/lib/images/gemini-image");
        const { IMAGE_PREVIEW_MODEL } = await import("@/lib/images/image-pricing");
        const { imagePath, readAspect, variantPrompt } = await import("@/lib/images/image-studio");
        const { storePicture } = await import("@/lib/images/image-access");
        const apiKey = imageApiKey();
        if (!apiKey) return "Error: image generation is not configured (no API key).";
        const aspect = readAspect(params.aspect);
        const outcome = await callImage({ apiKey, model: IMAGE_PREVIEW_MODEL, prompt: variantPrompt(prompt, 0), aspect });
        if (!outcome.ok) return `Image generation ${outcome.kind === "refused" ? "was declined by the provider's safety rules" : "failed"}: ${outcome.detail ?? outcome.kind}`;
        const id = crypto.randomUUID();
        const path = imagePath(userId, id, "v0", outcome.mime);
        const stored = await storePicture(path, outcome.data, outcome.mime);
        if (!stored) return "Image was generated but could not be saved to storage.";
        // Write the row so it appears in the user's image library
        // (same shape the /api/images/generate route uses).
        const admin = createAdminClient();
        await admin.from("generated_images").insert({
          id, user_id: userId, prompt: prompt.slice(0, 500),
          aspect, variants: [{ index: 0, path, mime: outcome.mime, fullPath: null, previous: [] }],
          status: "done", credits_charged: 0,
        });
        return `Image generated successfully (ID: ${id}). It is now in the user's image library with description: "${prompt.slice(0, 100)}".`;
      } catch (err) {
        return `Image generation error: ${err instanceof Error ? err.message : "unknown"}`;
      }
    }

    case "ai_presentation": {
      // Calls the real presentation generation pipeline.
      const description = String(params.prompt ?? params.description ?? params.topic ?? "");
      if (!description) return "Error: no presentation topic provided.";
      try {
        const { generateDeck } = await import("@/lib/presentations/generate");
        const slideCount = Number(params.slideCount ?? params.slides ?? 8);
        const costsAcc = costs ?? new CostAccumulator();
        const result = await generateDeck({
          description,
          slideCount: Math.min(Math.max(slideCount, 3), 20),
          locale: String(params.locale ?? "en"),
          imageSource: "none",
          costs: costsAcc,
          userId,
        });
        if (!result.ok) return `Presentation generation failed: ${result.detail ?? result.kind}`;
        // Store the deck for the user (same table the route uses).
        const admin = createAdminClient();
        const { data: row } = await admin.from("ai_presentations").insert({
          user_id: userId,
          title: result.deck.title,
          description: description.slice(0, 500),
          slide_count: result.deck.slides.length,
          status: "draft",
          slides: result.deck,
          locale: String(params.locale ?? "en"),
          source: "agent",
        }).select("id").single();
        return `Presentation "${result.deck.title}" created${row ? ` (ID: ${row.id})` : ""} with ${result.deck.slides.length} slides. Saved to the user's presentations.`;
      } catch (err) {
        return `Presentation error: ${err instanceof Error ? err.message : "unknown"}`;
      }
    }

    case "ai_website": {
      // Calls the real website generation pipeline.
      const description = String(params.prompt ?? params.description ?? "");
      if (!description) return "Error: no website description provided.";
      try {
        const apiKey = process.env.ANTHROPIC_API_KEY;
        if (!apiKey) return "Error: website generation is not configured (no ANTHROPIC_API_KEY).";
        const { generateWebsiteHtml, classifyWebsiteDescription } = await import("@/lib/website-builder");
        const { websiteNameFrom } = await import("@/lib/website-name");
        const costsAcc = costs ?? new CostAccumulator();
        const classification = await classifyWebsiteDescription(apiKey, description, costsAcc);
        if (!classification.isWebsiteRequest) return `The description was not recognized as a website request: ${("message" in classification ? classification.message : "unclear description")}`;
        const name = websiteNameFrom(description);
        const admin = createAdminClient();
        const { data: row } = await admin.from("user_websites").insert({
          user_id: userId, name, description: description.slice(0, 1000),
          status: "generating",
        }).select("id").single();
        if (!row) return "Error: could not create website record.";
        const html = await generateWebsiteHtml(apiKey, description, /* referenceImages */ undefined, /* onDelta */ undefined, /* formEndpointUrl */ undefined, costsAcc);
        if (!html) {
          await admin.from("user_websites").update({ status: "failed" }).eq("id", row.id);
          return "Website generation failed: no HTML produced.";
        }
        await admin.from("user_websites").update({
          html, status: "ready",
        }).eq("id", row.id);
        return `Website "${name}" created (ID: ${row.id}). Status: ready. The user can view and edit it in their website builder.`;
      } catch (err) {
        return `Website error: ${err instanceof Error ? err.message : "unknown"}`;
      }
    }

    case "ai_video":
    case "ai_audio": {
      // Video and audio generation do not have internal pipelines yet.
      // These are genuinely not built — no route, no provider integration.
      // Being honest about it rather than faking a result.
      const mediaType = tool.id === "ai_video" ? "video" : "audio";
      return `${mediaType.charAt(0).toUpperCase() + mediaType.slice(1)} generation is not available yet — the ${mediaType} pipeline has not been integrated with a provider. The agent can use ai_chat to write scripts, ai_image for visuals, and ai_presentation for slide decks instead.`;
    }

    // ─── EMAIL TOOLS ───
    case "email_send":
    case "email_reply": {
      const to = String(params.to ?? params.recipient ?? "");
      const subject = String(params.subject ?? "");
      const body = String(params.body ?? params.content ?? params.message ?? "");
      if (!to || !body) return "Error: email requires 'to' and 'body' parameters.";

      // Send via the transactional email provider (Resend).
      try {
        const { createResendClient } = await import("@/lib/resend");
        const { senderAddress, emailIsDeliverable } = await import("@/lib/email/resend-config");

        if (!emailIsDeliverable()) {
          return "Email not configured: the platform email sender is not set up yet. Contact the platform admin.";
        }

        const resend = createResendClient();
        const { error } = await resend.emails.send({
          from: senderAddress(),
          to,
          subject: subject || "Message from your AI agent",
          text: body + "\n\n---\nSent by an AI agent on Ionexa",
        });

        if (error) return `Email send failed: ${error.message}`;
        return `Email sent to ${to} with subject "${subject || "Message from your AI agent"}".`;
      } catch (err) {
        return `Email error: ${err instanceof Error ? err.message : "unknown"}`;
      }
    }

    case "email_read": {
      return "Reading emails requires connecting a Gmail or Outlook account via OAuth. This is not yet available. The agent can send emails (email_send) and receive replies at the platform address.";
    }

    // ─── SOCIAL TOOLS ───
    // Social tools require OAuth connections to external platforms
    // (Twitter/X, Instagram, LinkedIn, Facebook). The agent can draft
    // content with ai_post and the user publishes it manually, or
    // connects their social accounts when the OAuth integration ships.
    case "social_post":
    case "social_schedule": {
      // Draft the content using AI so it's ready to post.
      const content = String(params.content ?? params.text ?? "");
      const platform = String(params.platform ?? "general");
      if (!content) return "Error: no content provided for social post.";

      const { runCompletion } = await import("@/lib/ai/providers/complete");
      const outcome = await runCompletion(
        {
          purpose: "agent_run",
          model: "default",
          maxTokens: 512,
          system: [{ type: "text", text: `You are a social media expert. Polish the following draft for ${platform}. Add relevant hashtags. Output ONLY the final post text, nothing else.` }],
          messages: [{ role: "user", content }],
        },
        { userId }
      );
      if (!outcome.ok) return `Error drafting post: ${outcome.detail ?? "failed"}`;
      costs?.record("generation", outcome.usage, outcome.reportedModel || outcome.model);
      return `Draft post ready for ${platform}:\n\n${outcome.text}\n\n⚠️ Auto-posting requires connecting your ${platform} account. The draft is ready — the user can copy and post it manually, or connect the account for auto-publishing.`;
    }

    case "social_analytics": {
      return "Social media analytics requires connecting social accounts (Twitter/X, Instagram, LinkedIn) via OAuth. This integration is not yet available. The agent can use analytics_report for business/payments analytics or analytics_competitors for market research.";
    }

    // ─── CALENDAR TOOLS ───
    // Calendar tools require Google Calendar or Outlook OAuth connection.
    case "calendar_check":
    case "calendar_create": {
      return "Calendar integration requires connecting a Google or Outlook calendar via OAuth. This is not yet available. The agent can send scheduling emails via email_send instead.";
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
      // Uses the same AI + web search pipeline as ai_research, focused
      // on competitive analysis.
      const { runCompletion } = await import("@/lib/ai/providers/complete");
      const query = String(params.industry ?? params.query ?? params.competitors ?? "");
      if (!query) return "Error: no industry or competitor query provided.";

      const outcome = await runCompletion(
        {
          purpose: "research",
          model: "default",
          maxTokens: 4096,
          system: [{ type: "text", text: "You are a competitive intelligence analyst. Research the competitive landscape for the given industry or company. Report: key competitors, their strengths and weaknesses, market positioning, pricing, and opportunities. Be thorough, factual, and cite sources." }],
          messages: [{ role: "user", content: `Competitive analysis: ${query}` }],
          serverWebSearch: { maxUses: 5 },
          requires: ["server_web_search"],
        },
        { userId }
      );

      if (!outcome.ok) return `Competitor analysis error: ${outcome.detail ?? "search failed"}`;
      costs?.record("generation", outcome.usage, outcome.reportedModel || outcome.model);
      return outcome.text;
    }

    default:
      return `Unknown tool: ${tool.id}`;
  }
}
