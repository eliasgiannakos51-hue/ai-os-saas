import { NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { createClient } from "@/lib/supabase/server";
import { logApiError } from "@/lib/log-error";

export const dynamic = "force-dynamic";

const MODEL = "claude-sonnet-4-6";
const MAX_MESSAGE_LENGTH = 4000;
const MAX_TOKENS = 2048;
const HISTORY_LIMIT = 20;
const RATE_LIMIT = 20;
const RATE_LIMIT_WINDOW_MS = 60 * 60 * 1000;

const SYSTEM_PROMPT =
  "Είσαι ο Veron, ένας γενικού σκοπού AI βοηθός με ευρεία γνώση, παρόμοιος με το Claude ή το ChatGPT. Απάντησε φυσικά, εξυπηρετικά, σε οποιοδήποτε θέμα ρωτηθείς — όχι μόνο για τα modules του Veron AI. Χρησιμοποίησε το ιστορικό της συνομιλίας για context.";

function truncateTitle(message: string, maxLen = 40): string {
  const trimmed = message.trim().replace(/\s+/g, " ");
  if (trimmed.length <= maxLen) return trimmed;
  return `${trimmed.slice(0, maxLen).trimEnd()}…`;
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
    try {
      const body = await request.json();
      message = typeof body?.message === "string" ? body.message.trim() : "";
      conversationId =
        typeof body?.conversationId === "string" && body.conversationId
          ? body.conversationId
          : null;
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

    // Rate limit: max RATE_LIMIT user messages per user per rolling hour —
    // same technique as /api/create's create_requests check, but scoped to
    // chat_messages so Veron Chat and Create Anything have independent
    // budgets instead of sharing one counter.
    const windowStart = new Date(Date.now() - RATE_LIMIT_WINDOW_MS).toISOString();
    const { count: recentMessageCount, error: usageCheckError } = await supabase
      .from("chat_messages")
      .select("id", { count: "exact", head: true })
      .eq("user_id", user.id)
      .eq("role", "user")
      .gte("created_at", windowStart);

    if (usageCheckError) {
      logApiError("/api/chat", usageCheckError, { stage: "usage_check" });
    } else if ((recentMessageCount ?? 0) >= RATE_LIMIT) {
      return NextResponse.json({
        ok: true,
        rateLimited: true,
        message: `You've hit the hourly limit for Veron Chat (${RATE_LIMIT} messages/hour) — try again in a bit.`,
      });
    }

    // Resolve the conversation: reuse an existing one (verifying ownership
    // via RLS — a stranger's id simply won't be found) or start a new one,
    // titled from this first message so it doesn't need a second write.
    let isNewConversation = false;
    if (conversationId) {
      const { data: existing, error: convError } = await supabase
        .from("chat_conversations")
        .select("id")
        .eq("id", conversationId)
        .maybeSingle();

      if (convError) {
        logApiError("/api/chat", convError, { stage: "load_conversation" });
        return NextResponse.json(
          { ok: false, error: "Could not load that conversation." },
          { status: 500 }
        );
      }
      if (!existing) {
        return NextResponse.json(
          { ok: false, error: "Conversation not found." },
          { status: 404 }
        );
      }
    } else {
      const { data: newConversation, error: createConvError } = await supabase
        .from("chat_conversations")
        .insert({ user_id: user.id, title: truncateTitle(message) })
        .select("id")
        .single();

      if (createConvError || !newConversation) {
        logApiError("/api/chat", createConvError, { stage: "create_conversation" });
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

    let assistantText: string;
    try {
      const response = await anthropic.messages.create({
        model: MODEL,
        max_tokens: MAX_TOKENS,
        system: SYSTEM_PROMPT,
        messages: [
          ...history.map((m) => ({ role: m.role, content: m.content })),
          { role: "user" as const, content: message },
        ],
      });

      assistantText = response.content
        .filter((block): block is Anthropic.TextBlock => block.type === "text")
        .map((block) => block.text)
        .join("\n\n")
        .trim();

      if (!assistantText) {
        return NextResponse.json(
          { ok: false, error: "The model did not return a response.", conversationId },
          { status: 502 }
        );
      }
    } catch (err) {
      logApiError("/api/chat", err, { stage: "anthropic_call" });
      const errMessage = err instanceof Error ? err.message : "Chat request failed.";
      return NextResponse.json(
        { ok: false, error: errMessage, conversationId },
        { status: 502 }
      );
    }

    const { error: assistantMessageError } = await supabase.from("chat_messages").insert({
      conversation_id: conversationId,
      user_id: user.id,
      role: "assistant",
      content: assistantText,
    });

    if (assistantMessageError) {
      logApiError("/api/chat", assistantMessageError, { stage: "save_assistant_message" });
    }

    // Touches updated_at via the set_updated_at trigger so the conversation
    // resorts to the top of the list; harmless no-op on a brand-new
    // conversation, whose updated_at is already "now" from its insert.
    const { data: conversationRow, error: touchError } = await supabase
      .from("chat_conversations")
      .update({ updated_at: new Date().toISOString() })
      .eq("id", conversationId)
      .select("title")
      .single();

    if (touchError) {
      logApiError("/api/chat", touchError, { stage: "touch_conversation" });
    }

    return NextResponse.json({
      ok: true,
      conversationId,
      isNewConversation,
      title: conversationRow?.title ?? undefined,
      message: assistantText,
    });
  } catch (err) {
    logApiError("/api/chat", err);
    return NextResponse.json(
      { ok: false, error: "Something went wrong. Please try again." },
      { status: 500 }
    );
  }
}
