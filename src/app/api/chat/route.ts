import { NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { createClient } from "@/lib/supabase/server";
import { logApiError } from "@/lib/log-error";
import { isAdminEmail } from "@/lib/admin";
import { hasActiveBetaBypass } from "@/lib/beta";
import { checkAiCallAllowed, fingerprintRequest, recordAiCallForDailySpend } from "@/lib/ai-circuit-breaker";
import {
  CREDIT_COSTS,
  deductCredits,
  hasEnoughCredits,
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
import { loadProductMentorContext } from "@/lib/chat/product-mentor-context";
import { getUserFullContext, buildUserContextPromptAdditionGreek } from "@/lib/user-context";
import { AI_QUALITY_CHECKLIST_EL } from "@/lib/ai-quality-checklist";

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
const WEB_SEARCH_INSTRUCTION = `

Έχεις πρόσβαση σε εργαλείο αναζήτησης στο διαδίκτυο (web search). Χρησιμοποίησέ το όταν ο χρήστης ζητάει πραγματικά, τρέχοντα στοιχεία που δεν μπορείς να ξέρεις με σιγουριά μόνος/η σου (τρέχουσες τιμές, στατιστικά, πρόσφατα γεγονότα, "ποια είναι η μέση τιμή X σε Y σήμερα"). ΜΗΝ χρησιμοποιείς αναζήτηση για γενικές ερωτήσεις γνώσης που ήδη ξέρεις καλά. ΣΗΜΑΝΤΙΚΟ (πνευματικά δικαιώματα): όταν χρησιμοποιείς αποτελέσματα αναζήτησης, ΠΑΡΑΦΡΑΣΕ τα ευρήματα με δικά σου λόγια — ΜΗΝ αντιγράφεις κείμενο αυτούσιο από τις πηγές. Ανέφερε την πηγή (π.χ. όνομα site) όταν είναι χρήσιμο, αλλά η απάντηση πρέπει να είναι δική σου σύνοψη, όχι αντιγραφή.`;

// Legal/tax/investment disclaimer — applies to both personas below (so it
// covers Ionexa Chat, Mentor Mode, and the Trading Mentor preset, which is
// this app's only AI entry point associated with Trading Workflow —
// Trading Workflow's own "Pattern Insight" card is fully deterministic
// win-rate/streak math with no AI call, so there's no separate system
// prompt for it to reach). Applies to product/business questions too, not
// only trading — "νομικά θέματα" in the brief is general-purpose.
const REGULATED_ADVICE_INSTRUCTION = `

ΣΗΜΑΝΤΙΚΟ — φόροι/νομικά/επενδύσεις: αν ο χρήστης ρωτήσει για φόρους, νομικά θέματα, ή ζητήσει συγκεκριμένη επενδυτική συμβουλή (πού να βάλει τα χρήματά του, τι μετοχή/asset να αγοράσει, πώς να μειώσει φόρους, ποια εταιρική δομή να επιλέξει για φορολογικούς λόγους), μπορείς να δώσεις ΓΕΝΙΚΕΣ, εκπαιδευτικές πληροφορίες αν τις γνωρίζεις, αλλά ΠΑΝΤΑ πρόσθεσε ρητή σύσταση στο τέλος: "Δεν είμαι φορολογικός/νομικός/επενδυτικός σύμβουλος — για [φόρους/νομικά θέματα/επενδυτικές αποφάσεις] που αφορούν τη δική σου κατάσταση, συμβουλέψου πραγματικό λογιστή/δικηγόρο/αδειοδοτημένο επενδυτικό σύμβουλο." ΜΗΝ δώσεις συγκεκριμένη, εξατομικευμένη νομική/φορολογική/επενδυτική σύσταση (π.χ. "αγόρασε αυτή τη μετοχή", "κάνε εταιρεία στο Χ αντί για Υ για να πληρώσεις λιγότερο φόρο") — μόνο γενική εκπαίδευση + ρητή παραπομπή σε ειδικό.`;

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

function buildSystemPrompt(personaName: string): string {
  return `Είσαι ο/η ${personaName}, ένας εξελιγμένος AI βοηθός γενικής χρήσης. Έχεις ευρεία γνώση σε όλα τα θέματα (επιστήμη, ιστορία, προγραμματισμός, μαθηματικά, δημιουργική γραφή, επιχειρήσεις, καθημερινές ερωτήσεις, κ.λπ.) και μπορείς να βοηθήσεις με οτιδήποτε χρειαστεί ο χρήστης. ΑΠΑΝΤΑ ΠΑΝΤΑ ΣΤΗΝ ΙΔΙΑ ΓΛΩΣΣΑ που σου γράφει ο χρήστης (ανίχνευσε αυτόματα τη γλώσσα του μηνύματος — ελληνικά, αγγλικά, ή οποιαδήποτε άλλη γλώσσα). Δώσε λεπτομερείς, χρήσιμες, ακριβείς απαντήσεις — προτίμησε μια ελαφρώς πιο εκτενή, ουσιαστική απάντηση αντί για μια πολύ σύντομη, χωρίς όμως να γίνεσαι φλύαρος ή να επαναλαμβάνεσαι. Όπου έχει νόημα για το ερώτημα (εξηγήσεις εννοιών, τεχνικά θέματα, "πώς κάνω Χ"), συμπλήρωσε τον ορισμό/την εξήγηση με ένα σύντομο πρακτικό παράδειγμα ή use case, όχι μόνο θεωρία — αλλά μην το κάνεις αυτό όταν ο χρήστης ζητάει ρητά κάτι σύντομο (π.χ. ναι/όχι, ένας αριθμός, μια γρήγορη μετάφραση) ή όταν ένα παράδειγμα δεν έχει φυσικό νόημα. Χρησιμοποίησε markdown formatting όπου βοηθάει (code blocks, λίστες, bold) για ευανάγνωστες απαντήσεις.${WEB_SEARCH_INSTRUCTION}${REGULATED_ADVICE_INSTRUCTION}${AI_QUALITY_CHECKLIST_EL}`;
}

// Mentor Mode (toggled client-side, see chat-workspace.tsx's "Mentor Mode"
// button) — an alternative persona for when the user wants strategic
// pushback instead of a straight, executional answer. Only ever swapped in
// for that one request's system prompt; the default persona/behavior above
// is untouched otherwise.
function buildMentorSystemPrompt(personaName: string): string {
  return `Είσαι ο/η ${personaName} Mentor — δεν δίνεις μόνο απαντήσεις, δίνεις επιχειρηματική/στρατηγική καθοδήγηση. Όταν ο χρήστης περιγράφει ένα σχέδιο/ιδέα, ΜΗΝ απαντάς μόνο εκτελεστικά — επισήμανε πιθανά ρίσκα, ρώτησε διευκρινιστικές ερωτήσεις που θα ρωτούσε ένας έμπειρος σύμβουλος, και πρότεινε εναλλακτικές όπου έχει νόημα. Χρησιμοποίησε τα δεδομένα του χρήστη (modules/entries) ως context όταν είναι σχετικό. ΑΠΑΝΤΑ ΠΑΝΤΑ ΣΤΗΝ ΙΔΙΑ ΓΛΩΣΣΑ που σου γράφει ο χρήστης (ανίχνευσε αυτόματα τη γλώσσα του μηνύματος). Χρησιμοποίησε markdown formatting όπου βοηθάει (code blocks, λίστες, bold) για ευανάγνωστες απαντήσεις.${WEB_SEARCH_INSTRUCTION}${REGULATED_ADVICE_INSTRUCTION}${AI_QUALITY_CHECKLIST_EL}`;
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
    const systemPrompt =
      (mentorMode ? buildMentorSystemPrompt(personaName) : buildSystemPrompt(personaName)) +
      buildMemoryPromptAddition(memories) +
      buildEntityMentionPromptAddition(mentionedEntities) +
      mentorContext +
      tradingMentorContext +
      productMentorContext +
      userContext;

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
    if (!bypassCredits) {
      const check = await hasEnoughCredits(user.id, CREDIT_COSTS.chatMessage, plan);
      if (!check.ok) {
        return NextResponse.json({
          ok: true,
          rateLimited: true,
          message: insufficientCreditsMessage(check.remaining, CREDIT_COSTS.chatMessage),
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
        let webSearchCount = 0;
        try {
          void recordAiCallForDailySpend(CREDIT_COSTS.chatMessage);
          const claudeStream = anthropic.messages.stream({
            model: MODEL,
            max_tokens: MAX_TOKENS,
            system: systemPrompt,
            messages: [
              ...history.map((m) => ({ role: m.role, content: m.content })),
              { role: "user" as const, content: message },
            ],
            tools: [WEB_SEARCH_TOOL],
          });

          claudeStream.on("text", (delta) => {
            assistantText += delta;
            controller.enqueue(ndjsonLine({ type: "delta", text: delta }));
          });

          const finalResponse = await claudeStream.finalMessage();
          webSearchCount = finalResponse.usage.server_tool_use?.web_search_requests ?? 0;
        } catch (err) {
          logApiError("/api/chat", err, { stage: "anthropic_stream" });
          const errMessage = err instanceof Error ? err.message : "Chat request failed.";
          controller.enqueue(
            ndjsonLine({ type: "error", error: `${errMessage} No credits were charged — please try again.` })
          );
          controller.close();
          return;
        }

        if (!assistantText.trim()) {
          controller.enqueue(
            ndjsonLine({
              type: "error",
              error: "The model did not return a response. No credits were charged — please try again.",
            })
          );
          controller.close();
          return;
        }

        // Confirmed success — a real reply streamed all the way through,
        // so this is the one place the message actually gets charged.
        if (!bypassCredits) {
          const deduction = await deductCredits(
            user.id,
            CREDIT_COSTS.chatMessage,
            "chat_message",
            "Ionexa Chat message",
            plan
          );
          if (!deduction.ok) {
            // Balance changed between the pre-check above and now — log
            // it, but still deliver the reply already streamed to the
            // user (see the same tolerance documented on
            // deductCredits/edit/generate).
            logApiError("/api/chat", "credit deduction failed after successful reply", {
              userId: user.id,
              conversationId: finalConversationId,
            });
          }
          // Extra charge only if the model actually performed a real web
          // search for this reply — never charged just for the tool
          // being offered (see WEB_SEARCH_TOOL/CREDIT_COSTS.webSearchPerQuery).
          if (webSearchCount > 0) {
            await deductCredits(
              user.id,
              CREDIT_COSTS.webSearchPerQuery * webSearchCount,
              "web_search",
              `Ionexa Chat — ${webSearchCount} web search${webSearchCount > 1 ? "es" : ""}`,
              plan
            );
          }
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
