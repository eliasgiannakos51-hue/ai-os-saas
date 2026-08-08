import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import type { CostAccumulator } from "@/lib/billing/cost-accumulator";
import type { SupabaseClient } from "@supabase/supabase-js";
import { logApiError } from "@/lib/log-error";
import { recordAiCallForDailySpend } from "@/lib/ai-circuit-breaker";

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
const EXTRACTION_SYSTEM_PROMPT =
  "Εξάγεις σημαντικά, μόνιμα-χρήσιμα γεγονότα ή προτιμήσεις για τον χρήστη από μία ανταλλαγή μηνυμάτων με έναν AI βοηθό. Απάντα με 1-2 σύντομες προτάσεις — μόνο πράγματα που αξίζει να θυμάται ο βοηθός σε ΜΕΛΛΟΝΤΙΚΕΣ, διαφορετικές συνομιλίες (π.χ. όνομα, επάγγελμα, μόνιμες προτιμήσεις/context). ΠΟΤΕ μην εξάγεις οτιδήποτε αφορά ψυχική δυσφορία, απόγνωση, σκέψεις αυτοτραυματισμού ή αυτοκτονίας, ψυχική ή σωματική υγεία, ή οποιαδήποτε ευαίσθητη προσωπική κατάσταση — σε τέτοια μηνύματα απάντα ΑΚΡΙΒΩΣ: NONE, ό,τι άλλο κι αν περιέχει η ανταλλαγή. Αν δεν υπάρχει τίποτα αξιόλογο, απάντα ΑΚΡΙΒΩΣ: NONE. Μην εξηγείς, μην προσθέτεις τίποτα άλλο εκτός από τις 1-2 προτάσεις ή το NONE.";

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

    const { error } = await supabase.from("chat_memory").insert({
      user_id: userId,
      memory_text: extracted,
      source_conversation_id: conversationId,
    });
    if (error) {
      logApiError("chat:extractAndStoreMemory", error, { stage: "insert", userId });
    }
  } catch (err) {
    logApiError("chat:extractAndStoreMemory", err, { stage: "unhandled", userId });
  }
}

export async function loadRecentMemories(
  supabase: SupabaseClient,
  userId: string,
  limit: number = DEFAULT_MEMORY_LOAD_LIMIT
): Promise<string[]> {
  const { data, error } = await supabase
    .from("chat_memory")
    .select("memory_text")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) {
    logApiError("chat:loadRecentMemories", error, { userId });
    return [];
  }

  return (data ?? []).map((row) => row.memory_text as string);
}

export function buildMemoryPromptAddition(memories: string[]): string {
  if (memories.length === 0) return "";
  const bulletList = memories.map((m) => `- ${m}`).join("\n");
  return `\n\nΠράγματα που ήδη ξέρεις για αυτόν τον χρήστη από προηγούμενες συνομιλίες:\n${bulletList}`;
}

// Defaults to on — chat_memory_enabled is only ever written as `false`
// (see chat-memory-settings.tsx), so anything else (unset, true) means on.
export function isChatMemoryEnabled(
  user: { user_metadata?: Record<string, unknown> | null } | null | undefined
): boolean {
  return user?.user_metadata?.chat_memory_enabled !== false;
}
