import { NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { createClient } from "@/lib/supabase/server";
import { logApiError } from "@/lib/log-error";
import { isAdminEmail } from "@/lib/admin";
import { hasActiveBetaBypass } from "@/lib/beta";
import {
  CREDIT_COSTS,
  deductCredits,
  insufficientCreditsMessage,
  resolveEffectivePlan,
} from "@/lib/billing/credits";
import {
  extractAndStoreMemory,
  loadRecentMemories,
  buildMemoryPromptAddition,
  isChatMemoryEnabled,
} from "@/lib/chat/memory";
import { findMentionedEntities, buildEntityMentionPromptAddition } from "@/lib/chat/entity-mentions";
import { loadMentorContext } from "@/lib/chat/mentor-context";
import { loadTradingMentorContext } from "@/lib/chat/trading-mentor-context";
import { getUserFullContext, buildUserContextPromptAdditionGreek } from "@/lib/user-context";

export const dynamic = "force-dynamic";

const MODEL = "claude-sonnet-4-6";
const MAX_MESSAGE_LENGTH = 5000;
const MAX_TOKENS = 2048;
const HISTORY_LIMIT = 20;
const MAX_PERSONA_NAME_LENGTH = 40;

// {name} is "Ionexa" by default — swapped for the account's custom
// persona name on plans with capabilities.customAiPersona (Ultimate+,
// see Settings > AI Persona and lib/billing/plans.ts).
function buildSystemPrompt(personaName: string): string {
  return `Είσαι ο/η ${personaName}, ένας εξελιγμένος AI βοηθός γενικής χρήσης. Έχεις ευρεία γνώση σε όλα τα θέματα (επιστήμη, ιστορία, προγραμματισμός, μαθηματικά, δημιουργική γραφή, επιχειρήσεις, καθημερινές ερωτήσεις, κ.λπ.) και μπορείς να βοηθήσεις με οτιδήποτε χρειαστεί ο χρήστης. ΑΠΑΝΤΑ ΠΑΝΤΑ ΣΤΗΝ ΙΔΙΑ ΓΛΩΣΣΑ που σου γράφει ο χρήστης (ανίχνευσε αυτόματα τη γλώσσα του μηνύματος — ελληνικά, αγγλικά, ή οποιαδήποτε άλλη γλώσσα). Δώσε λεπτομερείς, χρήσιμες, ακριβείς απαντήσεις — προτίμησε μια ελαφρώς πιο εκτενή, ουσιαστική απάντηση αντί για μια πολύ σύντομη, χωρίς όμως να γίνεσαι φλύαρος ή να επαναλαμβάνεσαι. Όπου έχει νόημα για το ερώτημα (εξηγήσεις εννοιών, τεχνικά θέματα, "πώς κάνω Χ"), συμπλήρωσε τον ορισμό/την εξήγηση με ένα σύντομο πρακτικό παράδειγμα ή use case, όχι μόνο θεωρία — αλλά μην το κάνεις αυτό όταν ο χρήστης ζητάει ρητά κάτι σύντομο (π.χ. ναι/όχι, ένας αριθμός, μια γρήγορη μετάφραση) ή όταν ένα παράδειγμα δεν έχει φυσικό νόημα. Χρησιμοποίησε markdown formatting όπου βοηθάει (code blocks, λίστες, bold) για ευανάγνωστες απαντήσεις.`;
}

// Mentor Mode (toggled client-side, see chat-workspace.tsx's "Mentor Mode"
// button) — an alternative persona for when the user wants strategic
// pushback instead of a straight, executional answer. Only ever swapped in
// for that one request's system prompt; the default persona/behavior above
// is untouched otherwise.
function buildMentorSystemPrompt(personaName: string): string {
  return `Είσαι ο/η ${personaName} Mentor — δεν δίνεις μόνο απαντήσεις, δίνεις επιχειρηματική/στρατηγική καθοδήγηση. Όταν ο χρήστης περιγράφει ένα σχέδιο/ιδέα, ΜΗΝ απαντάς μόνο εκτελεστικά — επισήμανε πιθανά ρίσκα, ρώτησε διευκρινιστικές ερωτήσεις που θα ρωτούσε ένας έμπειρος σύμβουλος, και πρότεινε εναλλακτικές όπου έχει νόημα. Χρησιμοποίησε τα δεδομένα του χρήστη (modules/entries) ως context όταν είναι σχετικό. ΑΠΑΝΤΑ ΠΑΝΤΑ ΣΤΗΝ ΙΔΙΑ ΓΛΩΣΣΑ που σου γράφει ο χρήστης (ανίχνευσε αυτόματα τη γλώσσα του μηνύματος). Χρησιμοποίησε markdown formatting όπου βοηθάει (code blocks, λίστες, bold) για ευανάγνωστες απαντήσεις.`;
}

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
    const systemPrompt =
      (mentorMode ? buildMentorSystemPrompt(personaName) : buildSystemPrompt(personaName)) +
      buildMemoryPromptAddition(memories) +
      buildEntityMentionPromptAddition(mentionedEntities) +
      mentorContext +
      tradingMentorContext +
      userContext;

    // Credits: 1 credit per Ionexa Chat message, deducted from user_credits
    // (see lib/billing/credits.ts), the same shared budget Create Anything
    // draws from. Admin-listed accounts (see lib/admin.ts) and beta
    // testers (see lib/beta.ts) skip this entirely — treated as unlimited.
    const isAdmin = isAdminEmail(user.email);
    if (!isAdmin && !(await hasActiveBetaBypass(user))) {
      const deduction = await deductCredits(
        user.id,
        CREDIT_COSTS.chatMessage,
        "chat_message",
        "Ionexa Chat message",
        plan
      );
      if (!deduction.ok) {
        return NextResponse.json({
          ok: true,
          rateLimited: true,
          message: insufficientCreditsMessage(deduction.remaining, CREDIT_COSTS.chatMessage),
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
      newConversationTitle = truncateTitle(message);
      const { data: newConversation, error: createConvError } = await supabase
        .from("chat_conversations")
        .insert({ user_id: user.id, title: newConversationTitle })
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
    const finalConversationId = conversationId;

    const stream = new ReadableStream({
      async start(controller) {
        controller.enqueue(
          ndjsonLine({
            type: "meta",
            conversationId: finalConversationId,
            isNewConversation,
            title: newConversationTitle,
          })
        );

        let assistantText = "";
        try {
          const claudeStream = anthropic.messages.stream({
            model: MODEL,
            max_tokens: MAX_TOKENS,
            system: systemPrompt,
            messages: [
              ...history.map((m) => ({ role: m.role, content: m.content })),
              { role: "user" as const, content: message },
            ],
          });

          claudeStream.on("text", (delta) => {
            assistantText += delta;
            controller.enqueue(ndjsonLine({ type: "delta", text: delta }));
          });

          await claudeStream.finalMessage();
        } catch (err) {
          logApiError("/api/chat", err, { stage: "anthropic_stream" });
          const errMessage = err instanceof Error ? err.message : "Chat request failed.";
          controller.enqueue(ndjsonLine({ type: "error", error: errMessage }));
          controller.close();
          return;
        }

        if (!assistantText.trim()) {
          controller.enqueue(
            ndjsonLine({ type: "error", error: "The model did not return a response." })
          );
          controller.close();
          return;
        }

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

        // Best-effort, awaited so it reliably finishes before the response
        // stream closes (see lib/chat/memory.ts) — adds a little latency
        // after the visible reply has already fully streamed in, not before.
        if (memoryEnabled) {
          await extractAndStoreMemory({
            apiKey,
            supabase,
            userId: user.id,
            conversationId: finalConversationId!,
            userMessage: message,
            assistantMessage: assistantText,
          });
        }

        controller.enqueue(ndjsonLine({ type: "done" }));
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
