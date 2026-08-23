import "server-only";
import { logApiError } from "@/lib/log-error";
import {
  MAX_ITEM_CHARS,
  selectCrossContext,
  renderCrossContext,
  type ContextCandidate,
  type CrossSelection,
} from "@/lib/ai/cross-module-context";

/**
 * READING THE OTHER SIDE'S HISTORY (V4 #36).
 *
 * The selection is pure (cross-module-context.ts); this is the IO, and
 * every query here has three properties that are not negotiable:
 *
 *   THROUGH THE USER'S OWN RLS-SCOPED CLIENT, never the admin client.
 *   This loads one person's history into a prompt, so the row filter must
 *   be the database's and not a `.eq("user_id", ...)` somebody can forget.
 *   That is the same reason loadWorkspaceContext takes a client rather
 *   than making one.
 *
 *   A HARD ROW LIMIT BEFORE RELEVANCE, not after. Selection is cheap but
 *   it is not free, and a user with four thousand coding sessions must
 *   not pay for scoring all of them on every chat message. The newest 40
 *   is the pool; anything older is not what "remember the function you
 *   wrote?" means.
 *
 *   A FAILURE IS AN EMPTY CONTEXT, never an error. This is an
 *   enhancement to a request that worked without it, and losing somebody
 *   their chat message because a history query timed out would be a
 *   strictly worse product than not having the feature.
 */

/** The pool relevance runs over. Newest first. */
const POOL_ROWS = 40;

/** Nothing older than this is what "the function you wrote" means, and
 *  scoring it wastes the budget on things the user has forgotten too. */
const MAX_AGE_DAYS = 90;

type SupabaseLike = {
  from: (table: string) => {
    select: (cols: string) => {
      order: (col: string, opts: { ascending: boolean }) => {
        limit: (n: number) => PromiseLike<{ data: unknown; error: unknown }>;
      };
    };
  };
};

export type CrossContextResult = {
  text: string;
  selection: CrossSelection;
  /** Rows considered. Reported so a caller can say "searched 12 sessions"
   *  rather than leaving the user to guess what was looked at. */
  pool: number;
};

const EMPTY: CrossContextResult = {
  text: "",
  selection: { chosen: [], reason: "not loaded", chars: 0 },
  pool: 0,
};

/**
 * The user's own coding sessions, for the CHAT prompt.
 *
 * WHAT GOES IN THE TERMS AND WHAT GOES IN THE TEXT ARE DIFFERENT THINGS,
 * and conflating them is how this feature would fail quietly.
 *
 * The TERMS are what the session should be FOUND by: its title, the
 * language, the operation, and the words of the request the user made.
 * The TEXT is what the model is shown: the request and a clamped head of
 * the output. Scoring the whole output would make every session match
 * every question — a 3,000-character code listing contains most words —
 * and the threshold would stop meaning anything.
 */
export async function loadCodingContextForChat(
  supabase: SupabaseLike,
  question: string
): Promise<CrossContextResult> {
  try {
    const { data, error } = await supabase
      .from("code_sessions")
      .select("id, operation, title, input, language, target_language, output, status, created_at")
      .order("created_at", { ascending: false })
      .limit(POOL_ROWS);
    if (error) throw error;

    const rows = (data ?? []) as Record<string, unknown>[];
    const cutoff = Date.now() - MAX_AGE_DAYS * 86_400_000;
    const candidates: ContextCandidate[] = rows
      // A FAILED SESSION PRODUCED NOTHING. Offering it as "the function
      // you wrote" would be offering a row where the output column is
      // null, which the model would then describe.
      .filter((r) => r.status === "done" && typeof r.output === "string" && r.output.trim() !== "")
      .map((r) => {
        const atMs = Date.parse(String(r.created_at ?? "")) || 0;
        const title = String(r.title ?? "");
        const input = String(r.input ?? "");
        const operation = String(r.operation ?? "");
        const language = String(r.language ?? "");
        return {
          id: String(r.id),
          atMs,
          terms: [
            ...title.split(/[^\p{L}\p{N}]+/u),
            ...input.split(/[^\p{L}\p{N}]+/u).slice(0, 60),
            operation,
            operation.replace(/_/g, " "),
            language,
            String(r.target_language ?? ""),
          ].filter((t) => t.length >= 3),
          text: `${dateOnly(atMs)} ${operation}${language ? ` (${language})` : ""}: ${title}\n  asked: ${clampOneLine(input, 120)}\n  produced: ${clampOneLine(String(r.output ?? ""), MAX_ITEM_CHARS - 160)}`,
        };
      })
      .filter((c) => c.atMs >= cutoff);

    const selection = selectCrossContext({ question, candidates, kind: "coding" });
    return { text: renderCrossContext(selection, "coding"), selection, pool: candidates.length };
  } catch (err) {
    logApiError("ai:cross-module", err, { stage: "coding_for_chat" });
    return EMPTY;
  }
}

/**
 * The user's own chat turns, for the CODING prompt.
 *
 * ONLY THE ASSISTANT'S OWN TURNS AND THE USER'S QUESTIONS THAT PRECEDED
 * THEM would be the complete answer; only the user's turns is the cheap
 * one and it is wrong for "why did you do it that way?" — the reason is
 * in what the model SAID. So both roles are candidates, and the role is
 * carried into the text, because "you said" and "I said" are different
 * claims and a model handed unlabelled turns will attribute them wrongly.
 */
export async function loadChatContextForCoding(
  supabase: SupabaseLike,
  question: string
): Promise<CrossContextResult> {
  try {
    const { data, error } = await supabase
      .from("chat_messages")
      .select("id, role, content, created_at")
      .order("created_at", { ascending: false })
      .limit(POOL_ROWS);
    if (error) throw error;

    const rows = (data ?? []) as Record<string, unknown>[];
    const cutoff = Date.now() - MAX_AGE_DAYS * 86_400_000;
    const candidates: ContextCandidate[] = rows
      .map((r) => {
        const atMs = Date.parse(String(r.created_at ?? "")) || 0;
        const content = String(r.content ?? "");
        const role = r.role === "assistant" ? "assistant" : "user";
        return {
          id: String(r.id),
          atMs,
          // SCORED ON THE FIRST 60 WORDS, not the whole turn. A long
          // assistant answer contains most words in the language, and
          // scoring all of it makes every turn match every question.
          terms: content.split(/[^\p{L}\p{N}]+/u).slice(0, 60).filter((t) => t.length >= 3),
          text: `${dateOnly(atMs)} ${role === "assistant" ? "you said" : "they asked"}: ${clampOneLine(content, MAX_ITEM_CHARS - 40)}`,
        };
      })
      .filter((c) => c.atMs >= cutoff && c.terms.length > 0);

    const selection = selectCrossContext({ question, candidates, kind: "chat" });
    return { text: renderCrossContext(selection, "chat"), selection, pool: candidates.length };
  } catch (err) {
    logApiError("ai:cross-module", err, { stage: "chat_for_coding" });
    return EMPTY;
  }
}

function clampOneLine(text: string, max: number): string {
  const t = (text ?? "").replace(/\s+/g, " ").trim();
  if (max <= 1) return "";
  return t.length > max ? `${t.slice(0, max - 1)}…` : t;
}

function dateOnly(ms: number): string {
  if (!ms) return "";
  return new Date(ms).toISOString().slice(0, 10);
}
