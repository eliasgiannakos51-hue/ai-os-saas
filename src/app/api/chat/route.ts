import { NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { createClient } from "@/lib/supabase/server";
import { logApiError } from "@/lib/log-error";
import { buildSystemPrompt, buildMentorSystemPrompt } from "@/lib/chat/system-prompt";
import { buildProfilePromptAddition } from "@/lib/profile/maturity";
import { getProfileState, listProfile } from "@/lib/profile/store";
import { listIntegrations } from "@/lib/integrations/store";
import {
  buildSearchTool,
  searchToolInstruction,
  executeSearchTool,
  SEARCH_TOOL_NAME,
  MAX_TOOL_ROUNDS,
} from "@/lib/integrations/chat-tool";
import { isAdminEmail } from "@/lib/admin";
import { hasActiveBetaBypass } from "@/lib/beta";
import { checkAiCallAllowed, fingerprintRequest, recordAiCallForDailySpend } from "@/lib/ai-circuit-breaker";
import {
  CREDIT_COSTS,
  hasEnoughCredits,
  insufficientCreditsMessage,
  resolveEffectivePlan,
  getPurchasedPackCreditPriceEur,
} from "@/lib/billing/credits";
import { CostAccumulator } from "@/lib/billing/cost-accumulator";
import { buildUsageReceipt } from "@/lib/billing/usage-receipt";
import { estimateForAction } from "@/lib/billing/estimate";
import { resolvePricingConfig } from "@/lib/billing/pricing-config";
import { effectiveCreditPriceEurForAccount } from "@/lib/billing/credit-formula";
import { reserveCredits, settleReservation, releaseReservation } from "@/lib/billing/reservations";
import { FREE_CHAT_LIMITS } from "@/lib/billing/free-chat";
import { consumeFreeChatMessage, releaseFreeChatMessage } from "@/lib/billing/free-chat-usage";
import { diagLog } from "@/lib/diag";
import {
  extractAndStoreMemory,
  loadRecentMemories,
  buildMemoryPromptAddition,
  isChatMemoryEnabled,
} from "@/lib/chat/memory";
import { findMentionedEntities, buildEntityMentionPromptAddition } from "@/lib/chat/entity-mentions";
import { loadMentorContext } from "@/lib/chat/mentor-context";
import { loadTradingMentorContext } from "@/lib/chat/trading-mentor-context";
import { loadProductMentorContext } from "@/lib/chat/product-mentor-context";
import { getUserFullContext, buildUserContextPromptAdditionGreek } from "@/lib/user-context";

export const dynamic = "force-dynamic";

// Streaming already avoids the worst version of the platform-timeout
// problem (partial text reaches the client immediately instead of the
// connection going silent then dying), but the function itself is still
// bounded by maxDuration regardless of streaming — a long Mentor Mode
// reply with a lot of context (memory + entity mentions + AI Life
// Context) plus the trailing memory-extraction call could otherwise
// still hit a low platform default. 180s covers a realistic worst case.
export const maxDuration = 180;

const MODEL = "claude-sonnet-4-6";
const MAX_MESSAGE_LENGTH = 10000;
const MAX_TOKENS = 2048;
const HISTORY_LIMIT = 20;
const MAX_PERSONA_NAME_LENGTH = 40;

// {name} is "Ionexa" by default — swapped for the account's custom
// persona name on plans with capabilities.customAiPersona (Ultimate+,
// see Settings > AI Persona and lib/billing/plans.ts).
// Appended to both personas below — the native web_search tool (see
// WEB_SEARCH_TOOL) lets the model look up real, current information
// instead of guessing/hallucinating numbers it can't actually know
// (prices, statistics, current events, "what's the average X in Y right
// now"). This instruction is the copyright/plagiarism safeguard: search
// results must be READ and paraphrased in the model's own words, never
// quoted/reproduced verbatim at length.
// Anthropic's native server-side web search tool — the model decides
// autonomously whether a given message actually needs a real search
// (offering the tool costs nothing by itself; Anthropic only bills for
// searches actually performed — see CREDIT_COSTS.webSearchPerQuery,
// charged below only when response.usage.server_tool_use
// .web_search_requests > 0). max_uses caps it at 3 real searches per
// single chat reply, so one message can't trigger unbounded search cost.
const WEB_SEARCH_TOOL: Anthropic.WebSearchTool20250305 = {
  type: "web_search_20250305",
  name: "web_search",
  max_uses: 3,
};

function truncateTitle(message: string, maxLen = 40): string {
  const trimmed = message.trim().replace(/\s+/g, " ");
  if (trimmed.length <= maxLen) return trimmed;
  return `${trimmed.slice(0, maxLen).trimEnd()}…`;
}

// Newline-delimited JSON: each line is one event. Chosen over SSE's
// "data: " framing since it needs no extra parsing on the client beyond
// splitting on "\n" — a plain fetch() + ReadableStream reader is enough.
function ndjsonLine(event: Record<string, unknown>): Uint8Array {
  return new TextEncoder().encode(`${JSON.stringify(event)}\n`);
}

export async function POST(request: Request) {
  try {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      return NextResponse.json(
        { ok: false, error: "ANTHROPIC_API_KEY is not configured on the server." },
        { status: 500 }
      );
    }

    let message: string;
    let conversationId: string | null;
    let mentorMode: boolean;
    let mentorPreset: string | null;
    try {
      const body = await request.json();
      message = typeof body?.message === "string" ? body.message.trim() : "";
      conversationId =
        typeof body?.conversationId === "string" && body.conversationId
          ? body.conversationId
          : null;
      mentorMode = body?.mentorMode === true;
      mentorPreset = typeof body?.mentorPreset === "string" ? body.mentorPreset : null;
    } catch {
      return NextResponse.json(
        { ok: false, error: "Invalid request body." },
        { status: 400 }
      );
    }

    if (!message) {
      return NextResponse.json(
        { ok: false, error: "Message is required." },
        { status: 400 }
      );
    }

    if (message.length > MAX_MESSAGE_LENGTH) {
      return NextResponse.json(
        {
          ok: false,
          error: `Message is too long (${message.length}/${MAX_MESSAGE_LENGTH} characters) — please shorten it and try again.`,
        },
        { status: 400 }
      );
    }

    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json(
        { ok: false, error: "Not authenticated." },
        { status: 401 }
      );
    }

    // Circuit breaker: independent of credits (see lib/ai-circuit-breaker.ts).
    const breakerCheck = await checkAiCallAllowed(
      user.id,
      "chat",
      fingerprintRequest(message, conversationId, String(mentorMode), mentorPreset)
    );
    if (!breakerCheck.allowed) {
      return NextResponse.json({ ok: true, rateLimited: true, message: breakerCheck.reason });
    }

    const plan = await resolveEffectivePlan(user);

    // Cross-conversation memory (see lib/chat/memory.ts) — off entirely
    // when the user has disabled it in Settings. Retention length is
    // plan-driven (capabilities.chatMemoryLimit — Ultimate+ keep more).
    const memoryEnabled = isChatMemoryEnabled(user);
    const memories = memoryEnabled
      ? await loadRecentMemories(supabase, user.id, plan.capabilities.chatMemoryLimit)
      : [];

    // Custom AI persona name (Ultimate+, see Settings > AI Persona) —
    // falls back to "Ionexa" for everyone else, or if the plan doesn't
    // include the capability even when a name is still saved from a
    // previous higher-tier subscription.
    const rawPersonaName = user.user_metadata?.ai_persona_name;
    const personaName =
      plan.capabilities.customAiPersona &&
      typeof rawPersonaName === "string" &&
      rawPersonaName.trim()
        ? rawPersonaName.trim().slice(0, MAX_PERSONA_NAME_LENGTH)
        : "Ionexa";
    // Knowledge graph: simple case-insensitive substring matching against
    // every module's headline field (see lib/chat/entity-mentions.ts) —
    // when the user mentions something they've already logged (e.g. an
    // Idea or Product by name), its linked entities (lib/entity-links.ts)
    // are surfaced here so the AI already "knows" the relationship without
    // being told again.
    const mentionedEntities = await findMentionedEntities(supabase, user.id, message);
    // Mentor Mode's proactive cross-module summary (lib/chat/mentor-context.ts)
    // only loads when the toggle is on — the default chat pays nothing extra
    // for it, per the brief.
    const mentorContext = mentorMode ? await loadMentorContext(supabase, user.id) : "";
    // Trading Workflow's "Trading Mentor" preset (see
    // trading-mentor-button.tsx) — only loaded when the client explicitly
    // opted into it via mentorPreset, on top of Mentor Mode already being
    // on. Every other chat request is unaffected.
    const tradingMentorContext =
      mentorMode && mentorPreset === "trading"
        ? await loadTradingMentorContext(supabase, user.id)
        : "";
    // Product Workflow's "Product Mentor" preset (see
    // product-mentor-button.tsx) — same on-demand-only pattern as trading
    // above, over the products table instead.
    const productMentorContext =
      mentorMode && mentorPreset === "product"
        ? await loadProductMentorContext(supabase, user.id)
        : "";
    // "AI Life Context" — a consolidated view of the user (recent entries
    // across every module, active missions, latest energy check-in,
    // Business Health Score, Knowledge Graph link counts — see
    // lib/user-context.ts) appended to EVERY chat request, not just Mentor
    // Mode, per the brief. Best-effort: a failure here degrades to no
    // extra context rather than breaking the chat request.
    let userContext = "";
    try {
      const fullContext = await getUserFullContext(supabase, user.id);
      userContext = buildUserContextPromptAdditionGreek(fullContext);
    } catch (err) {
      logApiError("/api/chat", err, { stage: "user_full_context" });
    }
    // V3 Task 3 — the user's own connected accounts.
    //
    // Both the tool and its instruction are built from what is ACTUALLY
    // connected, so an account with no integrations gets a byte-identical
    // request to the one it got before this feature existed: no extra tool
    // in the array, no extra text in the system prompt, and no tool loop.
    let integrationSearchTool: Anthropic.Tool | null = null;
    let integrationInstruction = "";
    try {
      const integrations = await listIntegrations(user.id);
      integrationSearchTool = buildSearchTool(integrations);
      if (integrationSearchTool) {
        integrationInstruction = searchToolInstruction(
          integrations.filter((i) => i.status === "connected").map((i) => i.provider)
        );
      }
    } catch (err) {
      // A failure here must never cost the user their message.
      logApiError("/api/chat", err, { stage: "integrations" });
    }

    // What the assistant has learned about this person from how they use
    // the product (V3 — AI Profile Maturity). Empty below Level 1, and
    // empty whenever the load fails: an assistant that knows nothing is
    // the normal starting state, and degrading to it costs the user a
    // slightly less tailored reply rather than their message.
    let profileAddition = "";
    try {
      const [state, observations] = await Promise.all([
        getProfileState(user.id),
        listProfile(user.id),
      ]);
      profileAddition = buildProfilePromptAddition({
        level: state.level,
        observations: observations.map((o) => ({
          category: o.category,
          observation: o.observation,
          confidence: o.confidence,
        })),
      });
    } catch (err) {
      logApiError("/api/chat", err, { stage: "learned_profile" });
    }

    const systemPrompt =
      (mentorMode ? buildMentorSystemPrompt(personaName) : buildSystemPrompt(personaName)) +
      profileAddition +
      buildMemoryPromptAddition(memories) +
      buildEntityMentionPromptAddition(mentionedEntities) +
      mentorContext +
      tradingMentorContext +
      productMentorContext +
      userContext +
      integrationInstruction;

    // Credits: 1 credit per Ionexa Chat message, deducted from user_credits
    // (see lib/billing/credits.ts), the same shared budget Create Anything
    // draws from. Admin-listed accounts (see lib/admin.ts) and beta
    // testers (see lib/beta.ts) skip this entirely — treated as unlimited.
    // Only a READ-ONLY check happens here (reject early, before even
    // creating/touching the conversation, if obviously insufficient); the
    // actual DEDUCT happens inside the stream below, only once Claude has
    // confirmed-successfully returned a real reply — see the
    // deductCredits call right after claudeStream.finalMessage(). If the
    // stream throws or the model returns nothing, no deduction ever runs.
    const isAdmin = isAdminEmail(user.email);
    const bypassCredits = isAdmin || (await hasActiveBetaBypass(user));

    // Estimated from the real size of THIS request — the message plus the
    // conversation history that gets re-sent with it, plus the system
    // prompt this route composes from memory/mentor/user context. The old
    // flat CREDIT_COSTS.chatMessage charged 1 credit whether the reply was
    // two sentences or two thousand words, and charged nothing at all for
    // the tokens the accumulated history contributed.
    const pricingConfig = resolvePricingConfig();
    const accountCreditPriceEur = bypassCredits
      ? pricingConfig.creditPriceEur
      : effectiveCreditPriceEurForAccount(
          plan,
          await getPurchasedPackCreditPriceEur(user.id),
          pricingConfig
        );
    // FREE CHAT. Claimed before any credit machinery runs, because a
    // granted free message skips the reserve/settle path entirely.
    //
    // Only offered for a message that already fits the free envelope: a
    // longer one falls through to the normal paid path rather than being
    // rejected, so the cap never turns into an error the user has to
    // understand. Admins and beta testers already pay nothing, so
    // spending their allowance on them would be pure bookkeeping.
    const freeGrant =
      !bypassCredits && message.length <= FREE_CHAT_LIMITS.maxMessageChars
        ? await consumeFreeChatMessage(user.id, plan?.slug ?? "free")
        : null;
    const isFreeMessage = freeGrant?.granted === true;

    // The pre-check runs before the conversation history is loaded, so it
    // sizes on the message and system prompt alone. The real reserve, taken
    // just before the stream, adds the history — see reserveCredits below.
    const estimate = estimateForAction(
      "chatMessage",
      {
        model: MODEL,
        inputChars: message.length + systemPrompt.length,
        // The tool is offered on every message but only billed when the
        // model really searches. Budgeting for one keeps the hold from
        // being short on the replies that do search, and the difference
        // is released when they don't.
        expectedWebSearches: 1,
      },
      pricingConfig,
      accountCreditPriceEur
    );

    if (!bypassCredits && !isFreeMessage) {
      const check = await hasEnoughCredits(user.id, estimate.reserveCredits, plan);
      if (!check.ok) {
        return NextResponse.json({
          ok: true,
          rateLimited: true,
          message: insufficientCreditsMessage(check.remaining, estimate.reserveCredits),
        });
      }
    }

    // Resolve the conversation: reuse an existing one (verifying ownership
    // via RLS — a stranger's id simply won't be found) or start a new one,
    // titled from this first message so it doesn't need a second write.
    let isNewConversation = false;
    let newConversationTitle: string | undefined;
    if (conversationId) {
      const { data: existing, error: convError } = await supabase
        .from("chat_conversations")
        .select("id")
        .eq("id", conversationId)
        .maybeSingle();

      if (convError) {
        logApiError("/api/chat", convError, { stage: "load_conversation" });
        if (isFreeMessage) await releaseFreeChatMessage(user.id);
        return NextResponse.json(
          { ok: false, error: "Could not load that conversation." },
          { status: 500 }
        );
      }
      if (!existing) {
        if (isFreeMessage) await releaseFreeChatMessage(user.id);
        return NextResponse.json(
          { ok: false, error: "Conversation not found." },
          { status: 404 }
        );
      }
    } else {
      newConversationTitle = truncateTitle(message);
      const { data: newConversation, error: createConvError } = await supabase
        .from("chat_conversations")
        .insert({ user_id: user.id, title: newConversationTitle })
        .select("id")
        .single();

      if (createConvError || !newConversation) {
        logApiError("/api/chat", createConvError, { stage: "create_conversation" });
        if (isFreeMessage) await releaseFreeChatMessage(user.id);
        return NextResponse.json(
          { ok: false, error: "Could not start a new conversation." },
          { status: 500 }
        );
      }
      conversationId = newConversation.id;
      isNewConversation = true;
    }

    // Prior turns for context (oldest first) — empty for a brand-new
    // conversation, since there's nothing to load yet.
    const { data: historyRows, error: historyError } = await supabase
      .from("chat_messages")
      .select("role, content")
      .eq("conversation_id", conversationId)
      .order("created_at", { ascending: false })
      .limit(HISTORY_LIMIT);

    if (historyError) {
      logApiError("/api/chat", historyError, { stage: "load_history" });
      if (isFreeMessage) await releaseFreeChatMessage(user.id);
      return NextResponse.json(
        { ok: false, error: "Could not load conversation history." },
        { status: 500 }
      );
    }

    const history = (historyRows ?? []).reverse() as {
      role: "user" | "assistant";
      content: string;
    }[];

    // Save the user's message right away so it's durable even if the
    // Claude call below fails.
    const { error: userMessageError } = await supabase.from("chat_messages").insert({
      conversation_id: conversationId,
      user_id: user.id,
      role: "user",
      content: message,
    });

    if (userMessageError) {
      logApiError("/api/chat", userMessageError, { stage: "save_user_message" });
      return NextResponse.json(
        { ok: false, error: "Could not save your message." },
        { status: 500 }
      );
    }

    const anthropic = new Anthropic({ apiKey });
    const finalConversationId = conversationId;

    const stream = new ReadableStream({
      async start(controller) {
        controller.enqueue(
          ndjsonLine({
            type: "meta",
            conversationId: finalConversationId,
            isNewConversation,
            title: newConversationTitle,
            // So the composer can say how many free messages are left the
            // moment one is used, rather than on the next page load.
            freeMessage: isFreeMessage,
            freeRemaining: freeGrant?.granted ? freeGrant.remaining : undefined,
          })
        );

        let assistantText = "";
        let webSearchCount = 0;

        // RESERVE, now that the full request (history included) is known.
        // Taken inside the stream but BEFORE the Anthropic call, so a
        // second concurrent message sees a balance that already excludes
        // this one.
        const costs = new CostAccumulator();

        // A free message runs in a smaller envelope than a paid one: a
        // short history window, a shorter reply, and no web search. That
        // is what makes the worst case affordable enough to give away —
        // see lib/billing/free-chat.ts for the arithmetic. Paid messages
        // are completely unchanged.
        const effectiveHistory = isFreeMessage
          ? history.slice(-FREE_CHAT_LIMITS.historyLimit)
          : history;
        const effectiveMaxTokens = isFreeMessage
          ? FREE_CHAT_LIMITS.maxOutputTokens
          : MAX_TOKENS;
        // Explicitly typed: the array is heterogeneous now (a server tool
        // plus, sometimes, a custom one), and the ternary's inferred type
        // would not accept both.
        const effectiveTools: Anthropic.ToolUnion[] = isFreeMessage
          ? []
          : integrationSearchTool
            ? [WEB_SEARCH_TOOL, integrationSearchTool]
            : [WEB_SEARCH_TOOL];

        const historyChars = effectiveHistory.reduce((sum, m) => sum + m.content.length, 0);
        const streamEstimate = estimateForAction(
          "chatMessage",
          {
            model: MODEL,
            inputChars: message.length + historyChars + systemPrompt.length,
            expectedWebSearches: isFreeMessage ? 0 : 1,
          },
          pricingConfig,
          accountCreditPriceEur
        );

        let reservationId = "";
        if (!bypassCredits && !isFreeMessage) {
          const reservation = await reserveCredits(user.id, streamEstimate.reserveCredits, "chat_message", {
            conversationId: finalConversationId,
            estimatedCredits: streamEstimate.estimatedCredits,
          });
          if (!reservation.ok) {
            controller.enqueue(
              ndjsonLine({
                type: "error",
                error:
                  reservation.reason === "insufficient"
                    ? `Not enough credits for this message (you have ${reservation.available}, this needs about ${streamEstimate.reserveCredits}). No credits were charged.`
                    : "Could not reserve credits for this message. No credits were charged — please try again.",
                outOfCredits: reservation.reason === "insufficient",
              })
            );
            controller.close();
            return;
          }
          reservationId = reservation.reservationId;
        }

        try {
          void recordAiCallForDailySpend(streamEstimate.estimatedCredits);

          // The conversation as sent to the model. It grows only when the
          // model asks to use the integration tool: an assistant turn
          // carrying the tool_use block, then a user turn carrying the
          // result. Without a connected integration this loop runs exactly
          // once and is indistinguishable from the single call that was
          // here before.
          const conversation: Anthropic.MessageParam[] = [
            ...effectiveHistory.map((m) => ({ role: m.role, content: m.content })),
            { role: "user" as const, content: message },
          ];

          for (let round = 0; round <= MAX_TOOL_ROUNDS; round++) {
            const claudeStream = anthropic.messages.stream({
              model: MODEL,
              max_tokens: effectiveMaxTokens,
              system: systemPrompt,
              messages: conversation,
              tools: effectiveTools,
            });

            claudeStream.on("text", (delta) => {
              assistantText += delta;
              controller.enqueue(ndjsonLine({ type: "delta", text: delta }));
            });

            const finalResponse = await claudeStream.finalMessage();
            // Every round is recorded. A turn that searched the user's mail
            // and then answered is two model calls, and both are settled
            // against the same reservation — a loop that recorded only its
            // last round would charge for part of the work it did.
            costs.record("generation", finalResponse.usage, MODEL);
            webSearchCount += finalResponse.usage.server_tool_use?.web_search_requests ?? 0;

            const toolUses = finalResponse.content.filter(
              (block): block is Anthropic.ToolUseBlock =>
                block.type === "tool_use" && block.name === SEARCH_TOOL_NAME
            );
            // Not a tool round (or the ceiling is reached) — this is the
            // final answer. On the ceiling the model simply never sees
            // another result, and answers with what it has.
            if (toolUses.length === 0 || round === MAX_TOOL_ROUNDS) break;

            conversation.push({ role: "assistant", content: finalResponse.content });
            const results = await Promise.all(
              toolUses.map(async (toolUse) => {
                const executed = await executeSearchTool({ userId: user.id, input: toolUse.input });
                return {
                  type: "tool_result" as const,
                  tool_use_id: toolUse.id,
                  content: executed.content,
                };
              })
            );
            conversation.push({ role: "user", content: results });
          }
        } catch (err) {
          logApiError("/api/chat", err, { stage: "anthropic_stream" });
          await releaseReservation(user.id, reservationId);
          if (isFreeMessage) await releaseFreeChatMessage(user.id);
          const errMessage = err instanceof Error ? err.message : "Chat request failed.";
          controller.enqueue(
            ndjsonLine({ type: "error", error: `${errMessage} No credits were charged — please try again.` })
          );
          controller.close();
          return;
        }

        if (!assistantText.trim()) {
          await releaseReservation(user.id, reservationId);
          if (isFreeMessage) await releaseFreeChatMessage(user.id);
          controller.enqueue(
            ndjsonLine({
              type: "error",
              error: "The model did not return a response. No credits were charged — please try again.",
            })
          );
          controller.close();
          return;
        }

        // Memory extraction runs BEFORE settlement, not after.
        //
        // It is a second real Claude call, and while it sat after the
        // settle it could not be billed at all — the accumulator had
        // already been spent. Running it first folds its tokens into the
        // same settlement as the reply, so one chat turn is one charge
        // covering both calls. Nothing about user-visible latency
        // changes: the reply has already fully streamed by this point
        // either way. Best-effort, and awaited so it reliably finishes
        // before the response stream closes (see lib/chat/memory.ts).
        if (memoryEnabled) {
          await extractAndStoreMemory({
            apiKey,
            supabase,
            userId: user.id,
            conversationId: finalConversationId!,
            userMessage: message,
            assistantMessage: assistantText,
            costs,
          });
        }

        // Confirmed success — a real reply streamed all the way through,
        // so this is the one place the message actually gets charged.
        // Settlement charges the real measured cost and releases the rest
        // of the hold; the separate per-search deduction is gone because
        // searches are already inside the usage recorded above.
        const settlement = await settleReservation({
          userId: user.id,
          reservationId,
          feature: isFreeMessage ? "chat_free" : "chat_message",
          costs,
          plan,
          bypassCharge: bypassCredits || isFreeMessage,
          metadata: {
            conversationId: finalConversationId,
            webSearches: webSearchCount,
            replyChars: assistantText.length,
            estimatedCredits: streamEstimate.estimatedCredits,
            reservedCredits: bypassCredits || isFreeMessage ? 0 : streamEstimate.reserveCredits,
            freeMessage: isFreeMessage,
            freeRemaining: isFreeMessage && freeGrant?.granted ? freeGrant.remaining : undefined,
          },
        });
        diagLog(
          `[billing] chat_message settled: ${JSON.stringify({
            userId: user.id,
            conversationId: finalConversationId,
            realCostUsd: settlement.realCostUsd,
            creditsCharged: settlement.creditsCharged,
            achievedMargin: settlement.achievedMargin,
            webSearches: webSearchCount,
          })}`
        );

        const { error: assistantMessageError } = await supabase.from("chat_messages").insert({
          conversation_id: finalConversationId,
          user_id: user.id,
          role: "assistant",
          content: assistantText,
        });
        if (assistantMessageError) {
          logApiError("/api/chat", assistantMessageError, { stage: "save_assistant_message" });
        }

        // Touches updated_at via the set_updated_at trigger so the
        // conversation resorts to the top of the list; harmless no-op on a
        // brand-new conversation, whose updated_at is already "now".
        const { error: touchError } = await supabase
          .from("chat_conversations")
          .update({ updated_at: new Date().toISOString() })
          .eq("id", finalConversationId);
        if (touchError) {
          logApiError("/api/chat", touchError, { stage: "touch_conversation" });
        }

        // The client needs to know what that reply cost. Without this the
        // charge existed only in the database: the counter did not move
        // until a full reload, and nothing said what had been spent.
        controller.enqueue(
          ndjsonLine({
            type: "done",
            usage: buildUsageReceipt({
              creditsCharged: settlement.creditsCharged,
              bypass: bypassCredits || isFreeMessage,
              wouldHaveCharged: null,
              freeRemaining: isFreeMessage && freeGrant?.granted ? freeGrant.remaining : null,
            }),
          })
        );
        controller.close();
      },
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "application/x-ndjson; charset=utf-8",
        "Cache-Control": "no-cache",
      },
    });
  } catch (err) {
    logApiError("/api/chat", err);
    return NextResponse.json(
      { ok: false, error: "Something went wrong. Please try again." },
      { status: 500 }
    );
  }
}
