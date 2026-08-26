import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { logApiError } from "@/lib/log-error";
import { normalizeForSearch } from "@/lib/text/search-match";
import { selectWithinBudget, estimateTokens } from "@/lib/text/relevance-budget";

// THE DIRECTION THAT DID NOT EXIST.
//
// api/records/ask/route.ts builds its whole system prompt from
// buildSystemPrompt(moduleConfig, record) — the record and nothing else.
// Ask "why did I do it this way?" on a record and the model has the row in
// front of it and no idea that the decision was argued out in chat three
// days ago. The chat side has the opposite half of the same picture and
// neither can see the other.
//
// This finds the turns of the user's own conversations that are actually
// about THIS record, and returns them small enough to attach.
//
// HOW A TURN IS "ABOUT" A RECORD: its text mentions the record's headline,
// folded for case, accents and final sigma — the same match
// lib/chat/entity-mentions.ts uses in the other direction, through the
// same normaliser, so a record found by chat is a record that finds chat
// back. Symmetry here is not elegance: two different match rules would
// mean "Καφές" links one way and not the other, which reads as the feature
// being broken at random.
//
// THE SCAN IS RECENCY-BOUNDED, same trade-off entity-mentions makes with
// its 50-rows-per-module cap. A record discussed a year ago and never
// since will not be found. The alternative is an unbounded scan of every
// message the account has ever sent on every question asked about any
// record, which is not a trade — it is just the expensive option.

/** Most recent messages considered. One query, bounded cost per request. */
const MESSAGE_SCAN_LIMIT = 150;

/** A matched turn is trimmed to this before it is ever scored or shown. */
const MAX_EXCERPT_CHARS = 320;

/**
 * The gate's settings, exported so the test and the measurement script use
 * the shipped numbers rather than their own copies.
 *
 * minScore 0.12 is a FLOOR, not the relevance test.
 *
 * What makes a turn relevant here is that it is about this record — it
 * names it. The question then decides which of those turns come first and
 * the budget decides how many fit. This number only exists to drop pairs
 * that share nothing at all with the question, which matters when a
 * headline is a common word ("Notes", "Test") and matches conversations
 * about something else entirely.
 *
 * It was 0.34, chosen to sound strict, and at 0.34 the measurement script
 * showed the gate returning NOTHING for "why did you do it that way?" —
 * the exact question this feature was built for. A threshold that is
 * strict about the wrong axis is not caution, it is a feature that does
 * not run.
 */
export const RECORD_CONVERSATION_RELEVANCE = {
  minScore: 0.12,
  budgetChars: 1200,
  maxItems: 4,
} as const;

export type RelevantTurn = {
  role: "user" | "assistant";
  excerpt: string;
  createdAt: string;
};

export type RecordConversationContext = {
  turns: RelevantTurn[];
  /** Characters the turns contribute — the cost, readable. */
  chars: number;
  scanned: number;
  mentioning: number;
  droppedForScore: number;
  droppedForBudget: number;
};

export const EMPTY_RECORD_CONVERSATION: RecordConversationContext = {
  turns: [],
  chars: 0,
  scanned: 0,
  mentioning: 0,
  droppedForScore: 0,
  droppedForBudget: 0,
};

function excerpt(content: string): string {
  const flat = content.replace(/\s+/g, " ").trim();
  return flat.length <= MAX_EXCERPT_CHARS ? flat : `${flat.slice(0, MAX_EXCERPT_CHARS - 1)}…`;
}

/**
 * Conversation turns about `headline`, ranked by how well they answer
 * `question`, capped by the budget above.
 *
 * Never throws: a missing conversation is a thinner answer, not a failed
 * one. The record itself is always in the prompt regardless.
 */
export async function loadRecordConversationContext(
  supabase: SupabaseClient,
  userId: string,
  headline: string,
  question: string
): Promise<RecordConversationContext> {
  const needle = normalizeForSearch(headline);
  // A one- or two-character headline would match nearly every message.
  if (needle.length < 3) return EMPTY_RECORD_CONVERSATION;

  try {
    const { data, error } = await supabase
      .from("chat_messages")
      .select("role, content, created_at")
      // EXPLICIT rather than left to RLS, for the same reason
      // lib/user-context.ts spells it out: this shape of query also runs
      // under the service-role client elsewhere, where RLS does not apply.
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(MESSAGE_SCAN_LIMIT);

    if (error || !data) {
      if (error) logApiError("record-conversation-context", error, { stage: "scan" });
      return EMPTY_RECORD_CONVERSATION;
    }

    // Chronological, because adjacency is the whole point below and the
    // query returns newest-first.
    const rows = (data as { role: string; content: string | null; created_at: string }[])
      .filter((r) => (r.role === "user" || r.role === "assistant") && typeof r.content === "string")
      .reverse();

    // A QUESTION AND ITS ANSWER ARE ONE THING.
    //
    // Scoring every turn on its own against the question looked right and
    // was measurably wrong: asked "why did you do it that way about the
    // zero cost?", the user's own turn mentioning "μηδενικό κόστος" scored
    // 0.20 and the assistant turn holding the actual reasoning — "return
    // null rather than Infinity, so the caller decides" — scored lower
    // still, because an ANSWER does not repeat the words of the QUESTION.
    // The gate selected nothing, on the exact case the feature exists for.
    // (scripts/cross-module-context-cost.mjs prints this; it is what
    // caught it.)
    //
    // So the unit is the pair. A user turn that mentions the record brings
    // the assistant turn that followed it, whether or not that reply names
    // the record again — which is how a conversation actually reads.
    const groups: { turns: RelevantTurn[]; text: string }[] = [];
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      if (!normalizeForSearch(row.content).includes(needle)) continue;
      const turns: RelevantTurn[] = [
        { role: row.role as "user" | "assistant", excerpt: excerpt(row.content as string), createdAt: row.created_at },
      ];
      const next = rows[i + 1];
      if (row.role === "user" && next?.role === "assistant") {
        turns.push({ role: "assistant", excerpt: excerpt(next.content as string), createdAt: next.created_at });
        i++; // consumed — do not also offer the reply as its own group
      }
      groups.push({ turns, text: turns.map((t) => t.excerpt).join(" ") });
    }

    // Mentioning the record is the relevance test that matters; the
    // question only decides ORDER, and the budget decides how much
    // survives. minScore stays as a floor for the case where a headline is
    // a common word ("Notes", "Test") and matches conversations that have
    // nothing to do with the record — but it is applied to the pair, so an
    // answer is never judged apart from what it answers.
    const selection = selectWithinBudget(
      question,
      groups,
      (g) => g.text,
      RECORD_CONVERSATION_RELEVANCE
    );

    const turns = selection.selected.flatMap((g) => g.turns);
    return {
      turns,
      chars: selection.chars,
      scanned: rows.length,
      mentioning: groups.length,
      droppedForScore: selection.droppedForScore,
      droppedForBudget: selection.droppedForBudget,
    };
  } catch (err) {
    logApiError("record-conversation-context", err, { stage: "unexpected" });
    return EMPTY_RECORD_CONVERSATION;
  }
}

/**
 * The prompt fragment. Empty string when nothing was relevant — an empty
 * heading ("Related conversation:" followed by nothing) is worse than
 * silence: it invites the model to invent what should have been under it.
 */
export function buildRecordConversationPromptAddition(
  context: RecordConversationContext
): string {
  if (context.turns.length === 0) return "";
  const lines = context.turns
    .map((t) => {
      const who = t.role === "user" ? "Ο χρήστης" : "Εσύ";
      const day = t.createdAt.slice(0, 10);
      return `- [${day}] ${who}: ${t.excerpt}`;
    })
    .join("\n");
  // The date is not decoration. Without it the model presents a decision
  // from March as current, which is the failure mode this feature is most
  // likely to introduce.
  return (
    `\n\nΑπό προηγούμενες συνομιλίες του χρήστη για ΑΥΤΗ την καταγραφή ` +
    `(παλαιότερα μηνύματα — αν κάτι έχει αλλάξει έκτοτε, μέτρα το τωρινό ` +
    `περιεχόμενο της καταγραφής, όχι αυτά):\n${lines}`
  );
}

/** For the measurement script and the logs: what this cost, in the same
 *  units the billing path uses. */
export function recordConversationTokenCost(context: RecordConversationContext): number {
  return estimateTokens(buildRecordConversationPromptAddition(context).length);
}
