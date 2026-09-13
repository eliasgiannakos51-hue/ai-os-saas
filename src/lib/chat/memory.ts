import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import type { CostAccumulator } from "@/lib/billing/cost-accumulator";
import type { SupabaseClient } from "@supabase/supabase-js";
import { logApiError } from "@/lib/log-error";
import { recordAiCallForDailySpend } from "@/lib/ai-circuit-breaker";
import { memoryFold } from "./memory-fold";
import type { RememberedFact } from "./memory-prompt";

const MEMORY_MODEL = "claude-sonnet-4-6";
const MEMORY_MAX_TOKENS = 150;
const DEFAULT_MEMORY_LOAD_LIMIT = 20;

// The NEVER-EXTRACT clause is not a nicety — it closes a real leak.
//
// Chat memory is written once and then loaded into the system prompt of
// every future conversation, indefinitely. Without this clause, a user
// who says something in a moment of despair gets "the user has suicidal
// thoughts" distilled into a permanent row, replayed into every unrelated
// chat months later, visible in Settings > Memory, and carried into their
// data export. That is a durable record of the most private thing a
// person could type, created automatically, by a feature they enabled for
// remembering their job title.
//
// The rule is broader than crisis on purpose: health conditions and
// distress in general are not "permanently useful preferences", and the
// extractor has no business deciding otherwise.
//
// WHAT CHANGED, AND WHY. The first version of this clause vetoed the
// WHOLE EXCHANGE — "σε τέτοια μηνύματα απάντα ΑΚΡΙΒΩΣ: NONE, ό,τι άλλο κι
// αν περιέχει η ανταλλαγή". That is a bigger rule than the leak needs, and
// it silently broke the feature it was bolted onto: "με λένε Ηλία, φτιάχνω
// SaaS, και τελευταία είμαι εξαντλημένος" returned NONE, so the name and
// the job — the exact things memory exists for — were thrown away along
// with the sensitive part. A user who mentions being tired once stops
// being remembered at all.
//
// The veto is therefore scoped to the CONTENT, not to the exchange: the
// sensitive material must never appear in the output, and the durable,
// ordinary facts in the same message must still be extracted. The
// privacy guarantee is unchanged — nothing sensitive is ever written —
// and the feature survives contact with a human being having a bad day.
const EXTRACTION_SYSTEM_PROMPT =
  "Εξάγεις σημαντικά, μόνιμα-χρήσιμα γεγονότα ή προτιμήσεις για τον χρήστη από μία ανταλλαγή μηνυμάτων με έναν AI βοηθό. Απάντα με 1-2 σύντομες προτάσεις — μόνο πράγματα που αξίζει να θυμάται ο βοηθός σε ΜΕΛΛΟΝΤΙΚΕΣ, διαφορετικές συνομιλίες (π.χ. όνομα, επάγγελμα, μόνιμες προτιμήσεις/context). " +
  "ΑΠΑΓΟΡΕΥΜΕΝΟ ΠΕΡΙΕΧΟΜΕΝΟ: ΠΟΤΕ μην συμπεριλάβεις στην απάντησή σου οτιδήποτε αφορά ψυχική δυσφορία, απόγνωση, σκέψεις αυτοτραυματισμού ή αυτοκτονίας, ψυχική ή σωματική υγεία, ή άλλη ευαίσθητη προσωπική κατάσταση — ούτε ως υπαινιγμό, ούτε παραφρασμένο. " +
  "ΣΗΜΑΝΤΙΚΟ: η απαγόρευση αφορά ΤΟ ΠΕΡΙΕΧΟΜΕΝΟ, ΟΧΙ ολόκληρη την ανταλλαγή. Αν το ίδιο μήνυμα περιέχει ΚΑΙ ευαίσθητο υλικό ΚΑΙ συνηθισμένα μόνιμα στοιχεία (όνομα, επάγγελμα, προτίμηση), εξάγεις ΜΟΝΟ τα συνηθισμένα και αγνοείς εντελώς το ευαίσθητο. Παράδειγμα: «με λένε Ηλίας, φτιάχνω SaaS, και τελευταία νιώθω εξαντλημένος» -> «Τον λένε Ηλία και φτιάχνει ένα SaaS.» (χωρίς καμία αναφορά στην εξάντληση). " +
  "Απάντα ΑΚΡΙΒΩΣ: NONE μόνο όταν δεν μένει ΤΙΠΟΤΑ μη-ευαίσθητο και αξιόλογο να θυμάσαι. Μην εξηγείς, μην προσθέτεις τίποτα άλλο εκτός από τις 1-2 προτάσεις ή το NONE.";

// Fires a second, small/fast Claude call after a chat exchange to pull out
// anything worth remembering across future, unrelated conversations — a
// name, role, preference, recurring context. Best-effort: awaited inline
// (so it reliably finishes before the response stream closes — this route
// runs on serverless functions with no guaranteed post-response background
// execution) but never allowed to fail the chat itself.
export async function extractAndStoreMemory({
  apiKey,
  supabase,
  userId,
  conversationId,
  userMessage,
  assistantMessage,
  costs,
}: {
  apiKey: string;
  supabase: SupabaseClient;
  userId: string;
  conversationId: string;
  userMessage: string;
  assistantMessage: string;
  // The chat turn's accumulator. This is a SECOND real Claude call on
  // every message with memory enabled, and it used to report only a call
  // COUNT to the circuit breaker — its tokens were never priced and
  // never charged to anyone. See CREDITS.md.
  costs?: CostAccumulator;
}): Promise<void> {
  try {
    // No separate circuit-breaker check here — this only ever runs once
    // per successful api/chat reply, which already passed that route's
    // own checkAiCallAllowed before the main reply was even generated;
    // gating it again here would just double-reject the same request.
    // Still recorded for daily spend visibility (see
    // lib/ai-circuit-breaker.ts), since it IS a second real Claude call.
    void recordAiCallForDailySpend(1);
    const anthropic = new Anthropic({ apiKey });
    const result = await anthropic.messages.create({
      model: MEMORY_MODEL,
      max_tokens: MEMORY_MAX_TOKENS,
      system: EXTRACTION_SYSTEM_PROMPT,
      messages: [
        {
          role: "user",
          content: `User: ${userMessage}\n\nAssistant: ${assistantMessage}`,
        },
      ],
    });

    costs?.record("other", result.usage, result.model || MEMORY_MODEL);

    const textBlock = result.content.find(
      (block): block is Anthropic.TextBlock => block.type === "text"
    );
    const extracted = textBlock?.text.trim() ?? "";

    if (!extracted || extracted.toUpperCase() === "NONE") return;

    // NOT `.insert()`. That is what this was, and saying your name in five
    // conversations produced five identical rows — which is worse than
    // untidy, because the read side takes the newest N (20 on most plans)
    // and twenty repetitions of one fact push everything else the model
    // knew about the person out of the prompt. The feature got worse the
    // more consistently somebody talked about themselves.
    //
    // chat_memory_record() inserts or bumps, keyed on the FOLD — the same
    // foldForMatch() the search box uses, so "Με λένε Ηλία" and "με λενε
    // ηλια" are one fact. It is a function rather than an upsert from here
    // because chat_memory has no UPDATE policy on purpose: the table is
    // append/delete-only for a browser session, and a counter is not a
    // reason to give that up. See the migration's own note.
    const { error } = await supabase.rpc("chat_memory_record", {
      p_memory_text: extracted,
      p_memory_fold: memoryFold(extracted),
      p_conversation_id: conversationId,
    });
    if (error) {
      logApiError("chat:extractAndStoreMemory", error, { stage: "record", userId });
    }
  } catch (err) {
    logApiError("chat:extractAndStoreMemory", err, { stage: "unhandled", userId });
  }
}

export async function loadRecentMemories(
  supabase: SupabaseClient,
  userId: string,
  limit: number = DEFAULT_MEMORY_LOAD_LIMIT
): Promise<RememberedFact[]> {
  const { data, error } = await supabase
    .from("chat_memory")
    .select("memory_text, times_seen, last_seen_at")
    .eq("user_id", userId)
    // LAST SEEN, NOT CREATED. Ordering by created_at meant a fact learned
    // two years ago and repeated yesterday sorted behind a one-off from
    // last week — so the window filled with things said once while the
    // things the person keeps saying fell out of it.
    .order("last_seen_at", { ascending: false })
    .limit(limit);

  if (error) {
    logApiError("chat:loadRecentMemories", error, { userId });
    return [];
  }

  return (data ?? []).map((row) => ({
    text: row.memory_text as string,
    timesSeen: Number(row.times_seen ?? 1),
    lastSeenAt: String(row.last_seen_at ?? ""),
  }));
}

export { isChatMemoryEnabled, chatMemoryActive } from "./memory-policy";

// buildMemoryPromptAddition lives in ./memory-prompt so a gate can RUN it.
// The distinction it draws — repeated against mentioned once — is not
// something a regex over this file could confirm.
export { buildMemoryPromptAddition, type RememberedFact } from "./memory-prompt";

// memoryFold lives in ./memory-fold so the browser can call it: the
// correction flow on /dashboard/ai-memory writes a remembered line from a
// client component and must compute the same fold this module does.
export { memoryFold } from "./memory-fold";
