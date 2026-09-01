import { NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { createClient } from "@/lib/supabase/server";
import { logApiError } from "@/lib/log-error";
import { loadDeepDive } from "@/lib/ai/deep-dive-load";
import {
  summariseProvenance,
  provenanceBriefing,
  hasProvenance,
  type Provenance,
} from "@/lib/chat/provenance";
import { autoTitleFromMessage } from "@/lib/chat/conversation-title";
import { listIntegrations } from "@/lib/integrations/store";
import {
  buildSearchTool,
  searchToolInstruction,
  executeSearchTool,
  SEARCH_TOOL_NAME,
  MAX_TOOL_ROUNDS,
} from "@/lib/integrations/chat-tool";
import { isAdminEmail } from "@/lib/auth/admin-emails";
import { hasActiveBetaBypass } from "@/lib/beta";
import { checkBypassCeiling } from "@/lib/billing/bypass-ceiling";
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
import {
  freeChatMaxCostEur,
  freeChatMessageEstimatedCostEur,
  freeChatLimitsForAccount,
} from "@/lib/billing/free-chat";
import { loadLegacyEntitlements } from "@/lib/billing/legacy-entitlements";
import type { PlanSlug } from "@/lib/billing/plans";
import { CHAT_MODEL } from "@/lib/ai-models";
import { buildCachedSystem, buildCachedMessages } from "@/lib/ai/cached-system";
import { consumeFreeChatMessage, releaseFreeChatMessage } from "@/lib/billing/free-chat-usage";
import { diagLog } from "@/lib/diag";
import {
  extractAndStoreMemory,
  loadRecentMemories,
  buildMemoryPromptAddition,
} from "@/lib/chat/memory";
import { isChatMemoryEnabled, chatMemoryActive } from "@/lib/chat/memory-policy";
import { findMentionedEntities, buildEntityMentionPromptAddition } from "@/lib/chat/entity-mentions";
import { loadMentorContext } from "@/lib/chat/mentor-context";
import { loadTradingMentorContext } from "@/lib/chat/trading-mentor-context";
import { loadProductMentorContext } from "@/lib/chat/product-mentor-context";
import { getUserFullContext, buildUserContextPromptAdditionGreek } from "@/lib/user-context";
import { selectRelevantModules, resolveSelectionConfig } from "@/lib/ai/module-relevance";
import { loadCodingContextForChat } from "@/lib/ai/cross-module-store";
import { moduleVocabulary } from "@/lib/ai/module-vocabulary";
import { AI_QUALITY_CHECKLIST_EL } from "@/lib/ai-quality-checklist";
import { AI_CONDUCT_EL } from "@/lib/ai-conduct";
import { matchCannedAnswer, type CannedMatch } from "@/lib/support/knowledge-base";
import { loadCannedArticles } from "@/lib/support/help-articles";
import { getLocale } from "next-intl/server";

export const dynamic = "force-dynamic";

// Streaming already avoids the worst version of the platform-timeout
// problem (partial text reaches the client immediately instead of the
// connection going silent then dying), but the function itself is still
// bounded by maxDuration regardless of streaming — a long Mentor Mode
// reply with a lot of context (memory + entity mentions + AI Life
// Context) plus the trailing memory-extraction call could otherwise
// still hit a low platform default. 180s covers a realistic worst case.
export const maxDuration = 180; // @function-limit 180

// Shared with lib/billing/free-chat.ts so the free-chat economics always
// price the model chat actually runs on — see lib/ai-models.ts.
const MODEL = CHAT_MODEL;
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

// The legal/tax/investment disclaimer that used to live here as a local
// constant is superseded by the SHARED conduct block (lib/ai-conduct.ts):
// the same referral-not-refusal rule, now covering HEALTH as well, plus
// the absolute limits, the explicit anti-over-restriction instruction,
// and the empathy guidance — appended to every AI feature in the app,
// not just chat, so the wording cannot drift per feature.

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
  return `Είσαι ο/η ${personaName}, ένας εξελιγμένος AI βοηθός γενικής χρήσης. Έχεις ευρεία γνώση σε όλα τα θέματα (επιστήμη, ιστορία, προγραμματισμός, μαθηματικά, δημιουργική γραφή, επιχειρήσεις, καθημερινές ερωτήσεις, κ.λπ.) και μπορείς να βοηθήσεις με οτιδήποτε χρειαστεί ο χρήστης. ΑΠΑΝΤΑ ΠΑΝΤΑ ΣΤΗΝ ΙΔΙΑ ΓΛΩΣΣΑ που σου γράφει ο χρήστης (ανίχνευσε αυτόματα τη γλώσσα του μηνύματος — ελληνικά, αγγλικά, ή οποιαδήποτε άλλη γλώσσα). Δώσε λεπτομερείς, χρήσιμες, ακριβείς απαντήσεις — προτίμησε μια ελαφρώς πιο εκτενή, ουσιαστική απάντηση αντί για μια πολύ σύντομη, χωρίς όμως να γίνεσαι φλύαρος ή να επαναλαμβάνεσαι. Όπου έχει νόημα για το ερώτημα (εξηγήσεις εννοιών, τεχνικά θέματα, "πώς κάνω Χ"), συμπλήρωσε τον ορισμό/την εξήγηση με ένα σύντομο πρακτικό παράδειγμα ή use case, όχι μόνο θεωρία — αλλά μην το κάνεις αυτό όταν ο χρήστης ζητάει ρητά κάτι σύντομο (π.χ. ναι/όχι, ένας αριθμός, μια γρήγορη μετάφραση) ή όταν ένα παράδειγμα δεν έχει φυσικό νόημα. Χρησιμοποίησε markdown formatting όπου βοηθάει (code blocks, λίστες, bold) για ευανάγνωστες απαντήσεις.${WEB_SEARCH_INSTRUCTION}${AI_CONDUCT_EL}${AI_QUALITY_CHECKLIST_EL}`;
}

// Mentor Mode (toggled client-side, see chat-workspace.tsx's "Mentor Mode"
// button) — an alternative persona for when the user wants strategic
// pushback instead of a straight, executional answer. Only ever swapped in
// for that one request's system prompt; the default persona/behavior above
// is untouched otherwise.
function buildMentorSystemPrompt(personaName: string): string {
  return `Είσαι ο/η ${personaName} Mentor — δεν δίνεις μόνο απαντήσεις, δίνεις επιχειρηματική/στρατηγική καθοδήγηση. Όταν ο χρήστης περιγράφει ένα σχέδιο/ιδέα, ΜΗΝ απαντάς μόνο εκτελεστικά — επισήμανε πιθανά ρίσκα, ρώτησε διευκρινιστικές ερωτήσεις που θα ρωτούσε ένας έμπειρος σύμβουλος, και πρότεινε εναλλακτικές όπου έχει νόημα. Χρησιμοποίησε τα δεδομένα του χρήστη (modules/entries) ως context όταν είναι σχετικό. ΑΠΑΝΤΑ ΠΑΝΤΑ ΣΤΗΝ ΙΔΙΑ ΓΛΩΣΣΑ που σου γράφει ο χρήστης (ανίχνευσε αυτόματα τη γλώσσα του μηνύματος). Χρησιμοποίησε markdown formatting όπου βοηθάει (code blocks, λίστες, bold) για ευανάγνωστες απαντήσεις.${WEB_SEARCH_INSTRUCTION}${AI_CONDUCT_EL}${AI_QUALITY_CHECKLIST_EL}`;
}

// CANNED ANSWERS — the part of support traffic that does not need a model.
//
// lib/support/knowledge-base.ts has existed, tested, for a while and was
// never connected to anything. So every "how much does it cost", "how do I
// cancel", "what are credits" paid for a full Claude turn — reserve,
// stream, memory extraction, settle, log — to reproduce a sentence that
// has not changed in months. Removing that call makes the answer BETTER,
// not worse: a fixed answer cannot hallucinate a price, and the file's own
// rule is that no canned answer states a number that moves.
//
// TWO THRESHOLDS, and the second one is the point.
//
// On a NEW conversation the message is the whole context, so the library's
// own 0.85 applies. Inside an EXISTING conversation the same words can
// mean something else entirely — "πόσο κοστίζει;" after three turns about
// a client proposal is a question about the proposal, and answering it
// with our pricing page would be worse than useless. So a mid-conversation
// match has to be near-exact before it is allowed to pre-empt the model.
//
// isAccountSpecific already rejects anything in the first person, so
// "how many credits do I have left" can never reach this path — that is a
// question about an account and it has to hit the real one.
const CANNED_THRESHOLD_NEW_CONVERSATION = 0.85;
const CANNED_THRESHOLD_MID_CONVERSATION = 0.92;

// Shared by the canned path and the model path, so wiring up a second way
// into this route did not fork the wording of the same two failures.
const CONVERSATION_NOT_FOUND = "Conversation not found.";
const CONVERSATION_CREATE_FAILED = "Could not start a new conversation.";

// Was a private helper here. It moved to lib/chat/conversation-title.ts
// because api/conversations/[id] needs the SAME function: clearing a
// title restores the automatic one, and "restores" has to mean the
// identical string this route would have produced, not a second
// implementation that rounds differently.
const truncateTitle = autoTitleFromMessage;

// Newline-delimited JSON: each line is one event. Chosen over SSE's
// "data: " framing since it needs no extra parsing on the client beyond
// splitting on "\n" — a plain fetch() + ReadableStream reader is enough.
function ndjsonLine(event: Record<string, unknown>): Uint8Array {
  return new TextEncoder().encode(`${JSON.stringify(event)}\n`);
}

/**
 * Answers from the knowledge base, in the SAME wire shape as a model
 * reply, so the client needs no branch for it.
 *
 * It streams meta -> delta -> done exactly like the real path. That is
 * deliberate: a canned answer that arrived through a different response
 * shape would need its own rendering, its own error handling and its own
 * conversation bookkeeping, and the three would drift. The only difference
 * a user can observe is that it is instant and the receipt says zero.
 *
 * NOTHING IS CHARGED and nothing is reserved, because no AI call is made.
 * No cost-log row is written either — settleReservation exists to price
 * measured usage, and there is none; a zero-cost row here would be
 * indistinguishable from the "settled with no measured usage" bug it
 * already alerts on.
 */
async function answerFromKnowledgeBase(params: {
  supabase: ReturnType<typeof createClient>;
  userId: string;
  message: string;
  conversationId: string | null;
  match: CannedMatch;
}): Promise<Response> {
  const { supabase, userId, message, match } = params;
  let conversationId = params.conversationId;
  let isNewConversation = false;
  let newConversationTitle: string | undefined;

  if (conversationId) {
    const { data: existing } = await supabase
      .from("chat_conversations")
      .select("id")
      .eq("id", conversationId)
      .maybeSingle();
    if (!existing) {
      return NextResponse.json({ ok: false, error: CONVERSATION_NOT_FOUND }, { status: 404 });
    }
  } else {
    newConversationTitle = truncateTitle(message);
    const { data: created, error: createError } = await supabase
      .from("chat_conversations")
      .insert({ user_id: userId, title: newConversationTitle })
      .select("id")
      .single();
    if (createError || !created) {
      logApiError("/api/chat", createError, { stage: "create_conversation_canned" });
      return NextResponse.json({ ok: false, error: CONVERSATION_CREATE_FAILED }, { status: 500 });
    }
    conversationId = created.id;
    isNewConversation = true;
  }

  // The article's own link, appended once, so a fixed answer still leads
  // somewhere with the live numbers on it — the knowledge base
  // deliberately states no price, allowance or limit, and this is how the
  // user gets to them.
  const answer = match.article.href
    ? `${match.article.body}\n\n→ ${match.article.href}`
    : match.article.body;

  const finalConversationId = conversationId;
  const { error: saveError } = await supabase.from("chat_messages").insert([
    { conversation_id: finalConversationId, user_id: userId, role: "user", content: message },
    { conversation_id: finalConversationId, user_id: userId, role: "assistant", content: answer },
  ]);
  if (saveError) {
    logApiError("/api/chat", saveError, { stage: "save_canned_messages" });
  }
  await supabase
    .from("chat_conversations")
    .update({ updated_at: new Date().toISOString() })
    .eq("id", finalConversationId);

  diagLog(
    `[canned] chat answered without a model call: ${JSON.stringify({
      userId,
      articleId: match.article.slug,
      confidence: match.confidence,
    })}`
  );

  const stream = new ReadableStream({
    start(controller) {
      controller.enqueue(
        ndjsonLine({
          type: "meta",
          conversationId: finalConversationId,
          isNewConversation,
          title: newConversationTitle,
          // So the UI can say where the answer came from and link to the
          // full article rather than presenting it as a model reply.
          cannedAnswer: { articleId: match.article.slug, href: match.article.href ?? null },
        })
      );
      controller.enqueue(ndjsonLine({ type: "delta", text: answer }));
      controller.enqueue(
        ndjsonLine({
          type: "done",
          usage: buildUsageReceipt({ creditsCharged: 0, bypass: false, wouldHaveCharged: null }),
        })
      );
      controller.close();
    },
  });

  return new Response(stream, {
    headers: { "Content-Type": "application/x-ndjson; charset=utf-8", "Cache-Control": "no-cache" },
  });
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

    // CANNED ANSWER — checked before the circuit breaker, before credits,
    // before any context is loaded, because none of that machinery exists
    // for an answer that makes no AI call. A user who has run out of
    // credits, or who has tripped the breaker, can still be told how to
    // cancel their subscription.
    //
    // Mentor Mode is excluded: the user explicitly asked for strategic
    // pushback on their situation, and handing them a FAQ entry instead is
    // not a cheaper version of that, it is a different (wrong) answer.
    // The knowledge base is Greek. Anyone else falls through to the model,
    // which answers in their own language — see CANNED_ANSWER_LOCALE.
    const locale = await getLocale();
    // The articles for THIS user's language, not a global list. A locale
    // with no articles yet loads none, matches nothing and falls through
    // to the model — which is what the old CANNED_ANSWER_LOCALE guard did
    // for nine locales, now as a consequence of the data rather than as a
    // check somebody has to remember.
    const cannedMatch = mentorMode
      ? null
      : matchCannedAnswer(
          message,
          await loadCannedArticles(locale),
          conversationId ? CANNED_THRESHOLD_MID_CONVERSATION : CANNED_THRESHOLD_NEW_CONVERSATION
        );
    if (cannedMatch) {
      return await answerFromKnowledgeBase({
        supabase,
        userId: user.id,
        message,
        conversationId,
        match: cannedMatch,
      });
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
    // Both the read below and the write after the stream derive from this
    // ONE predicate. They used to be two conditions and they disagreed:
    // Free is chatMemoryLimit 0, so the read returned nothing while the
    // write still made a second billed Claude call per message. See
    // chatMemoryActive() in lib/chat/memory.ts.
    const memoryActive = chatMemoryActive({
      userEnabled: isChatMemoryEnabled(user),
      planLimit: plan.capabilities.chatMemoryLimit,
    });
    const memories = memoryActive
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
    const mentor = mentorMode
      ? await loadMentorContext(supabase, user.id)
      : { prompt: "", modules: [] };
    const mentorContext = mentor.prompt;

    // THE ONE MODULE THIS QUESTION IS ABOUT, READ PROPERLY — V4.6 #1.
    //
    // Five headlines per module is why "how were sales this week" comes
    // back without a number in it. This adds up to twenty-five dated rows
    // WITH their amounts, for the single module the question points at,
    // and adds nothing at all when it points at none — see
    // lib/ai/deep-dive.ts for why a best guess is worse than silence.
    //
    // It goes in the per-message suffix, never in systemPerUser: that
    // block is cached, and a block that changes with the question breaks
    // the cache on every turn. Measured, in
    // scripts/measure-context.mjs: doing this the "clever" way — one
    // budget redistributed per question inside the cached block — sends
    // fewer characters and costs four times more.
    const deepDive = await loadDeepDive(supabase, user.id, message, "el");
    if (deepDive.mode !== "none" || deepDive.prompt) {
      diagLog(
        `[deep-dive] ${deepDive.mode}: ` +
          (deepDive.reads.length > 0
            ? deepDive.reads
                .map((r) => `${r.slug} ${r.shown} rows${r.omitted > 0 ? ` (+${r.omitted} not sent)` : ""}`)
                .join(", ")
            : "nothing read, breadth notice only") +
          `, ${deepDive.chars} chars`
      );
    }
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
    let provenance: Provenance | null = null;
    try {
      const fullContext = await getUserFullContext(supabase, user.id);
      // NARROWING IS OFF BY DEFAULT — see lib/ai/module-relevance.ts.
      //
      // With CONTEXT_RELEVANCE unset (which is every deployment until
      // somebody measures quality) this returns every module and the
      // prompt is byte-identical to what it was. That is deliberate: this
      // is the one change in the context work that can make an ANSWER
      // worse, and the value of a cross-module assistant is the
      // cross-module part.
      const selection = selectRelevantModules(
        message,
        fullContext.moduleSummaries,
        moduleVocabulary(),
        resolveSelectionConfig()
      );
      if (selection.mode === "narrowed") {
        diagLog(
          `[context] narrowed ${fullContext.moduleSummaries.length} -> ${selection.keep.length} modules ` +
            `(dropped ${selection.droppedSlugs.join(",")}; ${selection.reason})`
        );
      }
      userContext = buildUserContextPromptAdditionGreek({
        ...fullContext,
        moduleSummaries: selection.keep,
      });
      // WHERE THE ANSWER WILL HAVE COME FROM — V4.6 #9.
      //
      // Computed from `selection.keep`, NOT from fullContext: the
      // narrowing above decides what the model is shown, and a
      // provenance line built on the full scan would credit modules the
      // model never saw. The dropped ones join the empty ones, because
      // from the answer's point of view they are the same thing — data
      // that was not read.
      provenance = summariseProvenance(
        [
          // MENTOR MODE READS MORE, so it must also account for more. Its
          // scan is a separate one (lib/chat/mentor-context.ts, its own
          // cap, its own module list) and it goes into the same prompt —
          // an answer built on both and crediting one is the version of
          // this line that is quietly wrong.
          ...mentor.modules,
          // The deep read is the biggest single contribution to an answer
          // when it fires; leaving it out of the count would understate
          // the line under the answer by twenty-five entries.
          ...deepDive.reads.map((r) => ({ slug: r.slug, title: r.title, rows: r.rows })),
          ...selection.keep.map((m) => ({ slug: m.slug, title: m.title, rows: m.rows })),
          ...fullContext.emptyModules.map((m) => ({ ...m, rows: [] })),
          ...fullContext.moduleSummaries
            .filter((m) => !selection.keep.some((k) => k.slug === m.slug))
            .map((m) => ({ slug: m.slug, title: m.title, rows: [] })),
        ],
        fullContext.perModuleCap
      );
      // The model is told what it was given so it can be honest about the
      // boundary. It is NOT asked to cite: the citation under the answer
      // is rendered from this same object, so there is nothing for it to
      // fabricate.
      userContext += `\n\n${provenanceBriefing(provenance, "el")}`;
    } catch (err) {
      logApiError("/api/chat", err, { stage: "user_full_context" });
    }

    // WHAT THE USER AND THE MODEL HAVE ALREADY BUILT TOGETHER (V4 #36).
    //
    // Without this, "remember the function you wrote?" has exactly one
    // honest answer, and it is no: the AI Coding module's history is a
    // table chat never reads. This adds the sessions THIS question is
    // about — never all of them.
    //
    // ALMOST EVERY REQUEST ADDS NOTHING, and that is the design. A
    // question about last month's revenue matches no coding session, so
    // the block is empty and the prompt is byte-identical to what it was
    // before this feature existed. The whole feature is capped at
    // MAX_CROSS_CONTEXT_CHARS (900) against a request that already sends
    // 20,725 — see scripts/measure-context.mjs, which measures the
    // before and after rather than asserting them.
    let codingContext = "";
    try {
      const coding = await loadCodingContextForChat(supabase, message);
      codingContext = coding.text ? `\n\n${coding.text}` : "";
      if (coding.selection.chosen.length > 0) {
        diagLog(
          `[context] coding: ${coding.selection.chosen.length} of ${coding.pool} session(s), ` +
            `${codingContext.length} chars (${coding.selection.reason})`
        );
      }
    } catch (err) {
      // An enhancement must never cost the user their message.
      logApiError("/api/chat", err, { stage: "coding_context" });
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

    // Split in two on purpose — see lib/ai/cached-system.ts.
    //
    // The first half is byte-identical on every chat message in the app:
    // persona line, web-search instruction, AI_CONDUCT_EL,
    // AI_QUALITY_CHECKLIST_EL. Measured at 7,510 characters (~1,878
    // tokens), it is comfortably over Sonnet's 1,024-token caching
    // minimum, and it was being re-sent at full input price on every
    // single message.
    //
    // The second half is per-request, and one part of it is per-MESSAGE,
    // not merely per-user: buildEntityMentionPromptAddition is computed
    // from the words in THIS message. That is what makes the block
    // boundary load-bearing rather than cosmetic. Marking the end of the
    // whole prompt would put those entities inside the cached prefix, so
    // every message would write a fresh entry and none would ever read
    // one — the 1.25x write premium, paid forever, for nothing.
    //
    // `personaName` sits inside the static half and defaults to "Ionexa"
    // for everyone below Ultimate, so the overwhelming majority of
    // accounts share one cache entry. A custom persona simply gets its
    // own; it does not break anything, it just caches per-name.
    const systemStaticPrefix = mentorMode
      ? buildMentorSystemPrompt(personaName)
      : buildSystemPrompt(personaName);
    // THREE TIERS NOW, not two, and the middle one is where the money is.
    //
    // Measured with scripts/measure-context.mjs: of everything a chat
    // request sends, 33% is the static prefix (already cached), 39% is
    // conversation history and 28% is this. Within that 28%, the AI Life
    // Context alone is 4,817 characters — and it changes when the user
    // adds an entry, not when they send a message.
    //
    // ENTITY MENTIONS MOVE TO THE END. They are computed from the words
    // in THIS message (findMentionedEntities above), so they are the one
    // genuinely per-message part. With them in the middle, as they were,
    // the prefix differs on every message and nothing after them can ever
    // be cached — which is why this reorder is a requirement rather than
    // a tidy-up. Nothing is added or removed; the same text is sent.
    const systemPerUser =
      buildMemoryPromptAddition(memories) +
      mentorContext +
      tradingMentorContext +
      productMentorContext +
      userContext +
      integrationInstruction;
    // THE CODING BLOCK IS PER-MESSAGE, SO IT GOES LAST, beside the entity
    // mentions and never inside systemPerUser.
    //
    // This was in the per-user block first, with a comment claiming that
    // was deliberate. It was wrong, and expensively so: the per-user
    // block is 1,385 tokens that CACHE, and a block that changes with
    // every question would have broken that cache on every single turn —
    // paying ~1,246 full-price tokens a message to save at most 177.
    // scripts/tests/context-optimization.test.mjs caught it, which is
    // exactly what that gate is for.
    const systemDynamicSuffix =
      buildEntityMentionPromptAddition(mentionedEntities) + codingContext + deepDive.prompt;
    // Kept as the concatenation of the two halves, unchanged, because
    // every cost estimate below sizes the request with
    // `systemPrompt.length`. The split changes where the block boundary
    // is, never how much text is sent, and this keeps the estimator
    // measuring the same string it always did.
    const systemPrompt = systemStaticPrefix + systemPerUser + systemDynamicSuffix;

    // Credits: 1 credit per Ionexa Chat message, deducted from user_credits
    // (see lib/billing/credits.ts), the same shared budget Create Anything
    // draws from. Admin-listed accounts (see lib/auth/admin-emails.ts) and beta
    // testers (see lib/beta.ts) skip this entirely — treated as unlimited.
    // Only a READ-ONLY check happens here (reject early, before even
    // creating/touching the conversation, if obviously insufficient); the
    // actual DEDUCT happens inside the stream below, only once Claude has
    // confirmed-successfully returned a real reply — see the
    // deductCredits call right after claudeStream.finalMessage(). If the
    // stream throws or the model returns nothing, no deduction ever runs.
    const isAdmin = isAdminEmail(user.email);
    const bypassCredits = isAdmin || (await hasActiveBetaBypass(user));

    // THE BYPASS EUR CEILING. checkAiCallAllowed above caps volume for
    // every account; this caps real Anthropic SPEND specifically for the
    // accounts credits do not — admin and active beta. See
    // lib/billing/bypass-ceiling.ts for why this is one check in euros
    // rather than a counter re-implemented per feature.
    if (bypassCredits) {
      const ceiling = await checkBypassCeiling(user.id, isAdmin, bypassCredits && !isAdmin);
      if (!ceiling.allowed) {
        return NextResponse.json({ ok: false, error: ceiling.reason }, { status: 429 });
      }
    }
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
    // Only offered for a message that already fits the free envelope — by
    // SIZE (the character cap) and by estimated COST (FREE_CHAT_MAX_COST_EUR,
    // which holds even if the chat model is upgraded to a pricier one). A
    // message over either limit falls through to the normal paid path
    // rather than being rejected, so the cap never turns into an error the
    // user has to understand — the meta event below tells the client why,
    // and what the message will roughly cost. Admins and beta testers
    // already pay nothing, so spending their allowance on them would be
    // pure bookkeeping.
    //
    // GRANDFATHERING. An account that predates the combined-ceiling change
    // keeps both the allowance AND the envelope it had — a smaller reply
    // cap is something the user would notice, so it is not enough to
    // preserve only the message count. Loaded once here and threaded
    // through, rather than read again inside the counter, so a chat turn
    // still touches user_credits once.
    const legacy = bypassCredits ? null : await loadLegacyEntitlements(user.id);
    const freeLimits = freeChatLimitsForAccount((plan?.slug ?? "free") as PlanSlug, legacy);

    const withinFreeSize = message.length <= freeLimits.maxMessageChars;
    const withinFreeCost =
      freeChatMessageEstimatedCostEur(
        message.length,
        systemPrompt.length,
        pricingConfig,
        freeLimits
      ) <= freeChatMaxCostEur();
    const freeGrant =
      !bypassCredits && withinFreeSize && withinFreeCost
        ? await consumeFreeChatMessage(user.id, plan?.slug ?? "free", legacy)
        : null;
    const isFreeMessage = freeGrant?.granted === true;
    const largeMessageReason: "message_too_long" | "over_cost_cap" | null =
      !bypassCredits && !withinFreeSize
        ? "message_too_long"
        : !bypassCredits && !withinFreeCost
          ? "over_cost_cap"
          : null;

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
        planSlug: plan?.slug ?? null,
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
          { ok: false, error: CONVERSATION_NOT_FOUND },
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
          { ok: false, error: CONVERSATION_CREATE_FAILED },
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
            // WHAT THIS ANSWER WAS BUILT FROM (V4.6 #9). Arithmetic on the
            // rows that went into the prompt, not a claim the model made —
            // so the line under the answer stays true even when the answer
            // above it is wrong. Omitted entirely when nothing was read;
            // an empty sources line is a fourth way of saying nothing.
            provenance: hasProvenance(provenance) ? provenance : undefined,
            // So the composer can say how many free messages are left the
            // moment one is used, rather than on the next page load.
            freeMessage: isFreeMessage,
            freeRemaining: freeGrant?.granted ? freeGrant.remaining : undefined,
            // "This message is large — it will be charged." Sent whenever a
            // message fell outside the free envelope (by size or by the
            // FREE_CHAT_MAX_COST_EUR estimate), with the rough charge, so
            // the client can explain the paid path instead of the user
            // wondering where a free message went.
            largeMessage: largeMessageReason
              ? { reason: largeMessageReason, estimatedCredits: estimate.estimatedCredits }
              : undefined,
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
          ? history.slice(-freeLimits.historyLimit)
          : history;
        const effectiveMaxTokens = isFreeMessage
          ? freeLimits.maxOutputTokens
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
            planSlug: plan?.slug ?? null,
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
          // THE HISTORY IS CACHED TOO — the single largest block a chat
          // request sends (39% of it at twenty turns), and every one of
          // those turns is text the model was already sent verbatim on
          // the previous request. A conversation is append-only, which is
          // the shape a prefix cache wants: the breakpoint goes on the
          // last history turn, so this request reads what the previous
          // one wrote. See lib/ai/cached-system.ts.
          const conversation = buildCachedMessages(
            effectiveHistory,
            message,
            MODEL
          ) as Anthropic.MessageParam[];

          for (let round = 0; round <= MAX_TOOL_ROUNDS; round++) {
            const claudeStream = anthropic.messages.stream({
              model: MODEL,
              max_tokens: effectiveMaxTokens,
              system: buildCachedSystem({
                staticPrefix: systemStaticPrefix,
                perUserBlock: systemPerUser,
                dynamicSuffix: systemDynamicSuffix,
                model: MODEL,
              }),
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
            costs.record("generation", finalResponse.usage, finalResponse.model || MODEL);
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
        if (memoryActive) {
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
